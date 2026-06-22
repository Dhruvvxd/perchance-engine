# Living Novel Engine Manual Testing Checklist

This document guides manual test verification within the Perchance Character Chat interface.

---

## 1. Core Automation & Modes Checklist

### [ ] `/continue` Command
- **Action**: Type `/continue` in the chat input and send.
- **Expected Results**:
  - The default AI reply does not fire (blocked by `expectsReply = false`).
  - Exactly one turn is generated (either the Narrator describing the scene or an NPC speaking).
  - Check the console logs: `[Living Novel Engine] [INFO] Director planning turn progression...` is output.

### [ ] `/auto5` Command
- **Action**: Type `/auto5` and send.
- **Expected Results**:
  - The loop initiates.
  - Generates 5 sequential turns at 1.5-second intervals.
  - The console shows count decrementing: `Auto turns remaining: 4 ... 3 ... 2 ... 1 ... 0`.
  - The loop automatically stops when `turnsRemaining` reaches 0.

### [ ] `/autoloop` Command
- **Action**: Type `/autoloop` and send.
- **Expected Results**:
  - Generates turns continuously beyond 5 steps.
  - Mode remains stable at `"autoloop"`.

### [ ] `/pause` Command
- **Action**: While `/autoloop` is running, type `/pause` and send.
- **Expected Results**:
  - The active loop halts immediately.
  - Console prints: `Halting automation loop`.
  - No further turns are generated.

---

## 2. Text Interception & Dialogue Checklist

### [ ] Speak Mode (User character)
- **Action**: Type any standard sentence in chat (e.g. "I am walking to the tavern.") and send.
- **Expected Results**:
  - Console prints: `User Speak Turn: running profile and social update check...`.
  - The user character's profile is updated gradually (check `characterStates.user`).

### [ ] `/director` Private Planning
- **Action**: Type `/director What should happen next?` and send.
- **Expected Results**:
  - A private strategy notes block is generated.
  - No new visible messages are added to the thread.
  - No changes are made to the world state.

---

## 3. Authoritative Mutations Checklist

### [ ] `CANON:` Setting Command
- **Action**: Type `CANON: Set scene to Haunted Tavern.` and send.
- **Expected Results**:
  - Scene is immediately updated. Check console: `Authoritative direct parse setting scene to: Haunted Tavern`.

### [ ] `CANON:` Social Updates
- **Action**: Type `CANON: Bob feels 90 trust towards user.` and send.
- **Expected Results**:
  - The relationship edge from Bob to user is updated (check console: `Authoritative CANON mutation applied successfully`).

---

## 4. State & Social Mechanics Checklist

### [ ] World State Updates
- **Action**: Check if advancing time increments epoch hours and swaps `timeOfDay` between `"day"` and `"night"`.

### [ ] Relationship Changes
- **Action**: Verify directed edges. Check that updates to `Alice` -> `Bob` do not overwrite values of `Bob` -> `Alice`.

### [ ] Character Evolution
- **Action**: Verify that character intention fields change according to Director updates.

### [ ] Event Queue Scheduling
- **Action**: Add an event and verify that `pendingEvents` contains the scheduled item.
