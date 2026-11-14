# Guitar Input & Recognition — planned architecture

Design only: no device enumeration, microphone access, AudioContext or recognition runs in Sprint 0.

A browser-only adapter will request getUserMedia after an explicit user action in a secure context. Enumerate available audioinput devices after permission; store a preferred device identifier only when requested, with fallback when hardware disappears. Acoustic profiles may select built-in/USB microphones or pickups via an interface. Electric profiles may select interface/direct input or amplifier microphones. Browser/OS routing determines actual direct-input availability.

Pipeline: selected MediaStream -> AudioContext -> input-level meter -> AudioWorklet frame buffer -> local monophonic estimator -> confidence/stability gate -> pitch candidate -> domain possiblePositions -> user-confirmed NoteEvent proposal. Stop all tracks and close audio resources when leaving capture mode. Device changes, denied permission, unsupported APIs, disconnected devices, clipping and silence produce actionable states. Request disabling echo cancellation, noise suppression and auto gain where supported, without assuming browsers comply.

Evaluate YIN/CMNDF and McLeod pitch method (normalized autocorrelation) for single-note fundamental frequency. Compare accuracy, low-E latency, harmonic/octave errors, CPU and noise tolerance against synthetic tones and consented local recordings. FFT peaks can support diagnostics but alone are unreliable for fundamentals. Convert frequency via MIDI = 69 + 12 log2(f/440), expose cents and configurable reference A. Use overlapping frames appropriate for low E, RMS gating, confidence thresholds and temporal smoothing. Benchmark real USB interfaces and amplified distortion separately. Polyphonic chord recognition is outside the initial detector.

Short melody/plucking capture produces transient timestamped candidates. Quantization and durations are proposals requiring preview and manual correction. Pitch is ambiguous across strings, so offer possible fret positions and never infer a unique fingering silently. Nothing is added to tablature until explicit confirmation; automatic tab generation is not default behavior.

Audio processing stays local. No cloud AI is mandatory. No raw audio is stored or uploaded without separate explicit consent; ephemeral buffers are bounded and discarded on stop. Future recording consent must specify purpose, retention, destination and deletion. Test the permission lifecycle and confirm/cancel flow independently of the estimator.

References: [getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia), [Web Audio specification](https://www.w3.org/TR/webaudio/). Algorithm selection remains an experiment, not a proven product capability.
