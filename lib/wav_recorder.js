import { AudioProcessorSrc } from './worklets/audio_processor.js';
import { AudioAnalysis } from './analysis/audio_analysis.js';
import { WavPacker } from './wav_packer.js';

/**
 * Decodes audio into a wav file
 * @typedef {Object} DecodedAudioType
 * @property {Blob} blob
 * @property {string} url
 * @property {Float32Array} values
 * @property {AudioBuffer} audioBuffer
 */

/**
 * Records live stream of user audio as PCM16 "audio/wav" data
 * @class
 */
export class WavRecorder {
  /**
   * Create a new WavRecorder instance
   * @param {{sampleRate?: number, outputToSpeakers?: boolean, debug?: boolean}} [options]
   * @returns {WavRecorder}
   */
  constructor({
    sampleRate = 44100,
    outputToSpeakers = false,
    debug = false,
  } = {}) {
    // Script source
    this.scriptSrc = AudioProcessorSrc;
    // Config
    this.sampleRate = sampleRate;
    this.outputToSpeakers = outputToSpeakers;
    this.debug = !!debug;
    this._deviceChangeCallback = null;
    this._devices = [];
    // State variables
    this.stream = null;
    this.processor = null;
    this.source = null;
    this.node = null;
    this.recording = false;
    this.gainNode = null;
    this._volume = 1.0;
    // Duration tracking (Feature 4)
    this._recordingStartTime = null;
    this._recordedDuration = 0;
    // Event emitter (Feature 5)
    this._eventListeners = {};
    // Voice activity detection (Feature 6)
    this._vadEnabled = false;
    this._vadThreshold = 0.01;
    this._vadDebounceMs = 300;
    this._vadSpeaking = false;
    this._vadLastSpeechTime = 0;
    this._vadSilenceTimer = null;
    // Auto-stop (Feature 13)
    this._autoStopEnabled = false;
    this._autoStopDurationMs = null;
    this._autoStopSilenceMs = null;
    this._autoStopTimer = null;
    // Event handling with AudioWorklet
    this._lastEventId = 0;
    this.eventReceipts = {};
    this.eventTimeout = 5000;
    // Process chunks of audio
    this._chunkProcessor = () => {};
    this._chunkProcessorSize = void 0;
    this._chunkProcessorBuffer = {
      raw: new ArrayBuffer(0),
      mono: new ArrayBuffer(0),
    };
  }

  /**
   * Decodes audio data from multiple formats to a Blob, url, Float32Array and AudioBuffer
   * @param {Blob|Float32Array|Int16Array|ArrayBuffer|number[]} audioData
   * @param {number} sampleRate
   * @param {number} fromSampleRate
   * @returns {Promise<DecodedAudioType>}
   */
  static async decode(audioData, sampleRate = 44100, fromSampleRate = -1) {
    const context = new AudioContext({ sampleRate });
    let arrayBuffer;
    let blob;
    if (audioData instanceof Blob) {
      if (fromSampleRate !== -1) {
        throw new Error(
          `Can not specify "fromSampleRate" when reading from Blob`,
        );
      }
      blob = audioData;
      arrayBuffer = await blob.arrayBuffer();
    } else if (audioData instanceof ArrayBuffer) {
      if (fromSampleRate !== -1) {
        throw new Error(
          `Can not specify "fromSampleRate" when reading from ArrayBuffer`,
        );
      }
      arrayBuffer = audioData;
      blob = new Blob([arrayBuffer], { type: 'audio/wav' });
    } else {
      let float32Array;
      let data;
      if (audioData instanceof Int16Array) {
        data = audioData;
        float32Array = new Float32Array(audioData.length);
        for (let i = 0; i < audioData.length; i++) {
          float32Array[i] = audioData[i] / 0x8000;
        }
      } else if (audioData instanceof Float32Array) {
        float32Array = audioData;
      } else if (audioData instanceof Array) {
        float32Array = new Float32Array(audioData);
      } else {
        throw new Error(
          `"audioData" must be one of: Blob, Float32Arrray, Int16Array, ArrayBuffer, Array<number>`,
        );
      }
      if (fromSampleRate === -1) {
        throw new Error(
          `Must specify "fromSampleRate" when reading from Float32Array, In16Array or Array`,
        );
      } else if (fromSampleRate < 3000) {
        throw new Error(`Minimum "fromSampleRate" is 3000 (3kHz)`);
      }
      if (!data) {
        data = WavPacker.floatTo16BitPCM(float32Array);
      }
      const audio = {
        bitsPerSample: 16,
        channels: [float32Array],
        data,
      };
      const packer = new WavPacker();
      const result = packer.pack(fromSampleRate, audio);
      blob = result.blob;
      arrayBuffer = await blob.arrayBuffer();
    }
    const audioBuffer = await context.decodeAudioData(arrayBuffer);
    const values = audioBuffer.getChannelData(0);
    const url = URL.createObjectURL(blob);
    return {
      blob,
      url,
      values,
      audioBuffer,
    };
  }

  /**
   * Logs data in debug mode
   * @param {...any} arguments
   * @returns {true}
   */
  log() {
    if (this.debug) {
      // eslint-disable-next-line no-console
      console.log(...arguments);
    }
    return true;
  }

  /**
   * Retrieves the current sampleRate for the recorder
   * @returns {number}
   */
  getSampleRate() {
    return this.sampleRate;
  }

  /**
   * Retrieves the current status of the recording
   * @returns {"ended"|"paused"|"recording"}
   */
  getStatus() {
    if (!this.processor) {
      return 'ended';
    } else if (!this.recording) {
      return 'paused';
    } else {
      return 'recording';
    }
  }

  /**
   * Sends an event to the AudioWorklet
   * @private
   * @param {string} name
   * @param {{[key: string]: any}} data
   * @param {AudioWorkletNode} [_processor]
   * @returns {Promise<{[key: string]: any}>}
   */
  async _event(name, data = {}, _processor = null) {
    _processor = _processor || this.processor;
    if (!_processor) {
      throw new Error('Can not send events without recording first');
    }
    const message = {
      event: name,
      id: this._lastEventId++,
      data,
    };
    _processor.port.postMessage(message);
    const t0 = new Date().valueOf();
    while (!this.eventReceipts[message.id]) {
      if (new Date().valueOf() - t0 > this.eventTimeout) {
        throw new Error(`Timeout waiting for "${name}" event`);
      }
      await new Promise((res) => setTimeout(() => res(true), 1));
    }
    const payload = this.eventReceipts[message.id];
    delete this.eventReceipts[message.id];
    return payload;
  }

  /**
   * Sets device change callback, remove if callback provided is `null`
   * @param {(Array<MediaDeviceInfo & {default: boolean}>): void|null} callback
   * @returns {true}
   */
  listenForDeviceChange(callback) {
    if (callback === null && this._deviceChangeCallback) {
      navigator.mediaDevices.removeEventListener(
        'devicechange',
        this._deviceChangeCallback,
      );
      this._deviceChangeCallback = null;
    } else if (callback !== null) {
      // Basically a debounce; we only want this called once when devices change
      // And we only want the most recent callback() to be executed
      // if a few are operating at the same time
      let lastId = 0;
      let lastDevices = [];
      const serializeDevices = (devices) =>
        devices
          .map((d) => d.deviceId)
          .sort()
          .join(',');
      const cb = async () => {
        let id = ++lastId;
        const devices = await this.listDevices();
        if (id === lastId) {
          if (serializeDevices(lastDevices) !== serializeDevices(devices)) {
            lastDevices = devices;
            callback(devices.slice());
          }
        }
      };
      navigator.mediaDevices.addEventListener('devicechange', cb);
      cb();
      this._deviceChangeCallback = cb;
    }
    return true;
  }

  /**
   * Manually request permission to use the microphone
   * @returns {Promise<true>}
   */
  async requestPermission() {
    const permissionStatus = await navigator.permissions.query({
      name: 'microphone',
    });
    if (permissionStatus.state === 'denied') {
      window.alert('You must grant microphone access to use this feature.');
    } else if (permissionStatus.state === 'prompt') {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        const tracks = stream.getTracks();
        tracks.forEach((track) => track.stop());
      } catch (e) {
        window.alert('You must grant microphone access to use this feature.');
      }
    }
    return true;
  }

  /**
   * List all eligible devices for recording, will request permission to use microphone
   * @returns {Promise<Array<MediaDeviceInfo & {default: boolean}>>}
   */
  async listDevices() {
    if (
      !navigator.mediaDevices ||
      !('enumerateDevices' in navigator.mediaDevices)
    ) {
      throw new Error('Could not request user devices');
    }
    await this.requestPermission();
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioDevices = devices.filter(
      (device) => device.kind === 'audioinput',
    );
    const defaultDeviceIndex = audioDevices.findIndex(
      (device) => device.deviceId === 'default',
    );
    const deviceList = [];
    if (defaultDeviceIndex !== -1) {
      let defaultDevice = audioDevices.splice(defaultDeviceIndex, 1)[0];
      let existingIndex = audioDevices.findIndex(
        (device) => device.groupId === defaultDevice.groupId,
      );
      if (existingIndex !== -1) {
        defaultDevice = audioDevices.splice(existingIndex, 1)[0];
      }
      defaultDevice.default = true;
      deviceList.push(defaultDevice);
    }
    return deviceList.concat(audioDevices);
  }

  /**
   * Begins a recording session and requests microphone permissions if not already granted
   * Microphone recording indicator will appear on browser tab but status will be "paused"
   * @param {string} [deviceId] if no device provided, default device will be used
   * @returns {Promise<true>}
   */
  async begin(deviceId) {
    if (this.processor) {
      throw new Error(
        `Already connected: please call .end() to start a new session`,
      );
    }

    if (
      !navigator.mediaDevices ||
      !('getUserMedia' in navigator.mediaDevices)
    ) {
      throw new Error('Could not request user media');
    }
    try {
      const config = { audio: true };
      if (deviceId) {
        config.audio = { deviceId: { exact: deviceId } };
      }
      this.stream = await navigator.mediaDevices.getUserMedia(config);
    } catch (err) {
      throw new Error('Could not start media stream');
    }

    const context = new AudioContext({ sampleRate: this.sampleRate });
    const source = context.createMediaStreamSource(this.stream);
    // Create gain node for volume control (Feature 3)
    const gainNode = context.createGain();
    gainNode.gain.value = this._volume;
    source.connect(gainNode);
    // Load and execute the module script.
    try {
      await context.audioWorklet.addModule(this.scriptSrc);
    } catch (e) {
      console.error(e);
      throw new Error(`Could not add audioWorklet module: ${this.scriptSrc}`);
    }
    const processor = new AudioWorkletNode(context, 'audio_processor');
    processor.port.onmessage = (e) => {
      const { event, id, data } = e.data;
      if (event === 'receipt') {
        this.eventReceipts[id] = data;
      } else if (event === 'chunk') {
        // Voice Activity Detection (Feature 6)
        if (this._vadEnabled) {
          this._processVAD(data);
        }
        if (this._chunkProcessorSize) {
          const buffer = this._chunkProcessorBuffer;
          this._chunkProcessorBuffer = {
            raw: WavPacker.mergeBuffers(buffer.raw, data.raw),
            mono: WavPacker.mergeBuffers(buffer.mono, data.mono),
          };
          if (
            this._chunkProcessorBuffer.mono.byteLength >=
            this._chunkProcessorSize
          ) {
            this._chunkProcessor(this._chunkProcessorBuffer);
            this._chunkProcessorBuffer = {
              raw: new ArrayBuffer(0),
              mono: new ArrayBuffer(0),
            };
          }
        } else {
          this._chunkProcessor(data);
        }
      }
    };

    const node = gainNode.connect(processor);
    const analyser = context.createAnalyser();
    analyser.fftSize = 8192;
    analyser.smoothingTimeConstant = 0.1;
    node.connect(analyser);
    if (this.outputToSpeakers) {
      // eslint-disable-next-line no-console
      console.warn(
        'Warning: Output to speakers may affect sound quality,\n' +
          'especially due to system audio feedback preventative measures.\n' +
          'use only for debugging',
      );
      analyser.connect(context.destination);
    }

    this.source = source;
    this.node = node;
    this.analyser = analyser;
    this.processor = processor;
    this.gainNode = gainNode;
    return true;
  }

  /**
   * Gets the current frequency domain data from the recording track
   * @param {"frequency"|"music"|"voice"} [analysisType]
   * @param {number} [minDecibels] default -100
   * @param {number} [maxDecibels] default -30
   * @returns {import('./analysis/audio_analysis.js').AudioAnalysisOutputType}
   */
  getFrequencies(
    analysisType = 'frequency',
    minDecibels = -100,
    maxDecibels = -30,
  ) {
    if (!this.processor) {
      throw new Error('Session ended: please call .begin() first');
    }
    return AudioAnalysis.getFrequencies(
      this.analyser,
      this.sampleRate,
      null,
      analysisType,
      minDecibels,
      maxDecibels,
    );
  }

  /**
   * Gets the current time-domain waveform data from the recording track
   * @param {number} [downsampleFactor] Factor to reduce data points (default 1)
   * @returns {{values: Float32Array, length: number}}
   */
  getWaveform(downsampleFactor = 1) {
    if (!this.processor) {
      throw new Error('Session ended: please call .begin() first');
    }
    return AudioAnalysis.getWaveform(this.analyser, downsampleFactor);
  }

  /**
   * Pauses the recording
   * Keeps microphone stream open but halts storage of audio
   * @returns {Promise<true>}
   */
  async pause() {
    if (!this.processor) {
      throw new Error('Session ended: please call .begin() first');
    } else if (!this.recording) {
      throw new Error('Already paused: please call .record() first');
    }
    if (this._chunkProcessorBuffer.raw.byteLength) {
      this._chunkProcessor(this._chunkProcessorBuffer);
    }
    this.log('Pausing ...');
    await this._event('stop');
    this.recording = false;
    // Duration tracking (Feature 4)
    if (this._recordingStartTime) {
      this._recordedDuration += (Date.now() - this._recordingStartTime) / 1000;
      this._recordingStartTime = null;
    }
    // Clear auto-stop timer (Feature 13)
    if (this._autoStopTimer) {
      clearTimeout(this._autoStopTimer);
      this._autoStopTimer = null;
    }
    this._emit('paused', { duration: this._recordedDuration });
    return true;
  }

  /**
   * Start recording stream and storing to memory from the connected audio source
   * @param {(data: { mono: Int16Array; raw: Int16Array }) => any} [chunkProcessor]
   * @param {number} [chunkSize] chunkProcessor will not be triggered until this size threshold met in mono audio
   * @returns {Promise<true>}
   */
  async record(chunkProcessor = () => {}, chunkSize = 8192) {
    if (!this.processor) {
      throw new Error('Session ended: please call .begin() first');
    } else if (this.recording) {
      throw new Error('Already recording: please call .pause() first');
    } else if (typeof chunkProcessor !== 'function') {
      throw new Error(`chunkProcessor must be a function`);
    }
    this._chunkProcessor = chunkProcessor;
    this._chunkProcessorSize = chunkSize;
    this._chunkProcessorBuffer = {
      raw: new ArrayBuffer(0),
      mono: new ArrayBuffer(0),
    };
    this.log('Recording ...');
    await this._event('start');
    this.recording = true;
    // Duration tracking (Feature 4)
    this._recordingStartTime = Date.now();
    // Auto-stop timer (Feature 13)
    if (this._autoStopEnabled && this._autoStopDurationMs) {
      this._autoStopTimer = setTimeout(async () => {
        if (this.recording) {
          this._emit('autoStop', { reason: 'duration' });
          await this.pause();
        }
      }, this._autoStopDurationMs);
    }
    this._emit('recording', { sampleRate: this.sampleRate });
    return true;
  }

  /**
   * Clears the audio buffer, empties stored recording
   * @returns {Promise<true>}
   */
  async clear() {
    if (!this.processor) {
      throw new Error('Session ended: please call .begin() first');
    }
    await this._event('clear');
    return true;
  }

  /**
   * Reads the current audio stream data
   * @returns {Promise<{meanValues: Float32Array, channels: Array<Float32Array>}>}
   */
  async read() {
    if (!this.processor) {
      throw new Error('Session ended: please call .begin() first');
    }
    this.log('Reading ...');
    const result = await this._event('read');
    return result;
  }

  /**
   * Saves the current audio stream to a file
   * @param {boolean} [force] Force saving while still recording
   * @returns {Promise<import('./wav_packer.js').WavPackerAudioType>}
   */
  async save(force = false) {
    if (!this.processor) {
      throw new Error('Session ended: please call .begin() first');
    }
    if (!force && this.recording) {
      throw new Error(
        'Currently recording: please call .pause() first, or call .save(true) to force',
      );
    }
    this.log('Exporting ...');
    const exportData = await this._event('export');
    const packer = new WavPacker();
    const result = packer.pack(this.sampleRate, exportData.audio);
    return result;
  }

  /**
   * Ends the current recording session and saves the result
   * @returns {Promise<import('./wav_packer.js').WavPackerAudioType>}
   */
  async end() {
    if (!this.processor) {
      throw new Error('Session ended: please call .begin() first');
    }

    const _processor = this.processor;

    this.log('Stopping ...');
    await this._event('stop');
    this.recording = false;
    // Duration tracking (Feature 4)
    if (this._recordingStartTime) {
      this._recordedDuration += (Date.now() - this._recordingStartTime) / 1000;
      this._recordingStartTime = null;
    }
    const tracks = this.stream.getTracks();
    tracks.forEach((track) => track.stop());

    this.log('Exporting ...');
    const exportData = await this._event('export', {}, _processor);

    this.processor.disconnect();
    this.source.disconnect();
    this.node.disconnect();
    this.analyser.disconnect();
    if (this.gainNode) {
      this.gainNode.disconnect();
    }
    this.stream = null;
    this.processor = null;
    this.source = null;
    this.node = null;
    this.gainNode = null;

    // Clear auto-stop timer
    if (this._autoStopTimer) {
      clearTimeout(this._autoStopTimer);
      this._autoStopTimer = null;
    }

    const packer = new WavPacker();
    const result = packer.pack(this.sampleRate, exportData.audio);
    const duration = this._recordedDuration;
    this._recordedDuration = 0;
    this._emit('ended', { duration, result });
    return result;
  }

  /**
   * Performs a full cleanup of WavRecorder instance
   * Stops actively listening via microphone and removes existing listeners
   * @returns {Promise<true>}
   */
  async quit() {
    this.listenForDeviceChange(null);
    if (this.processor) {
      await this.end();
    }
    return true;
  }

  // ===== Feature 3: Volume/Gain Control =====

  /**
   * Sets the input volume/gain for recording
   * @param {number} volume Value between 0.0 (muted) and 1.0 (full volume)
   * @returns {true}
   */
  setVolume(volume) {
    if (typeof volume !== 'number' || volume < 0 || volume > 1) {
      throw new Error('Volume must be a number between 0.0 and 1.0');
    }
    this._volume = volume;
    if (this.gainNode) {
      this.gainNode.gain.value = volume;
    }
    this._emit('volumeChange', { volume });
    return true;
  }

  /**
   * Gets the current input volume/gain
   * @returns {number}
   */
  getVolume() {
    return this._volume;
  }

  // ===== Feature 4: Recording Duration Tracking =====

  /**
   * Gets the current recording duration in seconds
   * @returns {number}
   */
  getDuration() {
    if (!this._recordingStartTime) {
      return this._recordedDuration;
    }
    return (
      this._recordedDuration +
      (Date.now() - this._recordingStartTime) / 1000
    );
  }

  // ===== Feature 5: Event Emitter System =====

  /**
   * Registers an event listener
   * @param {string} eventName
   * @param {Function} callback
   * @returns {true}
   */
  on(eventName, callback) {
    if (typeof callback !== 'function') {
      throw new Error('Callback must be a function');
    }
    if (!this._eventListeners[eventName]) {
      this._eventListeners[eventName] = [];
    }
    this._eventListeners[eventName].push(callback);
    return true;
  }

  /**
   * Removes an event listener
   * @param {string} eventName
   * @param {Function} callback
   * @returns {true}
   */
  off(eventName, callback) {
    if (this._eventListeners[eventName]) {
      this._eventListeners[eventName] = this._eventListeners[eventName].filter(
        (cb) => cb !== callback,
      );
    }
    return true;
  }

  /**
   * Emits an event to all registered listeners
   * @private
   * @param {string} eventName
   * @param {any} data
   */
  _emit(eventName, data) {
    if (this._eventListeners[eventName]) {
      for (const cb of this._eventListeners[eventName]) {
        try {
          cb(data);
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error(`Error in "${eventName}" event listener:`, e);
        }
      }
    }
  }

  // ===== Feature 6: Voice Activity Detection =====

  /**
   * Enables voice activity detection
   * @param {{threshold?: number, debounceMs?: number}} [options]
   * @returns {true}
   */
  enableVAD({ threshold = 0.01, debounceMs = 300 } = {}) {
    this._vadEnabled = true;
    this._vadThreshold = threshold;
    this._vadDebounceMs = debounceMs;
    this._vadSpeaking = false;
    return true;
  }

  /**
   * Disables voice activity detection
   * @returns {true}
   */
  disableVAD() {
    this._vadEnabled = false;
    this._vadSpeaking = false;
    if (this._vadSilenceTimer) {
      clearTimeout(this._vadSilenceTimer);
      this._vadSilenceTimer = null;
    }
    return true;
  }

  /**
   * Gets current VAD speaking state
   * @returns {boolean}
   */
  isSpeaking() {
    return this._vadSpeaking;
  }

  /**
   * Processes audio chunk for voice activity detection
   * @private
   * @param {{mono: ArrayBuffer, raw: ArrayBuffer}} data
   */
  _processVAD(data) {
    const int16 = new Int16Array(data.mono);
    let sumSquares = 0;
    for (let i = 0; i < int16.length; i++) {
      const normalized = int16[i] / 0x8000;
      sumSquares += normalized * normalized;
    }
    const rms = Math.sqrt(sumSquares / int16.length);
    const isSpeech = rms > this._vadThreshold;

    if (isSpeech) {
      this._vadLastSpeechTime = Date.now();
      if (this._vadSilenceTimer) {
        clearTimeout(this._vadSilenceTimer);
        this._vadSilenceTimer = null;
      }
      if (!this._vadSpeaking) {
        this._vadSpeaking = true;
        this._emit('voiceStart', { rms });
      }
    } else if (this._vadSpeaking && !this._vadSilenceTimer) {
      this._vadSilenceTimer = setTimeout(() => {
        this._vadSpeaking = false;
        this._vadSilenceTimer = null;
        this._emit('voiceEnd', { duration: (Date.now() - this._vadLastSpeechTime) / 1000 });
        // Auto-stop on silence (Feature 13)
        if (this._autoStopEnabled && this._autoStopSilenceMs) {
          this._handleAutoStopSilence();
        }
      }, this._vadDebounceMs);
    }
  }

  // ===== Feature 9: Audio Level Metering =====

  /**
   * Gets the current audio input level (RMS and peak)
   * @returns {{rms: number, peak: number}}
   */
  getLevel() {
    if (!this.analyser) {
      throw new Error('Session ended: please call .begin() first');
    }
    const bufferLength = this.analyser.fftSize;
    const dataArray = new Float32Array(bufferLength);
    this.analyser.getFloatTimeDomainData(dataArray);
    let sumSquares = 0;
    let peak = 0;
    for (let i = 0; i < bufferLength; i++) {
      const abs = Math.abs(dataArray[i]);
      sumSquares += dataArray[i] * dataArray[i];
      if (abs > peak) {
        peak = abs;
      }
    }
    const rms = Math.sqrt(sumSquares / bufferLength);
    return { rms: Math.min(rms, 1), peak: Math.min(peak, 1) };
  }

  // ===== Feature 13: Recording Auto-Stop =====

  /**
   * Enables auto-stop for recording
   * @param {{durationMs?: number, silenceMs?: number}} options
   * @returns {true}
   */
  enableAutoStop({ durationMs = null, silenceMs = null } = {}) {
    if (!durationMs && !silenceMs) {
      throw new Error('Must specify at least one of durationMs or silenceMs');
    }
    this._autoStopEnabled = true;
    this._autoStopDurationMs = durationMs;
    this._autoStopSilenceMs = silenceMs;
    if (silenceMs && !this._vadEnabled) {
      this.enableVAD();
    }
    return true;
  }

  /**
   * Disables auto-stop for recording
   * @returns {true}
   */
  disableAutoStop() {
    this._autoStopEnabled = false;
    this._autoStopDurationMs = null;
    this._autoStopSilenceMs = null;
    if (this._autoStopTimer) {
      clearTimeout(this._autoStopTimer);
      this._autoStopTimer = null;
    }
    return true;
  }

  /**
   * Handles auto-stop due to silence
   * @private
   */
  async _handleAutoStopSilence() {
    if (this.recording) {
      this._emit('autoStop', { reason: 'silence' });
      await this.pause();
    }
  }
}

globalThis.WavRecorder = WavRecorder;
