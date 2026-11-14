# Sprint 2A — Practice Room Foundation

The technical foundation is implemented with no final Practice Room screens, CSS or navigation. Existing semantic CSS and authoring editors are unchanged. See [acceptance matrix](../qa/sprint-2a-acceptance.md) for per-criterion evidence and explicit repository integration gates.

## Delivery

- Strict typed Exercise/Configuration/Session/Progress/Mastery/Origin contracts and 18 original exercises, version 1; no seeded achievements.
- Additive PostgreSQL migration 003 with immutable catalog/configuration documents, owner-scoped composite FKs, revision settings, atomic session/mastery/progress writes and retained song snapshots.
- Full versioned Practice API under /api/v1/practice, functional injected-transport client, validation/error handling, pagination/filtering and owner isolation.
- Existing music-domain extended with 48 scale combinations, I/III/V, absolute/capo-relative positions, 36 structured chord progressions and rational rhythm patterns.
- React-independent shared Web Audio metronome with lookahead clock, start/pause/resume/stop, BPM/tap, volume/mute, subdivisions, bar accents, ramp, dotted-quarter 6/8 and controlled cleanup/error paths.
- Stable ID Song→four Lab origin capture/resolution and deletion fallback; source tempo and data remain independent.

Architecture: [domain](../architecture/practice-domain.md), [API endpoint table/examples](../architecture/practice-api.md), [database tables/transactions](../architecture/practice-database.md), [metronome](../architecture/metronome-engine.md), [Song integration](../architecture/song-practice-integration.md), [ADR 0003](../decisions/0003-practice-foundation.md).

## Verification

34 unit tests; 9 integration tests on actual PostgreSQL 17; 8 browser tests in Google Chrome 157.0.8103.51 on Windows 11 and 8 separately in Chromium. Lint, format, typecheck and both builds pass. Repeat migrations/seeding and actual PostgreSQL/API restart preserve configuration/session/mastery/progress/origin. Chrome digital peak is nonzero, mute peak 0, one AudioContext closes after lifecycle, with no browser/engine errors. Evidence and limits are in the acceptance record. CI independently repeats lint/format/types/unit/integration/migration/build/audit/Docker/browser and scans history for secrets.

## GitHub integration

Repository [gerben53-netizen/guitar_studio](https://github.com/gerben53-netizen/guitar_studio), integration develop, one checkout and temporary feature/practice-room-foundation. Baseline develop 93845451aae272ae14bd7f68dedb0daffc9f34c3; main 6d7e249 remains untouched. No release/deployment.

[Milestone 3: Sprint 2A — Practice Room Foundation](https://github.com/gerben53-netizen/guitar_studio/milestone/3): [#20 domain](https://github.com/gerben53-netizen/guitar_studio/issues/20), [#21 database](https://github.com/gerben53-netizen/guitar_studio/issues/21), [#22 API](https://github.com/gerben53-netizen/guitar_studio/issues/22), [#23 theory](https://github.com/gerben53-netizen/guitar_studio/issues/23), [#24 metronome](https://github.com/gerben53-netizen/guitar_studio/issues/24), [#25 origins](https://github.com/gerben53-netizen/guitar_studio/issues/25), [#26 tests/docs](https://github.com/gerben53-netizen/guitar_studio/issues/26). These implementation issues close after accepted green integration. Final PR/merge SHA, exact-head checks, final develop CI and milestone closure are recorded in the PR/final handoff; do not infer CI from local results.

#6, #8 and EPIC #18 remain open for full later user functionality. #14 is not changed, commented on or closed by this sprint. Sprint 1's broader acceptance remains separate.

## Risks and Sprint 2B dependencies

Current application is local-only, without accounts. Server-owned local principal and injected verified-owner/source-access boundaries prepare isolation; future auth requires ownership on the legacy Song API before multi-user use. Catalog versions and hash semantics must remain immutable. Audio tests verify a digital graph, not physical speakers or guaranteed OS latency; browser suspension can interrupt playback.

Sprint 2B implements PracticeRoom, PracticeTransport, RhythmTimeline, MetronomeControls, ScaleFretboard, ChordProgression, TechniqueTab, PracticeSessionDialog and PracticeProgress against the delivered services. It must reuse Fretboard/ChordEditor/TabEditor, bind route/unmount cleanup, track active session time, provide explicit mastery confirmation and error/retry UX, and apply the separately approved Design System v2 using semantic CSS. No empty component placeholders are delivered.
