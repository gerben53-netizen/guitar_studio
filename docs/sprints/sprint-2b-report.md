# Sprint 2B — Design System v2 Integration

The accepted navy/cyan design is applied to the existing production React app. Original attached neon PNG, ZIP plectrum/favicon/app icons, semantic v2 tokens and layered shared styles are integrated. Song editing and PostgreSQL persistence remain the original implementation; Sprint 2A foundation is unchanged. No Practice Room Labs, release, deployment, tag or main change.

## Implementation

- Original logo in header and dashboard; fixed dark carrier in dark/light; compact navigation mark and supplied icons. Attached original differs in raster size/hash from the ZIP original, so the attachment is used unchanged and both sources are documented.
- Original tokens.json is authoritative. Generated theme CSS, shared gs-* controls and music roles, scoped existing layouts and final brand/state layers replace the old palette; no alias layer or body.light remains.
- Theme preference persists under the same key, switches via root data-theme and survives reload. All existing screen families are migrated with their real validation, server statuses, recovery and authoring controls retained.
- Actual banner/nav/main semantics, heading hierarchy, view states and native modal behavior are verified. Dialog wrapping, unique names, error association and busy flags are improved within accessibility scope.
- Future Practice Room components can consume the shared styles under a separate root; no demo scripts or fake data are imported.

Read [baseline/migration matrix](sprint-2b-baseline.md), [architecture/component mapping](../architecture/design-system-v2-integration.md) and [per-gate acceptance](../qa/sprint-2b-design-system-acceptance.md).

## Validation

34 unit tests and 9 real-PostgreSQL integration tests PASS. Local Chrome 157 on Windows 11 and Chromium 159 each pass the 12-test browser suite plus a targeted splitter/scroll/focus case (13 distinct scenarios). Four viewport cases cover nine screen states in both themes: 144 axe scans total with zero violations under tested WCAG tags. 72 Chrome screenshots and raw environment/axe records are committed. All 32 selected contrast pairs PASS, five browser asset hashes PASS, token generation/color centralization PASS. Existing functional regressions cover imports/rights, lyrics/chords/tab, tuning/capo, Undo/Redo, reload persistence, Practice Mode, recovery and failures. No domain/API/schema/ownership changes. Lint, format, types, builds, repeated migrations and audit pass; no new dependencies and zero audit vulnerabilities.

## GitHub and final integration gates

[Milestone #4](https://github.com/gerben53-netizen/guitar_studio/milestone/4), issues [#28 tokens/theme](https://github.com/gerben53-netizen/guitar_studio/issues/28), [#29 assets/shell](https://github.com/gerben53-netizen/guitar_studio/issues/29), [#30 shared CSS](https://github.com/gerben53-netizen/guitar_studio/issues/30), [#31 editors](https://github.com/gerben53-netizen/guitar_studio/issues/31), [#32 library/import/Practice Mode](https://github.com/gerben53-netizen/guitar_studio/issues/32), [#33 browser/a11y](https://github.com/gerben53-netizen/guitar_studio/issues/33), [#34 documentation](https://github.com/gerben53-netizen/guitar_studio/issues/34).

Feature branch design-system-v2-integration targets develop in one checkout, without worktrees. Merge only after complete technical acceptance and exact-head quality/secrets CI. PR completion record supplies final PR, CI runs, merge SHA, final develop state and issue/milestone closure, because those records do not exist while source-time evidence is prepared. Main remains `6d7e249`; #6/#8/#14/#18 stay open. No acceptance of other browsers or physical devices is inferred.

## Deferred work and risks

Physical screen-reader/device acceptance and full WCAG certification remain unproven; targeted DOM/axe/contrast results are documented rather than generalized. Native CSS nesting is intentionally supported by the Chrome baseline. Future Practice Room UI belongs to Sprint 2C and must use the same semantic register/gs-* components, reuse existing editors, preserve trusted owner/API boundaries and wire the shared metronome lifecycle and explicit mastery UX. Prototype song counts/text, simplified storage and mocked links are not reproduced. Main production behaviors take priority over pixel-identical fictitious flows.
