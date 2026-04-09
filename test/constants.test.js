import { describe, it, expect } from 'vitest';
import {
  noteFrequencies,
  noteFrequencyLabels,
  voiceFrequencies,
  voiceFrequencyLabels,
} from '../lib/analysis/constants.js';

describe('Audio Analysis Constants', () => {
  describe('noteFrequencies', () => {
    it('should have 96 entries (8 octaves x 12 notes)', () => {
      expect(noteFrequencies.length).toBe(96);
    });

    it('should be in ascending order', () => {
      for (let i = 1; i < noteFrequencies.length; i++) {
        expect(noteFrequencies[i]).toBeGreaterThan(noteFrequencies[i - 1]);
      }
    });

    it('should have A4 at approximately 440 Hz', () => {
      // A4 is the 10th note in the 4th octave = index (3 * 12) + 9 = 45
      const a4Index = 3 * 12 + 9;
      expect(noteFrequencies[a4Index]).toBeCloseTo(440, 0);
    });
  });

  describe('noteFrequencyLabels', () => {
    it('should have same length as noteFrequencies', () => {
      expect(noteFrequencyLabels.length).toBe(noteFrequencies.length);
    });

    it('should have labels in format "NoteOctave"', () => {
      expect(noteFrequencyLabels[0]).toMatch(/^[A-G]#?\d$/);
    });

    it('should contain A4 label', () => {
      expect(noteFrequencyLabels).toContain('A4');
    });

    it('should start with C1', () => {
      expect(noteFrequencyLabels[0]).toBe('C1');
    });

    it('should end with B8', () => {
      expect(noteFrequencyLabels[noteFrequencyLabels.length - 1]).toBe('B8');
    });
  });

  describe('voiceFrequencies', () => {
    it('should be a subset of noteFrequencies', () => {
      for (const freq of voiceFrequencies) {
        expect(noteFrequencies).toContain(freq);
      }
    });

    it('should only contain frequencies between 32 and 2000 Hz', () => {
      for (const freq of voiceFrequencies) {
        expect(freq).toBeGreaterThan(32);
        expect(freq).toBeLessThan(2000);
      }
    });

    it('should be in ascending order', () => {
      for (let i = 1; i < voiceFrequencies.length; i++) {
        expect(voiceFrequencies[i]).toBeGreaterThan(voiceFrequencies[i - 1]);
      }
    });
  });

  describe('voiceFrequencyLabels', () => {
    it('should have same length as voiceFrequencies', () => {
      expect(voiceFrequencyLabels.length).toBe(voiceFrequencies.length);
    });

    it('should be a subset of noteFrequencyLabels', () => {
      for (const label of voiceFrequencyLabels) {
        expect(noteFrequencyLabels).toContain(label);
      }
    });
  });
});
