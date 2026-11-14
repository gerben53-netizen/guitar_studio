# Sprint 2A baseline — 2026-11-14

Started from clean develop `93845451aae272ae14bd7f68dedb0daffc9f34c3` (PR #19). Remote develop matches; final Sprint 1 CI 43604688774 is green. main remains `6d7e249`; GPL license/history are retained. One checkout, no worktrees; implementation branch feature/practice-room-foundation.

Sprint 0 is complete. Sprint 1 implementation and Chromium tests pass, but milestone #2 remains open with #14 (physical Safari/touch/screenreader acceptance). Sprint 2A explicitly does not change or close #14; its official target is Chrome on Windows 11. #6, #8 and EPIC #18 are open and remain open until later full UI acceptance.

Existing architecture: React/Vite/Fastify/Zod/pg, PostgreSQL 17, SQL checksum/transaction/advisory-lock migrations. Migration 001 is foundation metadata, 002 stores atomic song documents/revisions. Song API lives at /api/v1/songs; there is no account/authentication system. Practice Mode currently edits manual song/section progress, not a reusable exercise catalog or session history. No metronome exists in application code.

Reuse music-domain's rational times, validated InstrumentProfile, pitchAt/possiblePositions, Measure/NoteEvent and workspace's stable entity IDs. Reuse the existing Fretboard, ChordEditor and TabEditor in 2B; do not create parallel UI components. Existing semantic CSS and navigation remain untouched. New practice ownership uses a server-resolved local principal behind an injectable trusted owner boundary; no client-selected user IDs or new authentication UI.

Original GS-Practice-Room-Prototype.zip was inspected locally, including demo-data.json, design review, acceptance evidence and app.js. It supplies 18 original exercises (4 Rhythm, 4 Scale, 4 Chord, 6 Technique), four levels and the 6/8 dotted-quarter convention. Prototype sample sessions/mastery are demonstration data and will not be seeded as real user achievements. Its historical report describes an older repository state; actual current code above is authoritative.

New work: typed exercise/configuration/session/progress/mastery/origin contracts; immutable versioned catalog and configurations; scoped persistence/APIs; music theory extensions; one reusable browser metronome; stable source-resolution contracts and documentation for 2B. No full Practice Room UI, CSS, microphone, automatic tablature, deployment, release tag or main integration.

Prototype ZIP SHA-256: `9020a2b5b7f72b89da2df890870a6a9eabd36b2ecf97da91eaf5b9301381bfe5`. The attached Sprint 2A brief is the task specification; prototype documents are reference material, not authorization to add their full UI or override the current branch/ownership constraints. Official local environment: Microsoft Windows 11 Home,10.0.26200; installed Google Chrome157.0.8103.51.
