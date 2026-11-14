# Sprint 2C — Practice Room Home & Rhythm Lab

Practice Room Home, the 18-exercise API library, Rhythm Lab, reusable transport, reflection dialog, real journal/progress, personal goals and four-level learning path are implemented in the existing React app. Existing v2 branding/themes/semantic CSS and all Song functionality remain. Scale, Chord and Technique Labs are honest future modules with no start actions.

## Foundation reuse and changes

The original music-domain fraction/validation, catalog, settings/session/mastery/progress contracts, injected request client and single MetronomeEngine are reused. New pure rhythm edit/erase/accounting helpers do not schedule sound or introduce a second time model. The React observer reads audio time; 6/8 means dotted-quarter BPM/two pulses. Ramp runs at bar boundaries. One shared graph, controlled pause/resume/stop, hidden-page pause, navigation cleanup, held played position and pending-start cancellation are verified.

Optional validated transport settings persist in existing configuration/session JSON. Default options preserve earlier configuration/mastery hashes; non-default controls conservatively scope a configuration. Additive migration 004 adds owner-scoped/revision-checked goals and last selection, exposed by GET/PUT /api/v1/practice/preferences. All other endpoints/models and catalog versions remain. There is no new authentication or client-chosen owner. Practice never writes song tempos or arrangements.

Settings, sessions and goals are PostgreSQL-backed. Failed writes retain drafts/reflection; revision conflicts get explicit reload actions. Stable session UUID plus in-flight locking and readback after a lost response prevent duplicate saves. Beheerst requires an explicit configuration confirmation; reaching a tempo never grants mastery. Existing overall mastery remains separate.

Read [baseline](sprint-2c-baseline.md), [component/API/audio architecture](../architecture/practice-room-rhythm.md) and [20-criterion acceptance and screenshots](../qa/sprint-2c-acceptance.md).

## Verification

42 unit and 12 real-PostgreSQL integration tests PASS. Official local Google Chrome 157 on Windows 11 passes 20 browser tests: 13 existing and 7 new, plus targeted validation/lifecycle reruns. Both local Chrome and Chromium pass all 20 browser tests. New screen acceptance covers four viewports and both themes with 96 axe scans (48 per browser), zero violations and 48 committed Chrome screenshots. Audio output/context/lifecycle, default-key compatibility, legacy mastery, pause accounting, ramp, invalid patterns, explicit mastery, response-loss/double-click recovery and delayed-start cancellation are tested. Fresh Chrome process with empty browser context restores saved goals/settings. Actual PostgreSQL restart retains preferences/settings/session/progress/mastery/origin. Builds/types/lint/format/token/hash/contrast/migrations/audit are checked; no new dependencies and zero audit vulnerabilities. Final independent Chromium/CI evidence is linked in the PR completion record.

## GitHub integration

Milestone #5: Sprint 2C — Practice Room Home & Rhythm Lab. Issues [#36 navigation/Home](https://github.com/gerben53-netizen/guitar_studio/issues/36), [#37 catalog](https://github.com/gerben53-netizen/guitar_studio/issues/37), [#38 Rhythm](https://github.com/gerben53-netizen/guitar_studio/issues/38), [#39 transport](https://github.com/gerben53-netizen/guitar_studio/issues/39), [#40 sessions/resume](https://github.com/gerben53-netizen/guitar_studio/issues/40), [#41 learning path](https://github.com/gerben53-netizen/guitar_studio/issues/41), [#42 acceptance](https://github.com/gerben53-netizen/guitar_studio/issues/42) are attached as actual sub-issues of EPIC #18. Close only after accepted green integration.

Branch feature/practice-room-rhythm targets develop from `8020197`, one checkout/no worktrees. [PR #43](https://github.com/gerben53-netizen/guitar_studio/pull/43) is the integration record. Exact-head CI and final develop CI, merge SHA and issue/milestone completion are recorded in its completion comment because they do not exist at source preparation time. Main remains `6d7e249`. No tag/release/deployment.

#6 was assessed separately and stays open: Practice Room has its metronome UI, but existing Song Practice Mode and tablature do not yet expose these controls. #8 and EPIC #18 remain open. #14 is not changed or closed.

## Risks and Sprint 2D

Axe/contrast/viewport automation is not full WCAG, physical-device, screen-reader speech or physical speaker acceptance. Background visibility is exercised by a synthetic browser event; audio timing cannot guarantee uninterrupted sound under arbitrary OS suspension. Current local principal needs future trusted authentication and Song ownership before multi-user exposure, unchanged from 2A. In-progress unsaved sessions get navigation/reload protection; they are not a cross-restart live recording. Saved sessions/settings/goals are durable.

Sprint 2D should implement Scale Lab with existing scaleTones/scalePositions/I–III–V and Fretboard. Reuse this transport, session dialog, owner-safe API, v2 controls and lifecycle. Keep Chord/Technique, microphone/scoring and PDF separately scoped.
