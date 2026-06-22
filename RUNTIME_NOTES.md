# Living Novel Engine Runtime Compatibility Notes

This document analyzes the runtime requirements and compatibility strategies for the **Living Novel Engine** inside the sandboxed Perchance Character Chat environment.

---

## 1. State & Prompt Size Growth Analysis

### CustomData Growth
`oc.thread.customData` is serialized to a JSON string and persisted by the Perchance platform database.
- **Base State (worldState, storyArc, chapter, autoState)**: ~1-2 KB.
- **Character Profiles (Identity, Beliefs, SpeechStyle)**: ~0.5 KB per character.
- **Memory Logs (capped at 10 RecentEvents per character)**: ~2 KB per character.
- **Relationship Graph (quadratically scaling edges)**: For $N$ characters, $N \times (N-1)$ edges. At 5 characters, 20 edges $\approx$ 3-4 KB.
- **Total CustomData Size**: Estimated at **10-15 KB** for a scene with 5 characters. This is well within Perchance serialization limits (recommended max < 100 KB).

### Prompt Growth
The prompt built for LLM generation combines the thread context and world state:
- **System Lore & Instructions**: ~1000 tokens.
- **Active setting details (CurrentScene, Mood, Weather)**: ~200 tokens.
- **Active speaker profile & filtered memory context**: ~500 tokens.
- **Relevant relationship edges**: ~200 tokens.
- **Recent Chat History (last 10 messages)**: ~1500 tokens.
- **Total Prompt Size**: Estimated at **3200-3500 tokens**. Fits comfortably within standard 4K-8K token context windows.

---

## 2. Resource Management & Scaling Strategies

### Memory Pruning Strategy
- **Capped Lists**: `RecentEvents` arrays are capped at 10 items. When item 11 is added, the oldest event is removed from the array.
- **Consolidation**: Removed memories are pushed to `LongTermMemory` as raw string items. The Director periodically consolidates these into a single summary block, clearing the array.

### Event Queue Growth Strategy
- **Pruning resolved events**: `pendingEvents` are deleted from the array immediately upon resolution or expiration, rather than keeping them with a status of `"resolved"` or `"expired"`.
- **Size Cap**: The queue is strictly capped at 15 items. Attempts to schedule beyond 15 will discard lowest priority items.

### Relationship Graph Scaling
- **Inactive Node Eviction**: Only active NPCs in the scene have nodes in `relationshipGraph`.
- **Edge Cleansing**: When a character is removed or archived, all incoming and outgoing social edges are deleted from the graph, keeping the scaling linear relative to the active cast.

### Character Profile Scaling
- **Static Constraints**: Fields like `SpeechStyle` and `Identity` are constrained to a maximum string length of 250 characters.

---

## 3. Automation Loop, Safety & Concurrency

### Auto Mode Safety & Infinite Loop Prevention
To run `Auto x5` and `Infinite Auto` safely inside an iframe sandbox:
1. **Never Recursive / Busy-Loop**: We must never run automation using synchronous loops (e.g. `while(true)`) or deep recursion. Synchronous loops will lock the browser UI thread and trigger Perchance script-termination limits.
2. **Event-Driven Chaining**: The automation is driven by chaining async steps. After a turn completes and pushes a message, it sets a short async timeout (`setTimeout(..., 1000)`) to execute the next turn. This yields control back to the browser event loop.
3. **Turn Lock Mutex**: The `isProcessing` flag is set synchronously at the entry point of `executeTurn()`. While `isProcessing` is true, all other message events are dropped immediately.

### Survival of Page Refreshes
- **State-Driven Progression**: The state of the loop is saved in `autoState.isRunning` and `autoState.turnsRemaining`.
- **Recovery on Load**: On engine bootstrap, if `autoState.isRunning` is true, the engine automatically schedules a resume call after a 2-second delay to restart the loop, surviving browser refreshes or iframe reloads.

### Async Execution Risks
- **Dangling Locks**: If an LLM call fails or the page is refreshed mid-generation, `isProcessing` could remain stuck at `true`.
- **Self-Healing Lock**: In `bootstrap()`, the engine always resets `isProcessing` to `false` and checks `isRunning` to heal stuck execution states.
- **Generation Failures**: If an API call fails or throws an exception, the engine catches it, sets `autoState.isRunning = false`, logs the error, and stops progression.

### Garbage Collection Strategy
- **Avoiding Thrashing**: Deep-cloning states (`load()`) generates short-lived objects. To prevent memory thrashing, modules must reuse the mutable `state` object inside `StateManager.mutate` callbacks rather than loading multiple cloned snapshots during a single turn.
