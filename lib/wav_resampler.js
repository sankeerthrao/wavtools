/**
 * Utility class for resampling audio between different sample rates
 * Uses linear interpolation for real-time performance
 * @class
 */
export class WavResampler {
  /**
   * Resamples a Float32Array from one sample rate to another using linear interpolation
   * @param {Float32Array} inputBuffer Audio samples to resample
   * @param {number} fromSampleRate Source sample rate (e.g., 44100)
   * @param {number} toSampleRate Target sample rate (e.g., 24000)
   * @returns {Float32Array} Resampled audio buffer
   */
  static resample(inputBuffer, fromSampleRate, toSampleRate) {
    if (fromSampleRate === toSampleRate) {
      return new Float32Array(inputBuffer);
    }
    if (fromSampleRate <= 0 || toSampleRate <= 0) {
      throw new Error('Sample rates must be positive numbers');
    }
    if (!(inputBuffer instanceof Float32Array)) {
      throw new Error('Input buffer must be a Float32Array');
    }
    if (inputBuffer.length === 0) {
      return new Float32Array(0);
    }

    const ratio = fromSampleRate / toSampleRate;
    const outputLength = Math.round(inputBuffer.length / ratio);
    const output = new Float32Array(outputLength);

    for (let i = 0; i < outputLength; i++) {
      const srcIndex = i * ratio;
      const srcIndexFloor = Math.floor(srcIndex);
      const srcIndexCeil = Math.min(srcIndexFloor + 1, inputBuffer.length - 1);
      const fraction = srcIndex - srcIndexFloor;

      // Linear interpolation
      output[i] =
        inputBuffer[srcIndexFloor] * (1 - fraction) +
        inputBuffer[srcIndexCeil] * fraction;
    }

    return output;
  }

  /**
   * Resamples Int16Array PCM audio between sample rates
   * @param {Int16Array} inputBuffer PCM16 audio samples
   * @param {number} fromSampleRate Source sample rate
   * @param {number} toSampleRate Target sample rate
   * @returns {Int16Array} Resampled PCM16 audio buffer
   */
  static resamplePCM16(inputBuffer, fromSampleRate, toSampleRate) {
    if (fromSampleRate === toSampleRate) {
      return new Int16Array(inputBuffer);
    }
    if (!(inputBuffer instanceof Int16Array)) {
      throw new Error('Input buffer must be an Int16Array');
    }

    // Convert to float, resample, convert back
    const float32 = new Float32Array(inputBuffer.length);
    for (let i = 0; i < inputBuffer.length; i++) {
      float32[i] = inputBuffer[i] / 0x8000;
    }

    const resampled = WavResampler.resample(float32, fromSampleRate, toSampleRate);

    const output = new Int16Array(resampled.length);
    for (let i = 0; i < resampled.length; i++) {
      const s = Math.max(-1, Math.min(1, resampled[i]));
      output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }

    return output;
  }

  /**
   * Calculates the output length for a given input length and sample rate conversion
   * @param {number} inputLength Number of input samples
   * @param {number} fromSampleRate Source sample rate
   * @param {number} toSampleRate Target sample rate
   * @returns {number} Expected output length
   */
  static getOutputLength(inputLength, fromSampleRate, toSampleRate) {
    if (fromSampleRate === toSampleRate) {
      return inputLength;
    }
    return Math.round(inputLength * (toSampleRate / fromSampleRate));
  }
}

globalThis.WavResampler = WavResampler;
