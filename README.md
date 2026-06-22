# Living Novel Engine

Living Novel Engine is a persistent storytelling engine designed to run inside a single Perchance Character Chat Custom JavaScript box. It coordinates narration and dialogue progression dynamically using a hidden Director, a visible Narrator, and distinct Character modules.

## Architecture Overview
The engine runs inside a sandboxed iframe. It remains idle until triggered by message events or automated loop timers:
1. **Core Bootstrap**: Hooks `MessageAdded` to intercept text commands and handle turns.
2. **StateManager**: Holds state in `oc.thread.customData.livingNovelEngine` using deep-cloned safety transactions.
3. **Director**: Acts as showrunner, checking events and selecting speaker objectives.
4. **Narrator**: Narrates environmental and sensory descriptions.
5. **Social & Memory Engine**: Tracks directed relationship graph edges and character profile memories.

## File Map
- `LivingNovelEngine.js`: Single-file core implementation.
- `PROJECT_BIBLE.md`: Immutable project goals and constraints.
- `DESIGN.md`: Detailed module layouts and state schemas.
- `RUNTIME_NOTES.md`: Runtime scaling, memory caps, and sandbox limitations.
- `TESTING.md`: Manual verification checklist.
- `DEBUG_GUIDE.md`: Telemetry inspection and console logging.
- `PERCHANCE_COMPATIBILITY.md`: Platform API bindings, fallback behaviors, and sandboxing mitigations.
- `CHANGELOG.md`: Detailed version history.
