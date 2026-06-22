# Perchance API Reference

This document records the Perchance APIs, objects, methods, events, properties, syntax, examples, limitations, unknowns, verified APIs, and sandbox restrictions currently known to the Living Novel Engine project.

Source priority for this document:

1. `PROJECT_BIBLE.md`
2. `README.md`
3. User-provided verified API and failed-test notes
4. User-provided Perchance tutorial and tips documentation

If this document contradicts an implementation assumption, this document wins until a newer project document supersedes it.

## Project Constraints

Living Novel Engine targets Perchance Character Chat custom JavaScript.

Required constraints:

- One JavaScript file for implementation.
- Preserve existing Perchance prompts and lore.
- Never invent APIs.
- Use only verified APIs for core implementation unless a new API is explicitly tested and documented.
- Keep architecture stable and backward compatible.
- Perchance runs inside a sandboxed iframe.
- Floating custom UI and unrestricted browser APIs must not be assumed.
- Kokoro must not be used.
- Browser cache and transformers.js cache must not be required.

## Verified APIs

The following APIs are verified by project tests and are allowed for core implementation.

### Generation APIs

#### `oc.generateText()`

Status: verified.

Purpose: generate text from an instruction object or compatible prompt input.

Example from Perchance tips:

```js
let response = await oc.generateText({ instruction });
```

Notes:

- The supplied docs show it used for classification and rewriting character reminder text.
- Return shape may vary by context; examples show both direct text usage and `response.text` usage. Implementation must normalize defensively.

#### `oc.getChatCompletion()`

Status: verified.

Purpose: chat-style completion API.

Project rule:

- May be used only according to verified behavior or after further test documentation is added.

#### `oc.getInstructCompletion()`

Status: verified.

Purpose: instruct-style completion API.

Project rule:

- May be used only according to verified behavior or after further test documentation is added.

## Verified Objects

### `oc`

Status: verified as the root Perchance Character Chat custom-code object.

Known verified members:

- `oc.generateText()`
- `oc.getChatCompletion()`
- `oc.getInstructCompletion()`
- `oc.thread`
- `oc.window`
- `oc.character`
- `oc.userCharacter`

### `oc.thread`

Status: verified.

Purpose: current chat thread object.

Known verified members:

- `oc.thread.messages`
- `oc.thread.messages.push()`
- `oc.thread.messages.splice()`
- `oc.thread.customData`
- `oc.thread.on()`

### `oc.thread.messages`

Status: verified.

Purpose: message array for the current thread.

Verified behavior:

- Can be read.
- Can be appended to with `push()`.
- Can be mutated with `splice()`.
- Existing `message.content` can be edited.

Examples:

```js
let lastMessage = oc.thread.messages.at(-1);
```

```js
oc.thread.messages.push({
  author: "system",
  hiddenFrom: ["user"],
  content: "Hidden system context for the AI."
});
```

### `oc.thread.customData`

Status: verified.

Purpose: persistent thread-level storage.

Living Novel Engine state must be stored here.

Project state keys from `PROJECT_BIBLE.md`:

- `worldState`
- `relationshipGraph`
- `characterStates`
- `pendingEvents`
- `storyArc`
- `chapter`
- `uiState`
- `autoState`
- `lastSpeaker`

Example shape:

```js
oc.thread.customData.livingNovelEngine = {
  worldState: {},
  relationshipGraph: {},
  characterStates: {},
  pendingEvents: [],
  storyArc: {},
  chapter: {},
  uiState: {},
  autoState: {},
  lastSpeaker: null
};
```

### `oc.window`

Status: verified.

Known verified methods:

- `oc.window.show()`
- `oc.window.hide()`

Limitations:

- Perchance runs in a sandboxed iframe.
- Floating custom UI should not be relied upon for core behavior.
- Window APIs may be used only as progressive enhancement.

### `oc.character`

Status: verified as an object.

Purpose: current AI character object.

Documented properties from Perchance examples, not all individually verified for this project:

- `oc.character.name`
- `oc.character.roleInstruction`
- `oc.character.reminderMessage`
- `oc.character.initialMessages`
- `oc.character.avatar`
- `oc.character.avatar.url`

Project guidance:

- Core Living Novel Engine state should prefer `oc.thread.customData` over mutating character-wide settings.
- Character settings may affect existing threads globally, according to the supplied Perchance documentation.

### `oc.userCharacter`

Status: verified read-only.

Purpose: current user character object.

Project guidance:

- Do not write to `oc.userCharacter`.
- Store inferred user-character changes in `oc.thread.customData.characterStates` or another documented thread-state key.

## Verified Message Object Properties

The following message fields are verified by project tests.

### `message.content`

Status: verified.

Purpose: message body text/HTML/Markdown.

Verified behavior:

- Existing message content can be edited.

Example:

```js
let lastMessage = oc.thread.messages.at(-1);
lastMessage.content += "\n\nAdditional text.";
```

### `message.customData`

Status: verified.

Purpose: per-message metadata storage.

Project use:

- May store Director/Narrator metadata for a generated message.
- Do not rely on it for global story memory; use `oc.thread.customData` for persistent engine state.

### `message.instruction`

Status: verified.

Purpose: message-level instruction metadata.

Project use:

- Candidate place to attach generation instructions when Perchance supports it.
- Use cautiously and document exact behavior when implemented.

### `message.hiddenFrom`

Status: verified.

Purpose: hide a message from one or more audiences.

Documented values:

- `"ai"`
- `"user"`

Examples:

```js
oc.thread.messages.push({
  author: "system",
  hiddenFrom: ["user"],
  content: "AI-visible, user-hidden context."
});
```

```text
[SYSTEM; hiddenFrom=ai]: User-visible setup that the AI should not see.
```

### `message.scene`

Status: verified.

Purpose: per-message scene metadata.

Project use:

- May be used later for scene-aware display or state tagging.

### `message.avatar`

Status: verified.

Purpose: per-message avatar metadata.

### `message.wrapperStyle`

Status: verified.

Purpose: per-message CSS styling.

Example from Perchance tips:

```js
oc.thread.on("MessageAdded", function({ message }) {
  message.wrapperStyle = "color:rgb(120, 140, 200);";
});
```

Limitations:

- Styling must work in light and dark mode.
- Styling is presentation only and must not be required for core engine behavior.

### `message.name`

Status: verified.

Purpose: display or author name override.

Example from initial-message syntax:

```text
[SYSTEM; name=Bob]: This message is sent from Bob.
```

### `message.expectsReply`

Status: verified.

Purpose: marks whether a message should trigger or expect a reply.

Example from Perchance tips:

```js
oc.thread.messages.push({
  author: "user",
  content,
  expectsReply: false
});
```

## Verified Events

### `oc.thread.on()`

Status: verified.

Purpose: register thread event handlers.

### `MessageAdded`

Status: documented by Perchance tips and verified through `oc.thread.on()` availability.

Purpose: called when a message is added to the thread.

Examples:

```js
oc.thread.on("MessageAdded", async function({ message }) {
  if(message.author !== "user") return;
  // React to user message.
});
```

```js
oc.thread.on("MessageAdded", async function() {
  let lastMessage = oc.thread.messages.at(-1);
  if(lastMessage.author !== "ai") return;
  // React to latest AI message.
});
```

## Documented Message Authors and Initial Message Syntax

The Perchance tips document these author labels for instruction, reminder, and initial-message formats:

- `[AI]:`
- `[USER]:`
- `[SYSTEM]:`

Initial-message property syntax:

```text
[AI; hiddenFrom=user]: This message is spoken by the AI and hidden from the user.
[SYSTEM; hiddenFrom=ai]: This message is spoken by the system and hidden from the AI.
[SYSTEM; name=Bob]: This message is sent from Bob.
[SYSTEM; name=Bob, hiddenFrom=ai]: Combined properties.
```

Documented behavior:

- Initial messages are normal messages and may eventually be summarized.
- Instruction and reminder messages are not part of normal chat messages and are not seen by summarization.
- Instruction and reminder changes apply to existing threads because they belong to the character, not a single thread.

Project implication:

- Living Novel Engine should store thread-specific story state in `oc.thread.customData`.
- Hidden system messages may provide temporary model context, but persistent state belongs in `oc.thread.customData`.

## Slash Commands

The Perchance tips document these chat commands. They are user-facing commands, not JavaScript APIs.

### AI and System Generation

- `/ai` - trigger an AI response.
- `/ai <instruction>` - trigger an AI response with an instruction.
- `/ai @CharName#123 <instruction>` - prompt a specific character by name and ID.
- `/user <instruction>` - generate a user reply.
- `/sys <instruction>` - trigger a system response.
- `/system <instruction>` - alias for `/sys`.
- `/nar <instruction>` - shorthand for `/sys @Narrator <instruction>`.

### Images

- `/image <description>` - generate an image.
- `/image --num=3 <description>` - generate multiple images.
- `<image>description</image>` - image request embedded in character output.

Image parameters documented:

- `(resolution:::512x768)`
- `(resolution:::512x512)`
- `(resolution:::768x512)`
- `(seed:::84756293)`
- `(negativePrompt:::blurry, low quality)`

### Editors and Thread Utilities

- `/sum` - open summary editor.
- `/mem` - open memory editor.
- `/lore` - open lore editor.
- `/lore <text>` - add a lore entry.
- `/name <name>` - set thread user name.
- `/avatar <url>` - set thread avatar image.
- `/import` - add chat messages in bulk.

Project guidance:

- Slash commands may inform user workflows, but core implementation should use verified JavaScript APIs rather than automating slash-command text unless explicitly tested.

## Perchance Generator Language APIs

The supplied tutorial documents core Perchance generator syntax. These are not `oc` JavaScript APIs, but they are part of the Perchance environment.

### Lists

List syntax:

```text
animal
  pig
  cow
  zebra

sentence
  That [animal] is very sneaky.
```

Rules:

- List items are indented from the list name.
- Use one tab or two spaces for indentation.
- List references use square brackets, for example `[animal]`.
- The referenced list is evaluated into a random item.

### Single-Item Lists

Shorthand syntax:

```text
paragraph = [sentence] [sentence] [sentence]
```

Full list syntax:

```text
paragraph
  [sentence] [sentence] [sentence]
```

Documented distinction:

- `name = value` creates a direct reference style value.
- An indented single-item list behaves like a list with one selectable item.
- This matters when using `selectOne` and variable assignment.

### Escapes

Documented escape sequences:

- `\s` - literal leading/trailing space in a list item.
- `\t` - tab character.
- `\\` - literal backslash.
- `\[` - literal opening square bracket.
- `\=` - literal equals sign.

### Weighted Odds

Syntax:

```text
condiment
  pepper ^2
  salt
  chilli flakes ^0.1
```

Rules:

- Default item odds are `^1`.
- Higher values make selection more likely.
- Fraction syntax such as `^1/10` may be used.

### Curly Shorthand Lists

Syntax:

```text
sentence
  That's a {very|extremely} {tiny|small} [animal]!
```

Features:

- Items separated by `|`.
- Inline odds are supported, for example `{big|large^3|massive}`.
- Square blocks can be nested inside curly blocks.
- Spaces inside curly blocks matter.

Special curly blocks documented:

- `{a}` - chooses `a` or `an` for the next word.
- `{A}` - capitalized form of `{a}`.
- `{s}` - pluralization helper.
- `{1-3}` - random number range.
- `{a-z}` - random lowercase letter range.
- `{A-Z}` - random uppercase letter range.

### Square Blocks and Properties

Square block syntax:

```text
[animal]
[animal.pluralForm]
[animal.pluralForm.titleCase]
```

Documented properties:

- `singularForm`
- `pluralForm`
- `pastTense`
- `presentTense`
- `futureTense`
- `upperCase`
- `lowerCase`
- `sentenceCase`
- `titleCase`

Limitations:

- Grammar properties may not work correctly for all words.
- For critical accuracy, separate explicit list variants are recommended.

### Variable Assignment

Syntax:

```text
sentence
  Her name was [n = name.selectOne]. [n.titleCase], if I recall correctly.
```

Rules:

- Assignments inside square brackets store values under an identifier.
- Identifiers may use letters and numbers and must not start with a number.
- Spaces inside square brackets are ignored.
- Do not wrap list names in square brackets inside square brackets.

Correct:

```text
[n = name.selectOne]
```

Incorrect for intended behavior:

```text
[n = [name].selectOne]
```

### Selection and Evaluation Methods

#### `selectOne`

Purpose: select one item from a list.

Examples:

```text
[f = flower.selectOne]
```

```text
[animal.selectOne]
```

Nested-list behavior:

- If a list contains sublists, `selectOne` selects a sublist, which then resolves to an item from that sublist.

#### `selectMany(count)`

Purpose: select multiple items.

Example:

```text
character = {{a-z}|{A-Z}|{0-9}}
tenCharacters = [character.selectMany(10)]
```

#### `evaluateItem`

Purpose: evaluate a selected item before storing it.

Example:

```text
output
  [f = fruit.selectOne.evaluateItem]?! [f] is way too many!
```

Equivalent shortcut documented:

```text
[f = flower.evaluateItem]
```

### Hierarchical Lists

Syntax:

```text
animal
  mammal
    kangaroo
    pig
  reptile
    lizard
    turtle
```

Access:

```text
[animal.mammal]
[planet.country.town.house.room]
```

Documented behavior:

- Arbitrary nesting is allowed.
- `selectOne` on a parent list can select a sublist.

### Imports

Syntax:

```text
sentence = The {import:noun} is sitting on my {import:noun}.
```

Named import as a list:

```text
noun = {import:noun}
sentence = The [noun.pluralForm] are sitting on my [noun].
```

Specific imported sublist:

```text
animalLists = {import:animal-lists}
sentence = That's definitely not {a} [animalLists.mammal].
```

### `$output`

Purpose: define what an imported generator returns by default.

Examples:

```text
$output
  [mammal]
  [reptile]
  [insect]
```

```text
$output = [description]
```

### Fallback Operator

Syntax:

```text
output
  {A} [a = animal.selectOne] is covered in [a.body || "fur"].
```

Purpose:

- Return the first existing value among chained options.

Example:

```text
[a || b || c]
```

### Dynamic Odds

Syntax:

```text
score = {1-4}

adjective
  not great ^[s == 1]
  good ^[s == 2]
  great ^[s > 2]
```

Rules:

- Odds in square brackets are recomputed dynamically.
- Text comparisons require quotes, for example `^[c == "blue"]`.

## Documented Browser and JavaScript APIs in Tips

The supplied tips include browser and external-library examples. These are documented as examples, but they are not automatically approved for Living Novel Engine core use.

### `fetch()`

Status: documented in examples, not project-verified.

Examples use it to:

- Load a hosted text file.
- Fetch URL content from user messages.

Limitations:

- Cross-origin restrictions may apply.
- Network access may fail.
- Core engine must not depend on it unless tested.

### Dynamic `import()`

Status: documented in examples, not project-verified.

Examples import:

- `@mozilla/readability`
- `pdfjs-dist`
- `pyodide`

Limitations:

- External module loading may be blocked or unstable in the sandbox.
- Core engine must not depend on external imports.

### `DOMParser`

Status: documented in examples, not project-verified.

Purpose in tips: parse fetched HTML before readability extraction.

### `window.Readability`

Status: documented in examples, unknown for this project.

### `window.pdfjsLib`

Status: documented in examples, unknown for this project.

### `window.sessionStorage`

Status: documented in Pyodide workaround, not approved for core engine.

### Pyodide APIs

Status: documented in examples, not approved for core engine.

Mentioned APIs:

- `loadPyodide()`
- `pyodide.loadPackage()`
- `pyodide.runPython()`
- `pyodide.runPythonAsync()`
- `micropip.install()`

Limitations:

- External runtime dependency.
- Not needed for Living Novel Engine v1.
- Must not be used unless separately approved and tested.

### Speech APIs

Status: built-in `SpeechSynthesis` preferred by project notes if speech is added later.

Project rule:

- Do not use Kokoro.
- Do not depend on browser cache or transformers.js cache.
- Use speech only as progressive enhancement after explicit verification.

## Unknown or Unverified APIs

These APIs or properties appear in supplied docs or examples but are not in the verified API list for this project.

### `oc.messageRenderingPipeline`

Status: mentioned in tips, unknown/unverified.

Notes:

- Tips say it may be better for rendering transformations than appending hidden HTML directly.
- Do not use until verified.

### Character mutation properties

Status: documented in examples, not individually verified except `oc.character` object existence.

Examples:

- `oc.character.name`
- `oc.character.roleInstruction`
- `oc.character.reminderMessage`
- `oc.character.initialMessages`
- `oc.character.avatar.url`

Project rule:

- Avoid character-wide mutation for thread-specific story behavior.
- Prefer `oc.thread.customData`.

### Character configuration fields seen in encoded examples

Status: present in supplied Perchance example data, unknown for project use.

Fields:

- `systemMessage`
- `reminderMessage`
- `modelVersion`
- `avatarUrl`
- `fitMessagesInContextMethod`
- `autoGenerateMemories`
- `customCode`
- `creationTime`
- `lastMessageTime`
- `messageInputPlaceholder`
- `metaTitle`
- `metaDescription`
- `metaImage`
- `modelName`
- `temperature`
- `maxTokensPerMessage`
- `textEmbeddingModelName`
- `shortcutButtons`
- `loreBookUrls`
- `avatar.size`
- `avatar.shape`
- `scene.background.url`
- `scene.music.url`
- `systemCharacter.avatar`
- `streamingResponse`
- `folderPath`
- `folderName`
- `uuid`
- `quickAdd`

Project rule:

- Treat encoded example fields as data-format observations, not implementation APIs, unless verified.

### External plugin references

Status: documented but not core APIs.

Mentioned plugins/features:

- text-to-image plugin
- conjugate plugin
- plural plugin
- be plugin
- markdown plugin
- layout-maker plugin
- download-button plugin
- text-to-speech plugin

Project rule:

- Do not depend on plugins for v1 core behavior.

## Known Failed Tests

### Kokoro browser integration

Status: failed.

Observed result:

- Import succeeded.
- Model initialization failed.

Error:

```text
SecurityError:
Failed to read the 'caches' property from 'Window':
Cache storage is disabled because the context is sandboxed and lacks the allow-same-origin flag.
```

Conclusion:

- Do not use Kokoro.
- Do not depend on browser cache.
- Do not depend on transformers.js cache.
- Prefer built-in `SpeechSynthesis` for future speech work, after verification.

## Sandbox Restrictions

Known environment:

- Perchance Character Chat runs inside a sandboxed iframe.
- Some DOM manipulation may work partially.
- Floating custom UI should not be relied upon.
- Unrestricted browser APIs must not be assumed.
- Cache storage can be unavailable because the iframe lacks `allow-same-origin`.
- External imports, external fetches, local storage, session storage, workers, and cache-backed ML libraries may fail.

Implementation implications:

- Core engine behavior must be driven by verified `oc` APIs.
- UI must be progressive enhancement, not a dependency.
- Persistent state must use `oc.thread.customData`.
- Director hidden state should use verified hidden message fields and thread state, not browser storage.

## Living Novel Engine API Usage Rules

### Allowed for v1 Core

- `oc.generateText()`
- `oc.getChatCompletion()` where behavior is explicitly handled
- `oc.getInstructCompletion()` where behavior is explicitly handled
- `oc.thread.messages`
- `oc.thread.messages.push()`
- `oc.thread.messages.splice()`
- Editing `message.content`
- `oc.thread.customData`
- `oc.thread.on()`
- `MessageAdded`
- Verified message fields listed above
- `oc.character` reads where needed
- `oc.userCharacter` reads only

### Progressive Enhancement Only

- `oc.window.show()`
- `oc.window.hide()`
- Message styling via `wrapperStyle`
- Speech synthesis, after verification
- DOM-dependent presentation features

### Not Allowed Without New Verification

- Kokoro
- transformers.js cache-dependent models
- Browser cache storage
- External module imports
- Pyodide
- URL fetching as core behavior
- `oc.messageRenderingPipeline`
- Character-wide mutation for thread-local story memory

## Examples for Living Novel Engine Patterns

### Store Thread State

```js
oc.thread.customData.livingNovelEngine = oc.thread.customData.livingNovelEngine || {};
oc.thread.customData.livingNovelEngine.worldState = oc.thread.customData.livingNovelEngine.worldState || {};
```

### Add Hidden Director Context

```js
oc.thread.messages.push({
  author: "system",
  name: "Director",
  hiddenFrom: ["user"],
  content: "Director-only planning context."
});
```

### Add Visible Narrator Message

```js
oc.thread.messages.push({
  author: "system",
  name: "Narrator",
  content: "The room settles into a tense silence."
});
```

### React to New Messages

```js
oc.thread.on("MessageAdded", async function({ message }) {
  if(message.author !== "user") return;
  // Process user message as possible canon or story input.
});
```

### Hide Appended Presentation From AI

Documented tips pattern:

```js
lastMessage.content += "<!--hidden-from-ai-start-->presentation<!--hidden-from-ai-end-->";
```

Project caution:

- This pattern is documented but should be used carefully.
- Prefer verified message fields for core logic.
- `oc.messageRenderingPipeline` is mentioned by tips but remains unverified.

## Documentation Gaps

The following need future verification before implementation use:

- Exact argument and return shapes for `oc.getChatCompletion()`.
- Exact argument and return shapes for `oc.getInstructCompletion()`.
- Exact return shape for `oc.generateText()` in this project environment.
- Complete supported event names beyond `MessageAdded`.
- Exact `oc.window.show()` and `oc.window.hide()` signatures.
- Whether `oc.messageRenderingPipeline` exists and how it behaves.
- Whether `message.scene` and `message.avatar` have stable schemas.
- Whether `message.instruction` affects model generation directly or is metadata only.
- Which `oc.character` nested properties are writable in the current sandbox.
- Whether built-in `SpeechSynthesis` is usable in the Perchance iframe.

## Maintenance Rule

Whenever a new Perchance API, property, event, method, browser capability, or limitation is tested, update this document in the same change as the code or test note that depends on it.
