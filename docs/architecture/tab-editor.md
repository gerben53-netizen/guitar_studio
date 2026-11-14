# Structured tab editor and prototype migration

The authoritative representation is a Measure containing NoteEvents with rational whole-note start/duration and simultaneous tones. A tone contains musical MIDI pitch and an optional physical string/absolute-fret position. The editor requires positions for authored guitar notes and always derives pitch through the existing instrument mapping. Six visual rows are a rendering, not persisted ASCII.

Meters 2/4, 3/4, 4/4 and 6/8 are selectable. Whole, half, quarter, eighth and sixteenth durations are available, plus quarter-note triplets (1/12 whole note). Visual grids can be 1/8, 1/16 or 1/12. Existing off-grid events are added to the rendered columns, never quantized or removed when the grid changes. Domain rationals allow future dotted values and other tuplets without replacing a tick model. The current navigation resolution covers these selectable durations; advanced techniques/ties and independent per-string voices remain future work.

The shared cursor has a stable measure ID, rational position and one-based string. Arrows navigate; digit sequences within 650 ms enter multi-digit frets, while navigation resets the digit buffer. Delete/Backspace removes the current tone (or rest), Ctrl/Cmd Z and Shift Z undo/redo. Shift with navigation/measure selection extends a contiguous measure range; copying and pasting creates independent measures/events with new IDs. This is multi-measure passage selection, not arbitrary rectangular partial-note selection.

Fretboard clicks update the same event used by the tab. Simultaneous mode adds tones to an event; sequential mode advances by the previous event's duration and can add a new measure. The neck scrolls the selected string/fret into view. Tone names derive from the actual tuning and absolute fret; visual fret labels are relative to capo.

## Capo semantics (#12)

Sprint 0 defines absolute physical frets. Preserve that convention: a displayed open string at capo 2 is absolute fret 2. Changing tuning recalculates pitch while preserving absolute positions. Changing capo is explicitly confirmed when notes exist; it preserves absolute positions, visibly changes relative labels and rejects notes below the capo. The app does not silently move existing music. This is a documented semantic correction to the prototype's relative-fret storage. New note entry uses capo-relative labels and converts them to absolute positions once.

## Explicit prototype conversion (#10)

`fromPrototype` validates the old shape before conversion. The opt-in demo seeder uses it and never overwrites an existing seed ID. The supplied three fictional demos provide a regression fixture; conversion tests count all original tones and arrangements.

| Prototype                        | New aggregate                                                       |
| -------------------------------- | ------------------------------------------------------------------- |
| eighth tick `t`, duration `d`    | start `t/8`, duration `d/8`, reduced rationals                      |
| meter = number of eighth ticks   | explicit beats = meter/2, beatUnit = 4                              |
| zero-based string, relative fret | one-based string, absolute fret = relative + capo                   |
| lyrics arrays per arrangement    | union of shared lyric sections, matching name/text reused           |
| line/word chord coordinates      | stable word token ID, original word retained, measure reference     |
| implicit mutable IDs             | new IDs and explicit cross-reference validation                     |
| status Nieuw                     | In bewerking                                                        |
| localStorage document            | explicit PostgreSQL insertion, document schema version and revision |

The prototype has no exact chord-to-measure time mapping. Conversion conservatively associates the line with an available measure (bounded by section length), rather than claiming timing synchronization that did not exist. Its original lyrics and grips are retained. Production user data from other sources must have verified rights before conversion/storage. JSON import accepts the new versioned format; it does not silently read a browser's old localStorage.
