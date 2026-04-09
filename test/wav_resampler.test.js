import { describe, it, expect } from 'vitest';
import { WavResampler } from '../lib/wav_resampler.js';

describe('WavResampler', () => {
  describe('resample', () => {
    it('should return copy when sample rates are equal', () => {
      const input = new Float32Array([0.1, 0.2, 0.3, 0.4]);
      const result = WavResampler.resample(input, 44100, 44100);
      expect(result).toEqual(input);
      expect(result).not.toBe(input); // Should be a copy
    });

    it('should downsample (44100 -> 22050)', () => {
      const input = new Float32Array(44100);
      for (let i = 0; i < 44100; i++) {
        input[i] = Math.sin((2 * Math.PI * 440 * i) / 44100);
      }
      const result = WavResampler.resample(input, 44100, 22050);
      expect(result.length).toBe(22050);
    });

    it('should upsample (22050 -> 44100)', () => {
      const input = new Float32Array(22050);
      for (let i = 0; i < 22050; i++) {
        input[i] = Math.sin((2 * Math.PI * 440 * i) / 22050);
      }
      const result = WavResampler.resample(input, 22050, 44100);
      expect(result.length).toBe(44100);
    });

    it('should handle empty input', () => {
      const result = WavResampler.resample(new Float32Array(0), 44100, 22050);
      expect(result.length).toBe(0);
    });

    it('should throw for non-positive sample rates', () => {
      expect(() =>
        WavResampler.resample(new Float32Array(10), 0, 44100),
      ).toThrow('Sample rates must be positive numbers');
    });

    it('should throw for non-Float32Array input', () => {
      expect(() => WavResampler.resample([1, 2, 3], 44100, 22050)).toThrow(
        'Input buffer must be a Float32Array',
      );
    });

    it('should preserve approximate signal shape during downsampling', () => {
      // Create a simple ramp
      const input = new Float32Array(100);
      for (let i = 0; i < 100; i++) {
        input[i] = i / 100;
      }
      const result = WavResampler.resample(input, 100, 50);
      // First sample should be ~0, last should be ~0.99
      expect(result[0]).toBeCloseTo(0, 1);
      expect(result[result.length - 1]).toBeCloseTo(0.98, 1);
    });
  });

  describe('resamplePCM16', () => {
    it('should return copy when sample rates are equal', () => {
      const input = new Int16Array([100, 200, 300]);
      const result = WavResampler.resamplePCM16(input, 44100, 44100);
      expect(result).toEqual(input);
      expect(result).not.toBe(input);
    });

    it('should downsample Int16 audio', () => {
      const input = new Int16Array(48000);
      for (let i = 0; i < 48000; i++) {
        input[i] = Math.round(
          Math.sin((2 * Math.PI * 440 * i) / 48000) * 0x7fff,
        );
      }
      const result = WavResampler.resamplePCM16(input, 48000, 24000);
      expect(result.length).toBe(24000);
      expect(result).toBeInstanceOf(Int16Array);
    });

    it('should throw for non-Int16Array input', () => {
      expect(() =>
        WavResampler.resamplePCM16(new Float32Array(10), 44100, 22050),
      ).toThrow('Input buffer must be an Int16Array');
    });
  });

  describe('getOutputLength', () => {
    it('should return same length for equal rates', () => {
      expect(WavResampler.getOutputLength(1000, 44100, 44100)).toBe(1000);
    });

    it('should calculate correct length for downsampling', () => {
      expect(WavResampler.getOutputLength(44100, 44100, 22050)).toBe(22050);
    });

    it('should calculate correct length for upsampling', () => {
      expect(WavResampler.getOutputLength(24000, 24000, 48000)).toBe(48000);
    });
  });
});
