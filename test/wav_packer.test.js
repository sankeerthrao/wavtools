import { describe, it, expect } from 'vitest';
import { WavPacker } from '../lib/wav_packer.js';

describe('WavPacker', () => {
  describe('floatTo16BitPCM', () => {
    it('should convert Float32Array to ArrayBuffer', () => {
      const input = new Float32Array([0, 0.5, -0.5, 1, -1]);
      const result = WavPacker.floatTo16BitPCM(input);
      expect(result).toBeInstanceOf(ArrayBuffer);
      expect(result.byteLength).toBe(input.length * 2);
    });

    it('should correctly encode zero as 0', () => {
      const input = new Float32Array([0]);
      const result = WavPacker.floatTo16BitPCM(input);
      const view = new DataView(result);
      expect(view.getInt16(0, true)).toBe(0);
    });

    it('should correctly encode positive values', () => {
      const input = new Float32Array([1.0]);
      const result = WavPacker.floatTo16BitPCM(input);
      const view = new DataView(result);
      expect(view.getInt16(0, true)).toBe(0x7fff);
    });

    it('should correctly encode negative values', () => {
      const input = new Float32Array([-1.0]);
      const result = WavPacker.floatTo16BitPCM(input);
      const view = new DataView(result);
      expect(view.getInt16(0, true)).toBe(-0x8000);
    });

    it('should clamp values outside [-1, 1]', () => {
      const input = new Float32Array([2.0, -2.0]);
      const result = WavPacker.floatTo16BitPCM(input);
      const view = new DataView(result);
      expect(view.getInt16(0, true)).toBe(0x7fff);
      expect(view.getInt16(2, true)).toBe(-0x8000);
    });

    it('should handle empty array', () => {
      const input = new Float32Array([]);
      const result = WavPacker.floatTo16BitPCM(input);
      expect(result.byteLength).toBe(0);
    });
  });

  describe('mergeBuffers', () => {
    it('should concatenate two ArrayBuffers', () => {
      const left = new Uint8Array([1, 2, 3]).buffer;
      const right = new Uint8Array([4, 5, 6]).buffer;
      const result = WavPacker.mergeBuffers(left, right);
      expect(result.byteLength).toBe(6);
      const view = new Uint8Array(result);
      expect(Array.from(view)).toEqual([1, 2, 3, 4, 5, 6]);
    });

    it('should handle empty left buffer', () => {
      const left = new ArrayBuffer(0);
      const right = new Uint8Array([1, 2]).buffer;
      const result = WavPacker.mergeBuffers(left, right);
      expect(result.byteLength).toBe(2);
    });

    it('should handle empty right buffer', () => {
      const left = new Uint8Array([1, 2]).buffer;
      const right = new ArrayBuffer(0);
      const result = WavPacker.mergeBuffers(left, right);
      expect(result.byteLength).toBe(2);
    });

    it('should handle both empty buffers', () => {
      const result = WavPacker.mergeBuffers(new ArrayBuffer(0), new ArrayBuffer(0));
      expect(result.byteLength).toBe(0);
    });
  });

  describe('pack', () => {
    it('should produce a valid WAV blob', () => {
      const packer = new WavPacker();
      const channels = [new Float32Array([0.1, 0.2, 0.3])];
      const data = WavPacker.floatTo16BitPCM(channels[0]);
      const result = packer.pack(44100, {
        bitsPerSample: 16,
        channels,
        data,
      });

      expect(result).toHaveProperty('blob');
      expect(result).toHaveProperty('url');
      expect(result).toHaveProperty('channelCount', 1);
      expect(result).toHaveProperty('sampleRate', 44100);
      expect(result).toHaveProperty('duration');
      expect(result.duration).toBeGreaterThan(0);
    });

    it('should throw if bitsPerSample is missing', () => {
      const packer = new WavPacker();
      expect(() =>
        packer.pack(44100, { channels: [], data: new Int16Array(0) }),
      ).toThrow('Missing "bitsPerSample"');
    });

    it('should throw if channels is missing', () => {
      const packer = new WavPacker();
      expect(() =>
        packer.pack(44100, { bitsPerSample: 16, data: new Int16Array(0) }),
      ).toThrow('Missing "channels"');
    });

    it('should throw if data is missing', () => {
      const packer = new WavPacker();
      expect(() =>
        packer.pack(44100, { bitsPerSample: 16, channels: [] }),
      ).toThrow('Missing "data"');
    });

    it('should calculate correct duration', () => {
      const packer = new WavPacker();
      const sampleRate = 24000;
      const numSamples = 24000; // 1 second
      const channels = [new Float32Array(numSamples)];
      const data = WavPacker.floatTo16BitPCM(channels[0]);
      const result = packer.pack(sampleRate, {
        bitsPerSample: 16,
        channels,
        data,
      });
      expect(result.duration).toBeCloseTo(1.0, 2);
    });
  });
});
