import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WavStreamPlayer } from '../lib/wav_stream_player.js';

describe('WavStreamPlayer', () => {
  describe('constructor', () => {
    it('should create with default options', () => {
      const player = new WavStreamPlayer();
      expect(player.sampleRate).toBe(44100);
      expect(player.context).toBeNull();
      expect(player.stream).toBeNull();
    });

    it('should accept custom sample rate', () => {
      const player = new WavStreamPlayer({ sampleRate: 24000 });
      expect(player.sampleRate).toBe(24000);
    });

    it('should initialize volume to 1.0', () => {
      const player = new WavStreamPlayer();
      expect(player._volume).toBe(1.0);
    });

    it('should initialize playback rate to 1.0', () => {
      const player = new WavStreamPlayer();
      expect(player._playbackRate).toBe(1.0);
    });

    it('should initialize event listeners as empty', () => {
      const player = new WavStreamPlayer();
      expect(player._eventListeners).toEqual({});
    });

    it('should initialize playing state to false', () => {
      const player = new WavStreamPlayer();
      expect(player._playing).toBe(false);
    });
  });

  describe('Feature 3: Volume Control', () => {
    it('should set volume', () => {
      const player = new WavStreamPlayer();
      player.setVolume(0.5);
      expect(player.getVolume()).toBe(0.5);
    });

    it('should throw for volume out of range', () => {
      const player = new WavStreamPlayer();
      expect(() => player.setVolume(-0.1)).toThrow();
      expect(() => player.setVolume(1.5)).toThrow();
    });

    it('should throw for non-number', () => {
      const player = new WavStreamPlayer();
      expect(() => player.setVolume('loud')).toThrow();
    });

    it('should emit volumeChange event', () => {
      const player = new WavStreamPlayer();
      const callback = vi.fn();
      player.on('volumeChange', callback);
      player.setVolume(0.3);
      expect(callback).toHaveBeenCalledWith({ volume: 0.3 });
    });
  });

  describe('Feature 5: Event Emitter', () => {
    let player;

    beforeEach(() => {
      player = new WavStreamPlayer();
    });

    it('should register and trigger events', () => {
      const cb = vi.fn();
      player.on('test', cb);
      player._emit('test', { data: 1 });
      expect(cb).toHaveBeenCalledWith({ data: 1 });
    });

    it('should remove listeners', () => {
      const cb = vi.fn();
      player.on('test', cb);
      player.off('test', cb);
      player._emit('test', {});
      expect(cb).not.toHaveBeenCalled();
    });

    it('should support multiple listeners', () => {
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      player.on('event', cb1);
      player.on('event', cb2);
      player._emit('event', 'data');
      expect(cb1).toHaveBeenCalled();
      expect(cb2).toHaveBeenCalled();
    });

    it('should throw for non-function callback', () => {
      expect(() => player.on('test', 'nope')).toThrow();
    });

    it('should handle listener errors', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      player.on('test', () => {
        throw new Error('oops');
      });
      expect(() => player._emit('test', {})).not.toThrow();
      spy.mockRestore();
    });
  });

  describe('Feature 10: Playback Speed Control', () => {
    it('should set playback rate', () => {
      const player = new WavStreamPlayer();
      player.setPlaybackRate(1.5);
      expect(player.getPlaybackRate()).toBe(1.5);
    });

    it('should throw for rate < 0.5', () => {
      const player = new WavStreamPlayer();
      expect(() => player.setPlaybackRate(0.1)).toThrow();
    });

    it('should throw for rate > 2.0', () => {
      const player = new WavStreamPlayer();
      expect(() => player.setPlaybackRate(3.0)).toThrow();
    });

    it('should accept boundary values', () => {
      const player = new WavStreamPlayer();
      player.setPlaybackRate(0.5);
      expect(player.getPlaybackRate()).toBe(0.5);
      player.setPlaybackRate(2.0);
      expect(player.getPlaybackRate()).toBe(2.0);
    });
  });

  describe('Feature 14: Queue Management', () => {
    it('should report not playing initially', () => {
      const player = new WavStreamPlayer();
      expect(player.isPlaying()).toBe(false);
    });

    it('should report zero queued samples initially', () => {
      const player = new WavStreamPlayer();
      expect(player.getQueuedSamples()).toBe(0);
    });

    it('should report zero queue duration initially', () => {
      const player = new WavStreamPlayer();
      expect(player.getQueueDuration()).toBe(0);
    });
  });

  describe('error handling', () => {
    it('should throw on getFrequencies when not connected', () => {
      const player = new WavStreamPlayer();
      expect(() => player.getFrequencies()).toThrow('Not connected');
    });

    it('should throw on getWaveform when not connected', () => {
      const player = new WavStreamPlayer();
      expect(() => player.getWaveform()).toThrow('Not connected');
    });

    it('should throw on getLevel when not connected', () => {
      const player = new WavStreamPlayer();
      expect(() => player.getLevel()).toThrow('Not connected');
    });

    it('should throw on add16BitPCM with non-string trackId', () => {
      const player = new WavStreamPlayer();
      expect(() => player.add16BitPCM(new Int16Array(10), 123)).toThrow(
        'trackId must be a string',
      );
    });

    it('should throw on add16BitPCM with invalid buffer type', () => {
      const player = new WavStreamPlayer();
      // Need to set stream to non-null so it doesn't try to call _start()
      player.stream = { port: { postMessage: vi.fn() } };
      expect(() => player.add16BitPCM([1, 2, 3])).toThrow(
        'must be Int16Array or ArrayBuffer',
      );
    });

    it('should throw on fadeIn when not connected', () => {
      const player = new WavStreamPlayer();
      expect(() => player.fadeIn()).toThrow('Not connected');
    });

    it('should throw on fadeOut when not connected', () => {
      const player = new WavStreamPlayer();
      expect(() => player.fadeOut()).toThrow('Not connected');
    });

    it('should return null on getTrackSampleOffset when no stream', async () => {
      const player = new WavStreamPlayer();
      const result = await player.getTrackSampleOffset();
      expect(result).toBeNull();
    });
  });
});
