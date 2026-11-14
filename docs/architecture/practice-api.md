# Practice API

All routes follow the established `/api/v1` convention. Suggested unversioned paths in the brief are implemented as `/api/v1/practice`. Use the existing web `request()` transport with `createPracticeClient`; do not create a competing fetch/error layer.

| Method/path after /api/v1/practice | Request/response                                                                                                                         |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| GET /exercises                     | Latest versions; optional lab, level, category, search filters; Exercise[]                                                               |
| GET /exercises/:id                 | Exercise with default configuration and content                                                                                          |
| GET /exercises/:id/settings        | configuration, key, revision, version, needsUpgrade, mastery {exercise, configuration}; default revision 0 does not write                |
| PUT /exercises/:id/settings        | {configuration, revision}; same response, next revision; save before recording a session                                                 |
| POST /sessions                     | PracticeSessionInput; 201 full immutable server-owned session                                                                            |
| GET /sessions                      | {items,total,limit,offset}; exerciseId/lab/result/from/to filters; limit 1–100 (default 20), offset 0–1000000; newest endedAt/UUID first |
| GET /sessions/:id                  | Owner-scoped session UUID or 404                                                                                                         |
| GET /progress                      | All catalog exercises including untouched defaults                                                                                       |
| GET /progress/:id                  | One owner-scoped aggregate                                                                                                               |
| PUT /mastery                       | {exerciseId,exerciseVersion,scope,configurationKey,mastered,confirmed:true}; {mastery,progress}                                          |
| POST /origins                      | PracticeOriginInput; 201 server-captured sourceConfiguration                                                                             |
| GET /origins/:id                   | available + stable selection, or missing-source + reason/library fallback/original snapshot                                              |

Labs are rhythm/scale/chord/technique; levels Basis/Ontwikkeling/Toepassing/Verdieping. Search is case-insensitive title matching. Date filters use ISO UTC instants. Unknown fields/queries, invalid meter/ranges/snapshots, conflicting mastery flags and invalid pagination return 400. Unknown or inaccessible private records return 404. Stale settings revisions/catalog versions and duplicate session IDs return 409. Database failures return 500 without SQL/credentials. Errors use the existing `{error:{code,message,requestId}}` envelope. Mutating routes validate strict Zod contracts and use parameterized queries.

Example host PowerShell against local Compose (no credentials required by the current local-only application):

```powershell
$base = 'http://localhost:3000/api/v1/practice'
Invoke-RestMethod "$base/exercises?lab=scale"
$settings = Invoke-RestMethod "$base/exercises/s3/settings"
$body = @{ configuration=$settings.configuration; revision=$settings.revision } | ConvertTo-Json -Depth 30
$saved = Invoke-RestMethod "$base/exercises/s3/settings" -Method Put -ContentType 'application/json' -Body $body
```

For a session use a new UUID, exerciseId=s3, configurationKey=$saved.key, snapshot=$saved.configuration, startedAt/endedAt, durationSeconds, repetitions, rating, notes, result=Uitgevoerd and masteryConfirmed=false. For configuration mastery explicitly submit scope=configuration, its saved key, mastered=true and confirmed=true. For overall mastery use scope=exercise and configurationKey=null. Both award and revocation require confirmation.

## Owner boundary

There are no accounts or authentication in the baseline. Production resolves a fixed local principal server-side; neither request body, query nor a header can choose an owner. Private SQL always scopes owner and composite foreign keys prevent linking another owner's configuration. `PracticeAccess.resolveOwner` is a trusted injection point for a future verified auth principal, not a public user selector. Tests inject separate owners to check cross-owner denial.

Legacy Song API has no ownership. Default origin authorization only allows local. Future auth must implement canReadSong and add ownership/authorization to the existing Song API before multi-user exposure. A retained origin snapshot is owned by its creator; revoked/deleted sources return a fallback rather than revealing current source content. No authentication system is introduced in 2A.

## Sprint 2C additions

GET/PUT `/api/v1/practice/preferences`: `{goals:string[],lastExerciseId:string|null,revision:number}`. GET defaults to empty goals/null/revision 0 without writing. PUT is strict, owner resolved server-side; at most five trimmed nonempty 200-character goals, existing exercise ID and optimistic revision. Stale revision 409, invalid input 400, unknown exercise 404. Migration 004 adds the owner preference row with FK and revision. Optional `configuration.transport` stores validated volume/mute/subdivision/ramp; existing settings/session endpoints and immutable snapshots are reused. See [Practice Room architecture](practice-room-rhythm.md) for default identity compatibility and explicit configuration mastery.
