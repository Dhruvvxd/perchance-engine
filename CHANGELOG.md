# Changelog - Living Novel Engine

All notable changes to the Living Novel Engine project will be documented in this file.

## [1.0.0] - 2026-06-22

### Added
- **Core Engine Bootstrap**: Modular IIFE structure in `LivingNovelEngine.js` executing on load in Perchance or exporting for headless environments.
- **StateManager**: Safe deep-cloning transactional mutations via `StateManager.mutate()`.
- **Telemetry**: Exposes `LivingNovelEngine.Status` tracking last save and initialization health.
- **Director & Narrator**: Skeletons and planning flow. Director decides story objectives before selecting speakers.
- **Data Structures**:
  - `RelationshipGraph`: Directed edge tracking with 9 social variables (affection, trust, respect, fear, dependence, rivalry, recentInteractions, hiddenFeelings, lastChanged).
  - `CharacterMemory`: Capped `RecentEvents` profile list with automatic consolidation to `LongTermMemory`.
  - `WorldStateManager`: Scenic settings, ambient moods, time advances, props, and global fact flags.
  - `EventQueueManager`: Schedules upcoming events based on conditions.
- **Automation Controller**: Chained async loop steps executing `/continue`, `/auto5`, `/autoloop`, and `/pause` without recursion or busy-loops. Includes self-healing lock release on refresh.
- **User Speak Mode**: Increments user character intentions, confidence, and relationships by gradual 20% deltas.
- **Director Discussion**: Private planning logging.
- **CANON Interpreter**: Fast direct-regex parsing and flexible LLM JSON mutations.
