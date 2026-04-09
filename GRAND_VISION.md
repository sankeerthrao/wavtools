# wavtools — GRAND VISION

## Current State

wavtools is a focused browser audio library for recording and streaming PCM16 WAV audio, originally forked from OpenAI's Realtime Console tooling. It provides:

- **WavRecorder** — Captures microphone audio via AudioWorklet, delivers PCM16 chunks
- **WavStreamPlayer** — Queues and plays PCM16 audio chunks with interrupt support
- **WavPacker** — Assembles raw PCM16 data into valid WAV file blobs
- **AudioAnalysis** — Frequency domain analysis for visualization (music/voice/raw modes)

### Gaps Identified

1. **Zero tests** — No test suite whatsoever
2. **No volume/gain control** — Cannot adjust playback or recording volume
3. **No audio format conversion** — Only PCM16; no MP3, OGG, FLAC support
4. **No recording duration/time tracking** — No way to know how long you've been recording
5. **No event system** — No EventEmitter pattern for state changes, levels, errors
6. **No silence detection** — Cannot detect voice activity or silence
7. **No audio resampling** — No way to convert between sample rates
8. **No multi-track playback** — Stream player doesn't support mixing multiple simultaneous tracks
9. **No waveform visualization data** — Only frequency domain, no time-domain waveform
10. **Bug: Infinite recursion in log()** — `this.log(...arguments)` calls itself
11. **No playback speed control** — Cannot adjust playback rate
12. **No fade in/out** — No crossfade or volume envelope support
13. **No audio level metering** — No RMS/peak level monitoring
14. **No TypeScript source** — JS with JSDoc only, types generated from JS
15. **No CI/CD pipeline** — No GitHub Actions, no automated quality gates

---

## The Grand Vision: 15 Features

### Feature 1: Fix Critical Bug — Infinite Recursion in log()
The `WavRecorder.log()` method calls `this.log()` recursively instead of `console.log()`. This causes a stack overflow whenever debug mode is enabled.

### Feature 2: Comprehensive Test Suite
Add a complete test infrastructure with unit tests for all modules: WavPacker, AudioAnalysis, WavRecorder, WavStreamPlayer, constants, and worklet processors. Node.js-compatible tests using vitest with Web Audio API mocks.

### Feature 3: Volume/Gain Control
Add gain nodes to both WavRecorder (input gain) and WavStreamPlayer (output volume). Expose `setVolume(0-1)` and `getVolume()` on both classes.

### Feature 4: Recording Duration Tracking
Add real-time duration tracking to WavRecorder — `getDuration()` returns seconds recorded. Track via sample count in the audio processor worklet.

### Feature 5: Event Emitter System
Add an EventEmitter mixin to WavRecorder and WavStreamPlayer. Events: `recording`, `paused`, `ended`, `data`, `error`, `volumeChange`, `playbackStart`, `playbackEnd`, `trackChange`.

### Feature 6: Voice Activity Detection (VAD) / Silence Detection
Add configurable silence detection to WavRecorder. Detect when the user starts/stops speaking based on RMS threshold and duration. Emit `voiceStart` and `voiceEnd` events.

### Feature 7: Sample Rate Conversion Utility
Add `WavResampler` — a utility class to convert audio between sample rates (e.g., 44100 → 24000, 48000 → 16000) using linear interpolation for real-time use.

### Feature 8: Time-Domain Waveform Data
Extend AudioAnalysis to provide time-domain waveform data (`getWaveform()`) alongside existing frequency data. Essential for oscilloscope-style visualizations.

### Feature 9: Audio Level Metering
Add `getLevel()` / `getLevels()` to both WavRecorder and WavStreamPlayer — returns RMS and peak values for real-time VU meter displays.

### Feature 10: Playback Speed Control
Add `setPlaybackRate(rate)` to WavStreamPlayer. Support 0.5x to 2.0x speed. Implemented via playback rate parameter in the stream processor worklet.

### Feature 11: Fade In/Out Support
Add `fadeIn(durationMs)` and `fadeOut(durationMs)` to WavStreamPlayer. Apply volume envelopes during playback transitions.

### Feature 12: Audio Format Conversion Utilities
Add `WavConverter` — convert between formats: PCM16 ↔ Float32, mono ↔ stereo, with proper channel mixing. Foundation for future codec support.

### Feature 13: Recording Auto-Stop
Add configurable auto-stop to WavRecorder — stop recording after N seconds or N bytes of silence. Useful for voice command capture.

### Feature 14: Playback Queue Management
Add queue inspection and management to WavStreamPlayer — `getQueueLength()`, `getQueueDuration()`, `clearQueue()`, `isPlaying()`. Know what's buffered and control it.

### Feature 15: CI/CD with GitHub Actions
Add GitHub Actions workflow for automated testing, linting, type checking, and build verification on every push and PR.

---

## Architecture Principles

- **Backward compatible** — All new features are additive; existing API unchanged
- **Tree-shakeable** — New utilities are separate exports
- **Zero new dependencies** — Pure Web Audio API, no external libs
- **Progressive enhancement** — Features degrade gracefully if not used
- **Test-first quality** — Every feature ships with tests
