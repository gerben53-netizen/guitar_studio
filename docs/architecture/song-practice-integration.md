# Song to Practice integration

PracticeOriginInput carries stable songId/arrangementId/sectionId/measureId, rational musical position, optional-empty stringSelection and one of four exerciseType labs. No array indices are permanent references. The server authorizes and share-locks the source song, validates the entire stable path and position within the measure, then stores its own immutable sourceConfiguration: instrument/tuning/capo, tempo, meter, full original NoteEvents and song revision.

The original events are copied without quantization, transposition, tab generation or rewriting the arrangement. Source tempo and Practice configuration BPM have independent lifetimes. Reordering sections/measures does not change a reference. The captured snapshot remains available when current song content changes.

`resolveOrigin` returns available with the precise stable selection for future navigation. If song, arrangement, section, measure or musical position no longer exists, it returns missing-source with the specific reason, library fallback and retained snapshot. It verifies song identity, not only nested IDs. Inaccessible sources follow the same fallback. Missing/inaccessible origins themselves return404.

All four Song→Lab contracts and return selection are implemented and API-tested. Actual Song action buttons, Practice routes, focus restoration, source-changed messaging and fallback UX are Sprint2B work. No final navigation is added in2A. Existing Fretboard/ChordEditor/TabEditor will be reused. The existing local-only Song API must gain owner authorization together with future account rollout; see practice-api.md.
