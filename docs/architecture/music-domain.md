# Music domain

Song owns optional Lyrics and multiple Arrangements. LyricsSource records provenance and storage permission. Arrangement selects an InstrumentProfile, ordered MusicSections and ChordPlacements. Sections hold TabTracks, Measures and links from lyric spans to musical passages. PracticeSession references an arrangement and tracks practice timing/tempo. Chord is pitch content/name; ChordFingering is one physical realization; ChordPlacement associates a chord with a measure/time and optional lyric anchor.

Four separate coordinate systems:

1. PhysicalPosition uses one-based string numbers and absolute integer frets. String 1 is the conventional high E. A capo at fret 2 makes absolute fret 2 the open playing position; frets below it are invalid.
2. Pitch is a MIDI semitone 0–127. Standard tuning from string 1 through 6 is [64,59,55,50,45,40]. Drop D and other tunings change pitches, not algorithms. Enharmonic spelling and microtonality are future presentation concerns.
3. MusicalTime is a nonnegative rational fraction of a whole note. Quarter = 1/4; measure capacity is beats/beatUnit. Tempo maps music time to seconds later. BigInt cross multiplication avoids float errors when checking boundaries and overlaps.
4. TabDisplayCell derives relative-to-capo fret labels and screen columns from events. ASCII export can be added, but ASCII is never the musical source of truth.

NoteEvent contains start, positive duration and simultaneous tones. Each tone may have a physical position; different strings can sound at once. Rest events contain no tones. A measure permits gaps, independent polyphonic events and touching boundaries; events cannot exceed its length or overlap on the same assigned string. Pitch and assigned position must agree. Time signatures support power-of-two beat units through 32.

InstrumentProfile supports acoustic/electric and built-in/USB microphone, interface, direct input and amplifier microphone preferences. Only profile construction enforces six strings now; mapping loops derive their bounds from tuning/string count. Max fret and capo are validated. Audio preferences are metadata, never a permission grant.

Types for all named entities are implemented. Runtime schemas cover the playable core, timing and note events; validateMeasure checks contextual pitch, range and timing. Aggregate persistence, cross-entity reference integrity, chord fingering ergonomics, lyrics span rebasing and practice-session lifecycle validation are deferred until their write operations exist. Do not treat TypeScript types as validation of untrusted persisted aggregates. Tests cover alternate tuning, capo, instruments, simultaneous notes, rests, invalid fractions, measure overflow and string collisions.
