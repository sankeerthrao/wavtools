import { StreamProcessorSrc } from './worklets/stream_processor.js';
import { AudioAnalysis } from './analysis/audio_analysis.js';

/**
 * Plays audio streams received in raw PCM16 chunks from the browser
 * @class
 */
export class WavStreamPlayer {
  /**
   * Creates a new WavStreamPlayer instance
   * @param {{sampleRate?: number}} options
   * @returns {WavStreamPlayer}
   */
  constructor({ sampleRate = 44100 } = {}) {
    this.scriptSrc = StreamProcessorSrc;
    this.sampleRate = sampleRate;
    this.context = null;
    this.stream = null;
    this.analyser = null;
    this.trackSampleOffsets = {};
    this.interruptedTrackIds = {};
    // Feature 3: Volume/Gain Control
    this.gainNode = null;
    this._volume = 1.0;
    // Feature 5: Event Emitter System
    this._eventListeners = {};
    // Feature 10: Playback Speed Control
    this._playbackRate = 1.0;
    // Feature 11: Fade In/Out
    this._fadeGainNode = null;
    // Feature 14: Queue Management
    this._queuedBytes = 0;
    this._queuedSamples = 0;
    this._playing = false;
  }

  /**
   * Connects the audio context and enables output to speakers
   * @returns {Promise<true>}
   */
  async connect() {
    this.context = new AudioContext({ sampleRate: this.sampleRate });
    if (this.context.state === 'suspended') {
      await this.context.resume();
    }
    try {
      await this.context.audioWorklet.addModule(this.scriptSrc);
    } catch (e) {
      console.error(e);
      throw new Error(`Could not add audioWorklet module: ${this.scriptSrc}`);
    }
    const analyser = this.context.createAnalyser();
    analyser.fftSize = 8192;
    analyser.smoothingTimeConstant = 0.1;
    this.analyser = analyser;
    // Feature 3: Create gain node
    this.gainNode = this.context.createGain();
    this.gainNode.gain.value = this._volume;
    // Feature 11: Create fade gain node
    this._fadeGainNode = this.context.createGain();
    this._fadeGainNode.gain.value = 1.0;
    return true;
  }

  /**
   * Gets the current frequency domain data from the playing track
   * @param {"frequency"|"music"|"voice"} [analysisType]
   * @param {number} [minDecibels] default -100
   * @param {number} [maxDecibels] default -30
   * @returns {import('./analysis/audio_analysis.js').AudioAnalysisOutputType}
   */
  getFrequencies(
    analysisType = 'frequency',
    minDecibels = -100,
    maxDecibels = -30
  ) {
    if (!this.analyser) {
      throw new Error('Not connected, please call .connect() first');
    }
    return AudioAnalysis.getFrequencies(
      this.analyser,
      this.sampleRate,
      null,
      analysisType,
      minDecibels,
      maxDecibels
    );
  }

  /**
   * Gets the current time-domain waveform data from the playing track
   * @param {number} [downsampleFactor] Factor to reduce data points (default 1)
   * @returns {{values: Float32Array, length: number}}
   */
  getWaveform(downsampleFactor = 1) {
    if (!this.analyser) {
      throw new Error('Not connected, please call .connect() first');
    }
    return AudioAnalysis.getWaveform(this.analyser, downsampleFactor);
  }

  /**
   * Starts audio streaming
   * @private
   * @returns {Promise<true>}
   */
  _start() {
    const streamNode = new AudioWorkletNode(this.context, 'stream_processor');
    // Route: streamNode -> fadeGain -> gainNode -> analyser -> destination
    streamNode.connect(this._fadeGainNode);
    this._fadeGainNode.connect(this.gainNode);
    this.gainNode.connect(this.context.destination);
    this.analyser.disconnect();
    this.gainNode.connect(this.analyser);
    streamNode.port.onmessage = (e) => {
      const { event } = e.data;
      if (event === 'stop') {
        streamNode.disconnect();
        this.stream = null;
        this._playing = false;
        this._queuedSamples = 0;
        this._emit('playbackEnd', {});
      } else if (event === 'offset') {
        const { requestId, trackId, offset } = e.data;
        const currentTime = offset / this.sampleRate;
        this.trackSampleOffsets[requestId] = { trackId, offset, currentTime };
      }
    };
    this.stream = streamNode;
    this._playing = true;
    this._emit('playbackStart', {});
    return true;
  }

  /**
   * Adds 16BitPCM data to the currently playing audio stream
   * You can add chunks beyond the current play point and they will be queued for play
   * @param {ArrayBuffer|Int16Array} arrayBuffer
   * @param {string} [trackId]
   * @returns {Int16Array}
   */
  add16BitPCM(arrayBuffer, trackId = 'default') {
    if (typeof trackId !== 'string') {
      throw new Error(`trackId must be a string`);
    } else if (this.interruptedTrackIds[trackId]) {
      return;
    }
    if (!this.stream) {
      this._start();
    }
    let buffer;
    if (arrayBuffer instanceof Int16Array) {
      buffer = arrayBuffer;
    } else if (arrayBuffer instanceof ArrayBuffer) {
      buffer = new Int16Array(arrayBuffer);
    } else {
      throw new Error(`argument must be Int16Array or ArrayBuffer`);
    }
    this.stream.port.postMessage({ event: 'write', buffer, trackId });
    // Feature 14: Track queue
    this._queuedSamples += buffer.length;
    this._emit('trackChange', { trackId, samples: buffer.length });
    return buffer;
  }

  /**
   * Gets the offset (sample count) of the currently playing stream
   * @param {boolean} [interrupt]
   * @returns {{trackId: string|null, offset: number, currentTime: number}}
   */
  async getTrackSampleOffset(interrupt = false) {
    if (!this.stream) {
      return null;
    }
    const requestId = crypto.randomUUID();
    this.stream.port.postMessage({
      event: interrupt ? 'interrupt' : 'offset',
      requestId,
    });
    let trackSampleOffset;
    while (!trackSampleOffset) {
      trackSampleOffset = this.trackSampleOffsets[requestId];
      await new Promise((r) => setTimeout(() => r(), 1));
    }
    const { trackId } = trackSampleOffset;
    if (interrupt && trackId) {
      this.interruptedTrackIds[trackId] = true;
    }
    return trackSampleOffset;
  }

  /**
   * Strips the current stream and returns the sample offset of the audio
   * @param {boolean} [interrupt]
   * @returns {{trackId: string|null, offset: number, currentTime: number}}
   */
  async interrupt() {
    return this.getTrackSampleOffset(true);
  }

  // ===== Feature 3: Volume/Gain Control =====

  /**
   * Sets the output volume for playback
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
   * Gets the current output volume
   * @returns {number}
   */
  getVolume() {
    return this._volume;
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

  // ===== Feature 9: Audio Level Metering =====

  /**
   * Gets the current audio output level (RMS and peak)
   * @returns {{rms: number, peak: number}}
   */
  getLevel() {
    if (!this.analyser) {
      throw new Error('Not connected, please call .connect() first');
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

  // ===== Feature 10: Playback Speed Control =====

  /**
   * Sets the playback rate
   * @param {number} rate Value between 0.5 and 2.0
   * @returns {true}
   */
  setPlaybackRate(rate) {
    if (typeof rate !== 'number' || rate < 0.5 || rate > 2.0) {
      throw new Error('Playback rate must be a number between 0.5 and 2.0');
    }
    this._playbackRate = rate;
    if (this.stream) {
      this.stream.port.postMessage({ event: 'setPlaybackRate', rate });
    }
    return true;
  }

  /**
   * Gets the current playback rate
   * @returns {number}
   */
  getPlaybackRate() {
    return this._playbackRate;
  }

  // ===== Feature 11: Fade In/Out =====

  /**
   * Applies a fade-in effect over the specified duration
   * @param {number} durationMs Duration of fade in milliseconds
   * @returns {true}
   */
  fadeIn(durationMs = 500) {
    if (!this._fadeGainNode) {
      throw new Error('Not connected, please call .connect() first');
    }
    const currentTime = this.context.currentTime;
    this._fadeGainNode.gain.setValueAtTime(0, currentTime);
    this._fadeGainNode.gain.linearRampToValueAtTime(
      1.0,
      currentTime + durationMs / 1000,
    );
    return true;
  }

  /**
   * Applies a fade-out effect over the specified duration
   * @param {number} durationMs Duration of fade in milliseconds
   * @returns {true}
   */
  fadeOut(durationMs = 500) {
    if (!this._fadeGainNode) {
      throw new Error('Not connected, please call .connect() first');
    }
    const currentTime = this.context.currentTime;
    this._fadeGainNode.gain.setValueAtTime(
      this._fadeGainNode.gain.value,
      currentTime,
    );
    this._fadeGainNode.gain.linearRampToValueAtTime(
      0,
      currentTime + durationMs / 1000,
    );
    return true;
  }

  // ===== Feature 14: Playback Queue Management =====

  /**
   * Returns whether audio is currently playing
   * @returns {boolean}
   */
  isPlaying() {
    return this._playing;
  }

  /**
   * Gets the total number of samples queued for playback
   * @returns {number}
   */
  getQueuedSamples() {
    return this._queuedSamples;
  }

  /**
   * Gets the estimated duration of queued audio in seconds
   * @returns {number}
   */
  getQueueDuration() {
    return this._queuedSamples / this.sampleRate;
  }

  /**
   * Clears the playback queue by interrupting the current stream
   * @returns {Promise<void>}
   */
  async clearQueue() {
    if (this.stream) {
      await this.interrupt();
      this._queuedSamples = 0;
      this.interruptedTrackIds = {};
    }
  }
}

globalThis.WavStreamPlayer = WavStreamPlayer;
