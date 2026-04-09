/**
 * Utility class for converting between audio formats
 * Supports PCM16 <-> Float32, mono <-> stereo conversions
 * @class
 */
export class WavConverter {
  /**
   * Converts Float32Array to Int16Array (PCM16)
   * @param {Float32Array} float32Array
   * @returns {Int16Array}
   */
  static float32ToPCM16(float32Array) {
    if (!(float32Array instanceof Float32Array)) {
      throw new Error('Input must be a Float32Array');
    }
    const output = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return output;
  }

  /**
   * Converts Int16Array (PCM16) to Float32Array
   * @param {Int16Array} int16Array
   * @returns {Float32Array}
   */
  static pcm16ToFloat32(int16Array) {
    if (!(int16Array instanceof Int16Array)) {
      throw new Error('Input must be an Int16Array');
    }
    const output = new Float32Array(int16Array.length);
    for (let i = 0; i < int16Array.length; i++) {
      output[i] = int16Array[i] / 0x8000;
    }
    return output;
  }

  /**
   * Converts stereo interleaved audio to mono by averaging channels
   * @param {Float32Array} stereoData Interleaved stereo data [L, R, L, R, ...]
   * @returns {Float32Array} Mono audio data
   */
  static stereoToMono(stereoData) {
    if (!(stereoData instanceof Float32Array)) {
      throw new Error('Input must be a Float32Array');
    }
    if (stereoData.length % 2 !== 0) {
      throw new Error('Stereo data must have even number of samples');
    }
    const monoLength = stereoData.length / 2;
    const mono = new Float32Array(monoLength);
    for (let i = 0; i < monoLength; i++) {
      mono[i] = (stereoData[i * 2] + stereoData[i * 2 + 1]) / 2;
    }
    return mono;
  }

  /**
   * Converts mono audio to stereo by duplicating the channel
   * @param {Float32Array} monoData Mono audio data
   * @returns {Float32Array} Interleaved stereo data [L, R, L, R, ...]
   */
  static monoToStereo(monoData) {
    if (!(monoData instanceof Float32Array)) {
      throw new Error('Input must be a Float32Array');
    }
    const stereo = new Float32Array(monoData.length * 2);
    for (let i = 0; i < monoData.length; i++) {
      stereo[i * 2] = monoData[i];
      stereo[i * 2 + 1] = monoData[i];
    }
    return stereo;
  }

  /**
   * Converts stereo separate-channel audio to interleaved format
   * @param {Float32Array} leftChannel
   * @param {Float32Array} rightChannel
   * @returns {Float32Array} Interleaved stereo data [L, R, L, R, ...]
   */
  static interleave(leftChannel, rightChannel) {
    if (
      !(leftChannel instanceof Float32Array) ||
      !(rightChannel instanceof Float32Array)
    ) {
      throw new Error('Both channels must be Float32Array');
    }
    if (leftChannel.length !== rightChannel.length) {
      throw new Error('Both channels must have the same length');
    }
    const interleaved = new Float32Array(leftChannel.length * 2);
    for (let i = 0; i < leftChannel.length; i++) {
      interleaved[i * 2] = leftChannel[i];
      interleaved[i * 2 + 1] = rightChannel[i];
    }
    return interleaved;
  }

  /**
   * Deinterleaves stereo audio into separate channels
   * @param {Float32Array} interleavedData Interleaved [L, R, L, R, ...]
   * @returns {{left: Float32Array, right: Float32Array}}
   */
  static deinterleave(interleavedData) {
    if (!(interleavedData instanceof Float32Array)) {
      throw new Error('Input must be a Float32Array');
    }
    if (interleavedData.length % 2 !== 0) {
      throw new Error('Interleaved data must have even number of samples');
    }
    const halfLength = interleavedData.length / 2;
    const left = new Float32Array(halfLength);
    const right = new Float32Array(halfLength);
    for (let i = 0; i < halfLength; i++) {
      left[i] = interleavedData[i * 2];
      right[i] = interleavedData[i * 2 + 1];
    }
    return { left, right };
  }

  /**
   * Normalizes audio to a target peak amplitude
   * @param {Float32Array} audioData
   * @param {number} [targetPeak=1.0] Target peak amplitude (0 to 1)
   * @returns {Float32Array} Normalized audio
   */
  static normalize(audioData, targetPeak = 1.0) {
    if (!(audioData instanceof Float32Array)) {
      throw new Error('Input must be a Float32Array');
    }
    if (targetPeak <= 0 || targetPeak > 1) {
      throw new Error('Target peak must be between 0 (exclusive) and 1 (inclusive)');
    }
    let peak = 0;
    for (let i = 0; i < audioData.length; i++) {
      const abs = Math.abs(audioData[i]);
      if (abs > peak) {
        peak = abs;
      }
    }
    if (peak === 0) {
      return new Float32Array(audioData);
    }
    const scale = targetPeak / peak;
    const output = new Float32Array(audioData.length);
    for (let i = 0; i < audioData.length; i++) {
      output[i] = audioData[i] * scale;
    }
    return output;
  }

  /**
   * Trims silence from the beginning and end of audio
   * @param {Float32Array} audioData
   * @param {number} [threshold=0.001] Silence threshold
   * @returns {Float32Array} Trimmed audio
   */
  static trimSilence(audioData, threshold = 0.001) {
    if (!(audioData instanceof Float32Array)) {
      throw new Error('Input must be a Float32Array');
    }
    let start = 0;
    let end = audioData.length - 1;

    while (start < audioData.length && Math.abs(audioData[start]) < threshold) {
      start++;
    }
    while (end > start && Math.abs(audioData[end]) < threshold) {
      end--;
    }

    if (start >= end) {
      return new Float32Array(0);
    }
    return audioData.slice(start, end + 1);
  }

  /**
   * Concatenates multiple audio buffers into one
   * @param {Float32Array[]} buffers Array of Float32Array audio buffers
   * @returns {Float32Array}
   */
  static concatenate(buffers) {
    if (!Array.isArray(buffers)) {
      throw new Error('Input must be an array of Float32Array');
    }
    const totalLength = buffers.reduce((sum, buf) => sum + buf.length, 0);
    const output = new Float32Array(totalLength);
    let offset = 0;
    for (const buf of buffers) {
      if (!(buf instanceof Float32Array)) {
        throw new Error('All buffers must be Float32Array');
      }
      output.set(buf, offset);
      offset += buf.length;
    }
    return output;
  }
}

globalThis.WavConverter = WavConverter;
