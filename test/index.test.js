import { describe, it, expect } from 'vitest';
import {
  AudioAnalysis,
  WavPacker,
  WavStreamPlayer,
  WavRecorder,
  WavResampler,
  WavConverter,
} from '../index.js';

describe('wavtools exports', () => {
  it('should export AudioAnalysis', () => {
    expect(AudioAnalysis).toBeDefined();
    expect(typeof AudioAnalysis.getFrequencies).toBe('function');
    expect(typeof AudioAnalysis.getWaveform).toBe('function');
  });

  it('should export WavPacker', () => {
    expect(WavPacker).toBeDefined();
    expect(typeof WavPacker.floatTo16BitPCM).toBe('function');
    expect(typeof WavPacker.mergeBuffers).toBe('function');
  });

  it('should export WavStreamPlayer', () => {
    expect(WavStreamPlayer).toBeDefined();
    const player = new WavStreamPlayer({ sampleRate: 24000 });
    expect(player.sampleRate).toBe(24000);
  });

  it('should export WavRecorder', () => {
    expect(WavRecorder).toBeDefined();
    const recorder = new WavRecorder({ sampleRate: 16000 });
    expect(recorder.sampleRate).toBe(16000);
  });

  it('should export WavResampler', () => {
    expect(WavResampler).toBeDefined();
    expect(typeof WavResampler.resample).toBe('function');
    expect(typeof WavResampler.resamplePCM16).toBe('function');
    expect(typeof WavResampler.getOutputLength).toBe('function');
  });

  it('should export WavConverter', () => {
    expect(WavConverter).toBeDefined();
    expect(typeof WavConverter.float32ToPCM16).toBe('function');
    expect(typeof WavConverter.pcm16ToFloat32).toBe('function');
    expect(typeof WavConverter.stereoToMono).toBe('function');
    expect(typeof WavConverter.monoToStereo).toBe('function');
    expect(typeof WavConverter.interleave).toBe('function');
    expect(typeof WavConverter.deinterleave).toBe('function');
    expect(typeof WavConverter.normalize).toBe('function');
    expect(typeof WavConverter.trimSilence).toBe('function');
    expect(typeof WavConverter.concatenate).toBe('function');
  });

  describe('WavRecorder new APIs', () => {
    it('should have volume control methods', () => {
      const recorder = new WavRecorder();
      expect(typeof recorder.setVolume).toBe('function');
      expect(typeof recorder.getVolume).toBe('function');
    });

    it('should have duration tracking', () => {
      const recorder = new WavRecorder();
      expect(typeof recorder.getDuration).toBe('function');
    });

    it('should have event emitter methods', () => {
      const recorder = new WavRecorder();
      expect(typeof recorder.on).toBe('function');
      expect(typeof recorder.off).toBe('function');
    });

    it('should have VAD methods', () => {
      const recorder = new WavRecorder();
      expect(typeof recorder.enableVAD).toBe('function');
      expect(typeof recorder.disableVAD).toBe('function');
      expect(typeof recorder.isSpeaking).toBe('function');
    });

    it('should have level metering', () => {
      const recorder = new WavRecorder();
      expect(typeof recorder.getLevel).toBe('function');
    });

    it('should have auto-stop methods', () => {
      const recorder = new WavRecorder();
      expect(typeof recorder.enableAutoStop).toBe('function');
      expect(typeof recorder.disableAutoStop).toBe('function');
    });

    it('should have waveform method', () => {
      const recorder = new WavRecorder();
      expect(typeof recorder.getWaveform).toBe('function');
    });
  });

  describe('WavStreamPlayer new APIs', () => {
    it('should have volume control', () => {
      const player = new WavStreamPlayer();
      expect(typeof player.setVolume).toBe('function');
      expect(typeof player.getVolume).toBe('function');
    });

    it('should have event emitter', () => {
      const player = new WavStreamPlayer();
      expect(typeof player.on).toBe('function');
      expect(typeof player.off).toBe('function');
    });

    it('should have playback rate control', () => {
      const player = new WavStreamPlayer();
      expect(typeof player.setPlaybackRate).toBe('function');
      expect(typeof player.getPlaybackRate).toBe('function');
    });

    it('should have fade methods', () => {
      const player = new WavStreamPlayer();
      expect(typeof player.fadeIn).toBe('function');
      expect(typeof player.fadeOut).toBe('function');
    });

    it('should have queue management', () => {
      const player = new WavStreamPlayer();
      expect(typeof player.isPlaying).toBe('function');
      expect(typeof player.getQueuedSamples).toBe('function');
      expect(typeof player.getQueueDuration).toBe('function');
      expect(typeof player.clearQueue).toBe('function');
    });

    it('should have level metering', () => {
      const player = new WavStreamPlayer();
      expect(typeof player.getLevel).toBe('function');
    });

    it('should have waveform method', () => {
      const player = new WavStreamPlayer();
      expect(typeof player.getWaveform).toBe('function');
    });
  });
});
