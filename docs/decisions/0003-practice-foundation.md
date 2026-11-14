# ADR 0003: versioned Practice foundation and shared audio clock

Status: accepted, 2026-11-14. Context: extend the existing local React/Vite/Fastify/PostgreSQL studio with the accepted 18-exercise prototype, while deferring Design System v2 and full Practice UI to 2B.

Decisions:

- Extend music-domain and existing instrument/rational/event functions; do not fork fretboard/chord/tab implementations.
- Keep immutable versioned catalog/configuration/session documents alongside relational ownership/FKs/indexed query fields. Use canonical semantic configuration hashes rather than array position or mutable settings IDs.
- Store settings separately from Song aggregates and preserve original source snapshots. Never let Practice tempo changes mutate arrangements.
- Make mastery explicit, versioned and configuration scoped; overall mastery is a separate explicit decision. Catalog upgrades retain history and do not inherit mastery.
- Resolve a local principal on the server now; inject verified ownership and source authorization later, without exposing client-selected user IDs or building authentication.
- Follow existing versioned REST/error conventions; inject the existing request transport into a functional typed client.
- Put one reusable Web Audio scheduler in packages/audio with injected clock/backend and explicit lifecycle.6/8 BPM is dotted quarter. Stop/reset on meter change rather than guessing a mid-bar conversion.
- Provide functional services/contracts and a browser-only test harness, with no placeholder React components, CSS or final navigation.

Consequences: JSON snapshots consume more storage but make historical practice reproducible. Hash semantics are versioned and must not change silently. Future auth requires Song ownership migration and trusted authorization.2B must bind route/unmount cleanup, active session timing, explicit mastery dialogs and existing editors. Browser evidence proves digital graph/lifecycle, not physical speaker accuracy. #6/#8/#14/#18 remain open for their later acceptance scope.
