# Perchance Sandbox Compatibility Guide

This document tracks verified APIs, assumed platform interfaces, and sandbox constraints for the Living Novel Engine.

---

## 1. Verified APIs
These APIs are verified by tests and are safe for core operation:
- `oc.thread.customData`: Thread-level key-value persistence.
- `oc.thread.messages.push()`: Appends messages.
- `oc.thread.on("MessageAdded", callback)`: Intercepts message additions.
- `message.author`: Identifies sender (e.g. `"user"`, `"ai"`, `"system"`).
- `message.content`: Read/write text contents.

---

## 2. Assumed APIs & Fallbacks

### `oc.generateText(options)`
- **Assumption**: Generates prompt completions. Return shape can be a raw string or an object containing a `.text` property.
- **Fallback**: The engine uses `safeGenerateText(options)` to inspect response structures. If the return value is an object, it queries `.text`; if a raw string, it passes it directly.

### `message.expectsReply`
- **Assumption**: Setting to `false` suppresses the platform's default AI responder.
- **Fallback**: Set `expectsReply = false` on every message appended by the engine. If the platform generates an unwanted responder turn anyway, we filter or instruct the user to ignore it.

### `message.hiddenFrom`
- **Assumption**: Hides system logs/private thoughts from specific actors (e.g., `["user"]`).
- **Fallback**: We use standard message objects with `hiddenFrom: ["user"]` for Director planning turns.

---

## 3. Sandbox Restrictions
- **No Caching / LocalStorage**: The iframe sandbox lacks `allow-same-origin`, blocking IndexedDB, Web Cache, and local storage (preventing local ML tools like Kokoro).
  - *Mitigation*: We rely purely on `oc.thread.customData` for state.
- **No Window Overlay Modals**: Standard floating custom HTML UI is blocked.
  - *Mitigation*: The engine is driven entirely by text slash-commands and `CANON:` prefixes.
