import { describe, it, expect } from 'vitest';
import { WavConverter } from '../lib/wav_converter.js';

describe('WavConverter', () => {
  describe('float32ToPCM16', () => {
    it('should convert Float32Array to Int16Array', () => {
      const input = new Float32Array([0, 0.5, -0.5, 1.0, -1.0]);
      const result = WavConverter.float32ToPCM16(input);
      expect(result).toBeInstanceOf(Int16Array);
      expect(result.length).toBe(5);
    });

    it('should encode max positive correctly', () => {
      const result = WavConverter.float32ToPCM16(new Float32Array([1.0]));
      expect(result[0]).toBe(0x7fff);
    });

    it('should encode max negative correctly', () => {
      const result = WavConverter.float32ToPCM16(new Float32Array([-1.0]));
      expect(result[0]).toBe(-0x8000);
    });

    it('should encode zero correctly', () => {
      const result = WavConverter.float32ToPCM16(new Float32Array([0]));
      expect(result[0]).toBe(0);
    });

    it('should throw for non-Float32Array', () => {
      expect(() => WavConverter.float32ToPCM16([1, 2])).toThrow(
        'Input must be a Float32Array',
      );
    });
  });

  describe('pcm16ToFloat32', () => {
    it('should convert Int16Array to Float32Array', () => {
      const input = new Int16Array([0, 16384, -16384]);
      const result = WavConverter.pcm16ToFloat32(input);
      expect(result).toBeInstanceOf(Float32Array);
      expect(result.length).toBe(3);
      expect(result[0]).toBeCloseTo(0, 2);
      expect(result[1]).toBeCloseTo(0.5, 2);
      expect(result[2]).toBeCloseTo(-0.5, 2);
    });

    it('should throw for non-Int16Array', () => {
      expect(() => WavConverter.pcm16ToFloat32([1, 2])).toThrow(
        'Input must be an Int16Array',
      );
    });
  });

  describe('stereoToMono', () => {
    it('should average stereo channels to mono', () => {
      const stereo = new Float32Array([0.4, 0.6, 0.2, 0.8]);
      const mono = WavConverter.stereoToMono(stereo);
      expect(mono).toBeInstanceOf(Float32Array);
      expect(mono.length).toBe(2);
      expect(mono[0]).toBeCloseTo(0.5, 5);
      expect(mono[1]).toBeCloseTo(0.5, 5);
    });

    it('should throw for odd-length array', () => {
      expect(() =>
        WavConverter.stereoToMono(new Float32Array([1, 2, 3])),
      ).toThrow('even number');
    });

    it('should throw for non-Float32Array', () => {
      expect(() => WavConverter.stereoToMono([1, 2])).toThrow(
        'Input must be a Float32Array',
      );
    });
  });

  describe('monoToStereo', () => {
    it('should duplicate mono to stereo', () => {
      const mono = new Float32Array([0.5, 0.7]);
      const stereo = WavConverter.monoToStereo(mono);
      expect(stereo.length).toBe(4);
      expect(stereo[0]).toBeCloseTo(0.5, 5);
      expect(stereo[1]).toBeCloseTo(0.5, 5);
      expect(stereo[2]).toBeCloseTo(0.7, 5);
      expect(stereo[3]).toBeCloseTo(0.7, 5);
    });

    it('should throw for non-Float32Array', () => {
      expect(() => WavConverter.monoToStereo([1])).toThrow(
        'Input must be a Float32Array',
      );
    });
  });

  describe('interleave', () => {
    it('should interleave two channels', () => {
      const left = new Float32Array([0.1, 0.3]);
      const right = new Float32Array([0.2, 0.4]);
      const result = WavConverter.interleave(left, right);
      expect(result.length).toBe(4);
      expect(Array.from(result)).toEqual([
        expect.closeTo(0.1, 5),
        expect.closeTo(0.2, 5),
        expect.closeTo(0.3, 5),
        expect.closeTo(0.4, 5),
      ]);
    });

    it('should throw for mismatched lengths', () => {
      expect(() =>
        WavConverter.interleave(
          new Float32Array([1]),
          new Float32Array([1, 2]),
        ),
      ).toThrow('same length');
    });

    it('should throw for non-Float32Array', () => {
      expect(() => WavConverter.interleave([1], [2])).toThrow(
        'Float32Array',
      );
    });
  });

  describe('deinterleave', () => {
    it('should split interleaved data into channels', () => {
      const interleaved = new Float32Array([0.1, 0.2, 0.3, 0.4]);
      const { left, right } = WavConverter.deinterleave(interleaved);
      expect(left.length).toBe(2);
      expect(right.length).toBe(2);
      expect(left[0]).toBeCloseTo(0.1, 5);
      expect(right[0]).toBeCloseTo(0.2, 5);
      expect(left[1]).toBeCloseTo(0.3, 5);
      expect(right[1]).toBeCloseTo(0.4, 5);
    });

    it('should throw for odd-length input', () => {
      expect(() =>
        WavConverter.deinterleave(new Float32Array([1, 2, 3])),
      ).toThrow('even number');
    });
  });

  describe('normalize', () => {
    it('should normalize to peak amplitude', () => {
      const input = new Float32Array([0.25, -0.5, 0.1]);
      const result = WavConverter.normalize(input);
      expect(Math.max(...Array.from(result).map(Math.abs))).toBeCloseTo(
        1.0,
        5,
      );
    });

    it('should normalize to custom peak', () => {
      const input = new Float32Array([0.25, -0.5]);
      const result = WavConverter.normalize(input, 0.5);
      expect(Math.max(...Array.from(result).map(Math.abs))).toBeCloseTo(
        0.5,
        5,
      );
    });

    it('should handle all-zero input', () => {
      const input = new Float32Array([0, 0, 0]);
      const result = WavConverter.normalize(input);
      expect(Array.from(result)).toEqual([0, 0, 0]);
    });

    it('should throw for invalid peak', () => {
      expect(() =>
        WavConverter.normalize(new Float32Array([1]), 0),
      ).toThrow('Target peak');
    });
  });

  describe('trimSilence', () => {
    it('should trim leading and trailing silence', () => {
      const input = new Float32Array([
        0, 0, 0, 0.5, 0.7, 0.3, 0, 0, 0,
      ]);
      const result = WavConverter.trimSilence(input);
      expect(result.length).toBe(3);
      expect(result[0]).toBeCloseTo(0.5, 5);
      expect(result[2]).toBeCloseTo(0.3, 5);
    });

    it('should return empty for all-silent input', () => {
      const input = new Float32Array([0, 0, 0]);
      const result = WavConverter.trimSilence(input);
      expect(result.length).toBe(0);
    });

    it('should handle no silence', () => {
      const input = new Float32Array([0.5, 0.7]);
      const result = WavConverter.trimSilence(input);
      expect(result.length).toBe(2);
    });
  });

  describe('concatenate', () => {
    it('should concatenate multiple buffers', () => {
      const a = new Float32Array([1, 2]);
      const b = new Float32Array([3, 4]);
      const c = new Float32Array([5]);
      const result = WavConverter.concatenate([a, b, c]);
      expect(result.length).toBe(5);
      expect(Array.from(result)).toEqual([1, 2, 3, 4, 5]);
    });

    it('should handle empty array', () => {
      const result = WavConverter.concatenate([]);
      expect(result.length).toBe(0);
    });

    it('should throw for non-Float32Array elements', () => {
      expect(() => WavConverter.concatenate([[1, 2]])).toThrow(
        'Float32Array',
      );
    });
  });
});
