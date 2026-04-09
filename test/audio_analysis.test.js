import { describe, it, expect } from 'vitest';
import { AudioAnalysis } from '../lib/analysis/audio_analysis.js';

describe('AudioAnalysis', () => {
  describe('getFrequencies (static)', () => {
    // Create a mock analyser
    function createMockAnalyser(frequencyData) {
      return {
        frequencyBinCount: frequencyData.length,
        getFloatFrequencyData(arr) {
          arr.set(frequencyData);
        },
        getFloatTimeDomainData(arr) {
          for (let i = 0; i < arr.length; i++) {
            arr[i] = 0;
          }
        },
        fftSize: frequencyData.length * 2,
      };
    }

    it('should return frequency analysis data', () => {
      const fftData = new Float32Array(1024).fill(-50);
      const analyser = createMockAnalyser(fftData);
      const result = AudioAnalysis.getFrequencies(analyser, 44100, null, 'frequency');

      expect(result).toHaveProperty('values');
      expect(result).toHaveProperty('frequencies');
      expect(result).toHaveProperty('labels');
      expect(result.values).toBeInstanceOf(Float32Array);
    });

    it('should normalize values between 0 and 1', () => {
      const fftData = new Float32Array(1024).fill(-65); // middle of -100 to -30 range
      const analyser = createMockAnalyser(fftData);
      const result = AudioAnalysis.getFrequencies(analyser, 44100, null, 'frequency');

      for (const v of result.values) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    });

    it('should support voice analysis type', () => {
      const fftData = new Float32Array(4096).fill(-50);
      const analyser = createMockAnalyser(fftData);
      const result = AudioAnalysis.getFrequencies(analyser, 44100, null, 'voice');

      expect(result.values.length).toBeGreaterThan(0);
      expect(result.labels.length).toBe(result.values.length);
    });

    it('should support music analysis type', () => {
      const fftData = new Float32Array(4096).fill(-50);
      const analyser = createMockAnalyser(fftData);
      const result = AudioAnalysis.getFrequencies(analyser, 44100, null, 'music');

      expect(result.values.length).toBeGreaterThan(0);
      expect(result.labels.length).toBe(result.values.length);
    });

    it('should use provided fftResult when given', () => {
      const fftData = new Float32Array(1024).fill(-30); // max
      const analyser = createMockAnalyser(new Float32Array(1024).fill(-100));
      const result = AudioAnalysis.getFrequencies(
        analyser,
        44100,
        fftData,
        'frequency',
      );

      // With -30dB (max of range), all values should be 1
      for (const v of result.values) {
        expect(v).toBeCloseTo(1.0, 5);
      }
    });

    it('should handle custom decibel range', () => {
      const fftData = new Float32Array(1024).fill(-50);
      const analyser = createMockAnalyser(fftData);
      const result = AudioAnalysis.getFrequencies(
        analyser,
        44100,
        null,
        'frequency',
        -80,
        -20,
      );

      // -50 in [-80, -20] range = 0.5
      for (const v of result.values) {
        expect(v).toBeCloseTo(0.5, 5);
      }
    });
  });

  describe('getWaveform (static)', () => {
    function createMockAnalyser(timeData) {
      return {
        fftSize: timeData.length,
        getFloatTimeDomainData(arr) {
          for (let i = 0; i < Math.min(arr.length, timeData.length); i++) {
            arr[i] = timeData[i];
          }
        },
      };
    }

    it('should return waveform data', () => {
      const timeData = new Float32Array(256);
      for (let i = 0; i < 256; i++) {
        timeData[i] = Math.sin((2 * Math.PI * i) / 256);
      }
      const analyser = createMockAnalyser(timeData);
      const result = AudioAnalysis.getWaveform(analyser);

      expect(result).toHaveProperty('values');
      expect(result).toHaveProperty('length');
      expect(result.values).toBeInstanceOf(Float32Array);
      expect(result.length).toBe(256);
    });

    it('should downsample when factor > 1', () => {
      const timeData = new Float32Array(256).fill(0.5);
      const analyser = createMockAnalyser(timeData);
      const result = AudioAnalysis.getWaveform(analyser, 4);

      expect(result.length).toBe(64);
      for (const v of result.values) {
        expect(v).toBeCloseTo(0.5, 5);
      }
    });

    it('should not downsample when factor is 1', () => {
      const timeData = new Float32Array(128);
      const analyser = createMockAnalyser(timeData);
      const result = AudioAnalysis.getWaveform(analyser, 1);

      expect(result.length).toBe(128);
    });
  });
});
