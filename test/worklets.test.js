import { describe, it, expect } from 'vitest';

/**
 * Tests for AudioWorklet processors
 * Since AudioWorklet runs in a separate context, we test the string-embedded
 * class logic by extracting and evaluating the core algorithms
 */

describe('AudioProcessor Worklet Logic', () => {
  // Re-implement the core algorithms from the worklet for testing
  function floatTo16BitPCM(float32Array) {
    const buffer = new ArrayBuffer(float32Array.length * 2);
    const view = new DataView(buffer);
    let offset = 0;
    for (let i = 0; i < float32Array.length; i++, offset += 2) {
      let s = Math.max(-1, Math.min(1, float32Array[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return buffer;
  }

  function readChannelData(chunks, channel = -1, maxChannels = 9) {
    let channelLimit;
    if (channel !== -1) {
      channelLimit = channel + 1;
    } else {
      channel = 0;
      channelLimit = Math.min(chunks[0] ? chunks[0].length : 1, maxChannels);
    }
    const channels = [];
    for (let n = channel; n < channelLimit; n++) {
      const length = chunks.reduce((sum, chunk) => sum + chunk[n].length, 0);
      const buffers = chunks.map((chunk) => chunk[n]);
      const result = new Float32Array(length);
      let offset = 0;
      for (let i = 0; i < buffers.length; i++) {
        result.set(buffers[i], offset);
        offset += buffers[i].length;
      }
      channels[n] = result;
    }
    return channels;
  }

  function formatAudioData(channels) {
    if (channels.length === 1) {
      const float32Array = channels[0].slice();
      const meanValues = channels[0].slice();
      return { float32Array, meanValues };
    } else {
      const float32Array = new Float32Array(
        channels[0].length * channels.length,
      );
      const meanValues = new Float32Array(channels[0].length);
      for (let i = 0; i < channels[0].length; i++) {
        const offset = i * channels.length;
        let meanValue = 0;
        for (let n = 0; n < channels.length; n++) {
          float32Array[offset + n] = channels[n][i];
          meanValue += channels[n][i];
        }
        meanValues[i] = meanValue / channels.length;
      }
      return { float32Array, meanValues };
    }
  }

  describe('floatTo16BitPCM', () => {
    it('should convert float samples to 16-bit PCM', () => {
      const input = new Float32Array([0, 0.5, -0.5, 1.0, -1.0]);
      const buffer = floatTo16BitPCM(input);
      expect(buffer.byteLength).toBe(10);
    });

    it('should handle edge values correctly', () => {
      const input = new Float32Array([1.0]);
      const buffer = floatTo16BitPCM(input);
      const view = new DataView(buffer);
      expect(view.getInt16(0, true)).toBe(32767);
    });
  });

  describe('readChannelData', () => {
    it('should read single channel from chunks', () => {
      const chunks = [
        [new Float32Array([0.1, 0.2])],
        [new Float32Array([0.3, 0.4])],
      ];
      const channels = readChannelData(chunks);
      expect(channels[0].length).toBe(4);
      expect(channels[0][0]).toBeCloseTo(0.1, 5);
      expect(channels[0][3]).toBeCloseTo(0.4, 5);
    });

    it('should read specific channel', () => {
      const chunks = [
        [new Float32Array([0.1]), new Float32Array([0.9])],
      ];
      const channels = readChannelData(chunks, 1);
      expect(channels[1][0]).toBeCloseTo(0.9, 5);
    });

    it('should read multiple channels', () => {
      const chunks = [
        [new Float32Array([0.1, 0.2]), new Float32Array([0.3, 0.4])],
      ];
      const channels = readChannelData(chunks);
      expect(channels.length).toBe(2);
      expect(channels[0].length).toBe(2);
      expect(channels[1].length).toBe(2);
    });
  });

  describe('formatAudioData', () => {
    it('should handle single channel', () => {
      const channels = [new Float32Array([0.1, 0.2, 0.3])];
      const { float32Array, meanValues } = formatAudioData(channels);
      expect(float32Array.length).toBe(3);
      expect(meanValues.length).toBe(3);
      expect(float32Array[0]).toBeCloseTo(0.1, 5);
    });

    it('should interleave multi-channel data', () => {
      const channels = [
        new Float32Array([0.1, 0.2]),
        new Float32Array([0.3, 0.4]),
      ];
      const { float32Array, meanValues } = formatAudioData(channels);
      expect(float32Array.length).toBe(4); // 2 samples * 2 channels
      // Interleaved: [L0, R0, L1, R1]
      expect(float32Array[0]).toBeCloseTo(0.1, 5);
      expect(float32Array[1]).toBeCloseTo(0.3, 5);
      expect(float32Array[2]).toBeCloseTo(0.2, 5);
      expect(float32Array[3]).toBeCloseTo(0.4, 5);
      // Mean values
      expect(meanValues[0]).toBeCloseTo(0.2, 5);
      expect(meanValues[1]).toBeCloseTo(0.3, 5);
    });
  });
});

describe('StreamProcessor Worklet Logic', () => {
  // Test the write data logic
  function simulateWriteData(float32Array, bufferLength = 128) {
    const outputBuffers = [];
    let write = { buffer: new Float32Array(bufferLength), trackId: null };
    let writeOffset = 0;

    let { buffer } = write;
    let offset = writeOffset;
    for (let i = 0; i < float32Array.length; i++) {
      buffer[offset++] = float32Array[i];
      if (offset >= buffer.length) {
        outputBuffers.push(write);
        write = { buffer: new Float32Array(bufferLength), trackId: 'test' };
        buffer = write.buffer;
        offset = 0;
      }
    }

    return { outputBuffers, remainingOffset: offset };
  }

  it('should split data into buffer-sized chunks', () => {
    const data = new Float32Array(256);
    const { outputBuffers } = simulateWriteData(data, 128);
    expect(outputBuffers.length).toBe(2);
  });

  it('should handle data smaller than buffer', () => {
    const data = new Float32Array(64);
    const { outputBuffers, remainingOffset } = simulateWriteData(data, 128);
    expect(outputBuffers.length).toBe(0);
    expect(remainingOffset).toBe(64);
  });

  it('should handle data exactly matching buffer', () => {
    const data = new Float32Array(128);
    const { outputBuffers } = simulateWriteData(data, 128);
    expect(outputBuffers.length).toBe(1);
  });
});
