# Living Novel Engine Project Bible

## Vision
Build a persistent Living Novel Engine inside a single Perchance Character Chat Custom JavaScript box. The story should progress naturally without requiring the user to choose every speaker.

## Core Roles
### Director
Hidden authority responsible for continuity, pacing, memory, world state, relationships, chapter flow, speaker selection, rewrites, retcons and planning.

### Narrator
Visible storyteller that writes scenes and atmosphere but never decides story direction.

### Characters
Act from personality, goals, beliefs, relationships and filtered memory.

### User Character
The user is an in-world character. Manual Speak permanently updates personality, intentions, confidence and relationships.

## Modes
- Continue: one Director decision.
- Auto x5: five Director decisions.
- Infinite Auto: runs until paused.
- Pause: stop automation.
- Speak: manual user reply treated as canon.
- Director Discussion: private planning mode.

## CANON
Messages beginning with `CANON:` are authoritative instructions. Director updates history, memory, world state and relationships accordingly.

## Persistent State
Store in oc.thread.customData:
- worldState
- relationshipGraph
- characterStates
- pendingEvents
- storyArc
- chapter
- uiState
- autoState
- lastSpeaker

## Design Rules
- Existing Perchance prompts and lore are preserved.
- Never invent APIs.
- One JavaScript file.
- Modular internal sections.
- Progressive enhancement.
- Director owns global memory.
- Characters receive filtered memory.
- Narrator never controls story.
- Natural pacing over turn rotation.

## Roadmap
v1: engine init, persistence, Director, Narrator, Continue, Auto, Pause.
v2: Speak, Director discussion, relationship graph.
v3: rewrite, retcon, advanced world simulation.

---

## Final Architecture Additions (v1.0.0 Release)
- **Module Dependency Rule**: Strictly enforced. Only `StateManager` may write to the persistent store (`oc.thread.customData`). All other modules read deep-cloned state snapshots and submit mutations via `StateManager.mutate()`.
- **Telemetry System**: Exposes `LivingNovelEngine.Status` (initialization state, runtime platform, lastSave timestamp).
- **Social Graph Schema**: Directed edges tracking affection, trust, respect, fear, dependence, rivalry, recentInteractions, and hiddenFeelings.
- **Memory Model**: Encapsulates 12 profile dimensions (Identity, Beliefs, Goals, Intentions, CurrentEmotion, PrivateKnowledge, SharedKnowledge, RecentEvents, LongTermMemory, RelationshipMemory, Habits, SpeechStyle) with Director-level filtering.
- **World State Model**: Tracks scene name, time of day, weather, active prop locations, global flags, and ambient moods.
- **Automation Execution**: Event-driven chaining utilizing `setTimeout` yielding to the browser event loop, with a lock mutex to block recursive platform loops.
