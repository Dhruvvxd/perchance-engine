# Living Novel Engine Debug & Troubleshooting Guide

This guide details telemetry inspection, mutex recovery, and common failure scenarios in the Perchance sandbox.

---

## 1. Expected Console Logs

When executing commands, check the browser developer console (F12) for diagnostic prefixes:

### Continue Turn
```text
[Living Novel Engine v1.0.0] [INFO] Parsed /continue command.
[Living Novel Engine v1.0.0] [INFO] Director planning turn progression...
[Living Novel Engine v1.0.0] [INFO] Director selected speaker: Narrator for action: describe_setting
[Living Novel Engine v1.0.0] [INFO] Narrator describing atmospheric details...
[Living Novel Engine v1.0.0] [DEBUG] State saved successfully.
```

### Mutex Lock Warning
```text
[Living Novel Engine v1.0.0] [WARN] Loop execution blocked: active turn processing lock is engaged.
```

---

## 2. Mutex Lock Recovery

### Scenario: Stuck `isProcessing` flag
If the LLM call fails, internet drops, or a script error occurs during turn execution, the `isProcessing` flag could remain stuck at `true`, blocking all future turns.

### Fixes:
1. **Script Reload / Reload Chat**:
   - The engine includes a self-healing check on startup inside `bootstrap()`. Reloading the page or iframe forces `isProcessing = false` and restores operation.
2. **Authoritative Manual Bypass**:
   - Run the following command in the browser developer console to manually release the lock:
     ```javascript
     LivingNovelEngine.StateManager.mutate(s => { s.autoState.isProcessing = false; });
     ```

---

## 3. How to Inspect & Reset state

### Inspecting `oc.thread.customData`
Run this in the developer console to view the full active state representation:
```javascript
console.log(JSON.stringify(LivingNovelEngine.StateManager.load(), null, 2));
```

### State Reset
To wipe the engine's persistent history and start clean, execute:
```javascript
LivingNovelEngine.StateManager.save(null);
LivingNovelEngine.StateManager.init();
```
*This completely clears relationships, character memories, props, and world settings, restoring the defaults.*
