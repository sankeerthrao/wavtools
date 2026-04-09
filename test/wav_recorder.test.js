import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WavRecorder } from '../lib/wav_recorder.js';

describe('WavRecorder', () => {
  describe('constructor', () => {
    it('should create with default options', () => {
      const recorder = new WavRecorder();
      expect(recorder.sampleRate).toBe(44100);
      expect(recorder.outputToSpeakers).toBe(false);
      expect(recorder.debug).toBe(false);
    });

    it('should accept custom sample rate', () => {
      const recorder = new WavRecorder({ sampleRate: 24000 });
      expect(recorder.sampleRate).toBe(24000);
    });

    it('should accept debug flag', () => {
      const recorder = new WavRecorder({ debug: true });
      expect(recorder.debug).toBe(true);
    });

    it('should accept outputToSpeakers flag', () => {
      const recorder = new WavRecorder({ outputToSpeakers: true });
      expect(recorder.outputToSpeakers).toBe(true);
    });

    it('should initialize volume to 1.0', () => {
      const recorder = new WavRecorder();
      expect(recorder._volume).toBe(1.0);
    });

    it('should initialize event listeners as empty', () => {
      const recorder = new WavRecorder();
      expect(recorder._eventListeners).toEqual({});
    });

    it('should initialize VAD as disabled', () => {
      const recorder = new WavRecorder();
      expect(recorder._vadEnabled).toBe(false);
    });
  });

  describe('getStatus', () => {
    it('should return "ended" when no processor', () => {
      const recorder = new WavRecorder();
      expect(recorder.getStatus()).toBe('ended');
    });

    it('should return "paused" when processor exists but not recording', () => {
      const recorder = new WavRecorder();
      recorder.processor = {};
      recorder.recording = false;
      expect(recorder.getStatus()).toBe('paused');
    });

    it('should return "recording" when recording', () => {
      const recorder = new WavRecorder();
      recorder.processor = {};
      recorder.recording = true;
      expect(recorder.getStatus()).toBe('recording');
    });
  });

  describe('getSampleRate', () => {
    it('should return the configured sample rate', () => {
      const recorder = new WavRecorder({ sampleRate: 16000 });
      expect(recorder.getSampleRate()).toBe(16000);
    });
  });

  describe('log (Feature 1: Bug Fix)', () => {
    it('should call console.log when debug is true', () => {
      const recorder = new WavRecorder({ debug: true });
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      recorder.log('test message');
      expect(spy).toHaveBeenCalledWith('test message');
      spy.mockRestore();
    });

    it('should NOT call console.log when debug is false', () => {
      const recorder = new WavRecorder({ debug: false });
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      recorder.log('test message');
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    it('should return true', () => {
      const recorder = new WavRecorder();
      expect(recorder.log('test')).toBe(true);
    });
  });

  describe('Feature 3: Volume/Gain Control', () => {
    it('should set volume', () => {
      const recorder = new WavRecorder();
      recorder.setVolume(0.5);
      expect(recorder.getVolume()).toBe(0.5);
    });

    it('should throw for volume < 0', () => {
      const recorder = new WavRecorder();
      expect(() => recorder.setVolume(-0.1)).toThrow();
    });

    it('should throw for volume > 1', () => {
      const recorder = new WavRecorder();
      expect(() => recorder.setVolume(1.5)).toThrow();
    });

    it('should throw for non-number volume', () => {
      const recorder = new WavRecorder();
      expect(() => recorder.setVolume('loud')).toThrow();
    });

    it('should accept volume of 0', () => {
      const recorder = new WavRecorder();
      recorder.setVolume(0);
      expect(recorder.getVolume()).toBe(0);
    });

    it('should accept volume of 1', () => {
      const recorder = new WavRecorder();
      recorder.setVolume(1);
      expect(recorder.getVolume()).toBe(1);
    });

    it('should emit volumeChange event', () => {
      const recorder = new WavRecorder();
      const callback = vi.fn();
      recorder.on('volumeChange', callback);
      recorder.setVolume(0.7);
      expect(callback).toHaveBeenCalledWith({ volume: 0.7 });
    });
  });

  describe('Feature 4: Duration Tracking', () => {
    it('should return 0 when not started', () => {
      const recorder = new WavRecorder();
      expect(recorder.getDuration()).toBe(0);
    });

    it('should track cumulative duration', () => {
      const recorder = new WavRecorder();
      recorder._recordedDuration = 5.5;
      expect(recorder.getDuration()).toBe(5.5);
    });

    it('should include current recording time', () => {
      const recorder = new WavRecorder();
      recorder._recordingStartTime = Date.now() - 2000; // 2 seconds ago
      const duration = recorder.getDuration();
      expect(duration).toBeGreaterThanOrEqual(1.9);
      expect(duration).toBeLessThanOrEqual(2.2);
    });
  });

  describe('Feature 5: Event Emitter', () => {
    let recorder;

    beforeEach(() => {
      recorder = new WavRecorder();
    });

    it('should register and trigger event listeners', () => {
      const callback = vi.fn();
      recorder.on('test', callback);
      recorder._emit('test', { foo: 'bar' });
      expect(callback).toHaveBeenCalledWith({ foo: 'bar' });
    });

    it('should support multiple listeners', () => {
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      recorder.on('test', cb1);
      recorder.on('test', cb2);
      recorder._emit('test', 'data');
      expect(cb1).toHaveBeenCalledWith('data');
      expect(cb2).toHaveBeenCalledWith('data');
    });

    it('should remove listeners with off()', () => {
      const callback = vi.fn();
      recorder.on('test', callback);
      recorder.off('test', callback);
      recorder._emit('test', 'data');
      expect(callback).not.toHaveBeenCalled();
    });

    it('should not throw when emitting with no listeners', () => {
      expect(() => recorder._emit('nonexistent', {})).not.toThrow();
    });

    it('should throw when callback is not a function', () => {
      expect(() => recorder.on('test', 'not-a-function')).toThrow();
    });

    it('should handle listener errors gracefully', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      recorder.on('test', () => {
        throw new Error('boom');
      });
      expect(() => recorder._emit('test', {})).not.toThrow();
      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });
  });

  describe('Feature 6: Voice Activity Detection', () => {
    it('should enable VAD', () => {
      const recorder = new WavRecorder();
      recorder.enableVAD({ threshold: 0.02, debounceMs: 500 });
      expect(recorder._vadEnabled).toBe(true);
      expect(recorder._vadThreshold).toBe(0.02);
      expect(recorder._vadDebounceMs).toBe(500);
    });

    it('should disable VAD', () => {
      const recorder = new WavRecorder();
      recorder.enableVAD();
      recorder.disableVAD();
      expect(recorder._vadEnabled).toBe(false);
      expect(recorder._vadSpeaking).toBe(false);
    });

    it('should detect voice activity from loud audio', () => {
      const recorder = new WavRecorder();
      recorder.enableVAD({ threshold: 0.01 });

      // Simulate loud audio chunk
      const mono = new ArrayBuffer(200);
      const view = new Int16Array(mono);
      for (let i = 0; i < view.length; i++) {
        view[i] = 5000; // Loud signal
      }

      const callback = vi.fn();
      recorder.on('voiceStart', callback);
      recorder._processVAD({ mono, raw: mono });

      expect(recorder._vadSpeaking).toBe(true);
      expect(callback).toHaveBeenCalled();
    });

    it('should return isSpeaking state', () => {
      const recorder = new WavRecorder();
      expect(recorder.isSpeaking()).toBe(false);
      recorder._vadSpeaking = true;
      expect(recorder.isSpeaking()).toBe(true);
    });
  });

  describe('Feature 13: Auto-Stop', () => {
    it('should enable auto-stop with duration', () => {
      const recorder = new WavRecorder();
      recorder.enableAutoStop({ durationMs: 5000 });
      expect(recorder._autoStopEnabled).toBe(true);
      expect(recorder._autoStopDurationMs).toBe(5000);
    });

    it('should enable auto-stop with silence', () => {
      const recorder = new WavRecorder();
      recorder.enableAutoStop({ silenceMs: 3000 });
      expect(recorder._autoStopEnabled).toBe(true);
      expect(recorder._autoStopSilenceMs).toBe(3000);
      // Should also auto-enable VAD
      expect(recorder._vadEnabled).toBe(true);
    });

    it('should throw if no option provided', () => {
      const recorder = new WavRecorder();
      expect(() => recorder.enableAutoStop()).toThrow(
        'Must specify at least one',
      );
    });

    it('should disable auto-stop', () => {
      const recorder = new WavRecorder();
      recorder.enableAutoStop({ durationMs: 5000 });
      recorder.disableAutoStop();
      expect(recorder._autoStopEnabled).toBe(false);
      expect(recorder._autoStopDurationMs).toBeNull();
    });
  });

  describe('error handling', () => {
    it('should throw on record when no session', async () => {
      const recorder = new WavRecorder();
      await expect(recorder.record()).rejects.toThrow('please call .begin()');
    });

    it('should throw on pause when no session', async () => {
      const recorder = new WavRecorder();
      await expect(recorder.pause()).rejects.toThrow('please call .begin()');
    });

    it('should throw on save when no session', async () => {
      const recorder = new WavRecorder();
      await expect(recorder.save()).rejects.toThrow('please call .begin()');
    });

    it('should throw on end when no session', async () => {
      const recorder = new WavRecorder();
      await expect(recorder.end()).rejects.toThrow('please call .begin()');
    });

    it('should throw on clear when no session', async () => {
      const recorder = new WavRecorder();
      await expect(recorder.clear()).rejects.toThrow('please call .begin()');
    });

    it('should throw on read when no session', async () => {
      const recorder = new WavRecorder();
      await expect(recorder.read()).rejects.toThrow('please call .begin()');
    });

    it('should throw on getFrequencies when no session', () => {
      const recorder = new WavRecorder();
      expect(() => recorder.getFrequencies()).toThrow('please call .begin()');
    });

    it('should throw on getWaveform when no session', () => {
      const recorder = new WavRecorder();
      expect(() => recorder.getWaveform()).toThrow('please call .begin()');
    });

    it('should throw on getLevel when no session', () => {
      const recorder = new WavRecorder();
      expect(() => recorder.getLevel()).toThrow('please call .begin()');
    });
  });
});
