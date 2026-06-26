/**
 * Living Novel Engine - v2.0.0 (Streamlined Two-Button Edition)
 * Minimalist, event-driven story coordinator for Perchance AI Character Chat.
 * Uses native shortcutButtons and chat-integrated hidden messages to bypass sandbox constraints.
 */
(function() {
  "use strict";

  // --- CONFIGURABLE CONSTANTS ---
  const STEP_DELAY_MS = 1500;           // Delay between turns in the Continue x5 loop (gives user time to read)
  const GENERATION_TIMEOUT_MS = 20000;  // 20-second self-healing safety lock timeout

  // --- ENGINE STATE ---
  // Store minimal persistent state directly in oc.thread.customData
  function getEngineState() {
    if (typeof oc !== "undefined" && oc.thread && oc.thread.customData) {
      oc.thread.customData.livingNovelEngine = oc.thread.customData.livingNovelEngine || {
        turnsRemaining: 0,
        isDirectorMode: false,
        isProcessing: false,
        timeoutId: null
      };
      return oc.thread.customData.livingNovelEngine;
    }
    // Fallback for testing
    return { turnsRemaining: 0, isDirectorMode: false, isProcessing: false, timeoutId: null };
  }

  // --- NATIVE BUTTONS CONTROLLER ---
  // Updates the shortcut buttons rendered natively by Perchance above the input box
  function updateShortcutButtons() {
    if (typeof oc === "undefined" || !oc.thread) return;

    const state = getEngineState();
    
    // Dynamic labels to reflect active state
    const continueLabel = state.turnsRemaining > 0 ? `■ Stop (${state.turnsRemaining})` : "Continue x5";
    const directorLabel = state.isDirectorMode ? "■ Close Dir" : "Request Changes";

    oc.thread.shortcutButtons = [
      {
        name: continueLabel,
        message: "/continue5",
        autoSend: true,
        insertionType: "replace",
        clearAfterSend: true
      },
      {
        name: directorLabel,
        message: "/director",
        autoSend: true,
        insertionType: "replace",
        clearAfterSend: true
      }
    ];
  }

  // --- NATIVE GENERATION TRIGGER ---
  // Triggers one turn of AI generation by pushing a hidden system message with expectsReply: true
  function triggerNextTurn() {
    if (typeof oc === "undefined" || !oc.thread || !oc.thread.messages) return;

    const state = getEngineState();
    if (state.isProcessing) {
      console.log("[Living Novel Engine] Trigger turn ignored: generation is already in progress.");
      return;
    }
    state.isProcessing = true;

    // Start a self-healing timeout to release the lock if generation hangs or fails
    if (state.timeoutId) {
      clearTimeout(state.timeoutId);
    }
    state.timeoutId = setTimeout(function() {
      const freshState = getEngineState();
      if (freshState.isProcessing) {
        console.warn("[Living Novel Engine] Native generation timed out. Disabling loop to fail safely.");
        freshState.isProcessing = false;
        freshState.turnsRemaining = 0;
        updateShortcutButtons();
        freshState.timeoutId = null;
      }
    }, GENERATION_TIMEOUT_MS);

    try {
      const charName = oc.character.name || "Ike";
      const userName = oc.userCharacter.name || "Anon";

      // Push a hidden system instruction message to trigger the native generator
      oc.thread.messages.push({
        author: "system",
        hiddenFrom: ["user"],
        content: `[System Instruction: This is an automated story continuation turn.
Write the next single message in the story.
You must choose who speaks or acts next: ${charName}, ${userName}, or the Narrator.
Start your message with the speaker's name in brackets, like:
[${charName}] "..."
[${userName}] "..."
[Narrator] ...
If the scene has reached a natural pause where you must wait for the player's input, start your message with [Stop] followed by any final words.
Do NOT write dialogue for multiple characters in one message. Write ONLY the message for the chosen speaker.]`,
        expectsReply: true
      });
    } catch (err) {
      console.error("[Living Novel Engine] Trigger turn failed:", err);
      state.isProcessing = false;
      if (state.timeoutId) {
        clearTimeout(state.timeoutId);
        state.timeoutId = null;
      }
    }
  }

  // --- SAFE API OUTPUT NORMALIZATION ---
  // Safely extracts string content from oc.generateText() regardless of raw string or object return type
  function normalizeText(response) {
    if (!response) return "";
    if (typeof response === "string") return response;
    if (response.text && typeof response.text === "string") return response.text;
    if (typeof response === "object") {
      if (response.content && typeof response.content === "string") return response.content;
      return JSON.stringify(response);
    }
    return String(response);
  }

  // --- PARSE AND FORMAT AI STORY TURNS ---
  // Parses [Speaker] and [Stop] prefixes from the generated text and updates message metadata accordingly
  function parseAIResponse(message) {
    if (!message || typeof message.content !== "string") return;

    let content = message.content.trim();
    const charName = oc.character.name || "Ike";
    const userName = oc.userCharacter.name || "Anon";

    // 1. Check for [Stop] prefix (case-insensitive) to halt the loop early
    const stopMatch = content.match(/^\[stop\]\s*([\s\S]*)$/i);
    if (stopMatch) {
      console.log("[Living Novel Engine] [Stop] prefix detected. Halting Continue loop.");
      const state = getEngineState();
      state.turnsRemaining = 0;
      content = stopMatch[1].trim();
    }

    // 2. Match speaker name in brackets, e.g. [Ike] or [Narrator]
    const speakerMatch = content.match(/^\[([^\]]+)\]\s*([\s\S]*)$/);
    if (speakerMatch) {
      const speaker = speakerMatch[1].trim();
      const body = speakerMatch[2].trim();

      const lowerSpeaker = speaker.toLowerCase();
      if (lowerSpeaker === charName.toLowerCase() || lowerSpeaker === "ai" || lowerSpeaker === "ike") {
        message.name = charName;
        message.author = "ai";
      } else if (lowerSpeaker === userName.toLowerCase() || lowerSpeaker === "user" || lowerSpeaker === "anon") {
        message.name = userName;
        message.author = "user";
      } else if (lowerSpeaker === "narrator" || lowerSpeaker === "system" || lowerSpeaker === "nar") {
        message.name = "Narrator";
        message.author = "system";
      } else {
        // Custom speaker name generated by the AI
        message.name = speaker;
        message.author = "ai";
      }
      message.content = body;
    } else {
      // Fallback to default AI character if no speaker prefix is found
      message.name = charName;
      message.author = "ai";
      message.content = content;
    }
  }

  // --- PRIVATE DIRECTOR AI CALL ---
  // Calls the Director AI in the background to handle private commands and edits
  async function callDirectorAI(userInstruction) {
    if (typeof oc === "undefined" || typeof oc.generateText !== "function") {
      return JSON.stringify({ reply: "I am the Director. (Running in offline mode)", actions: [] });
    }

    // Compile recent chat history (excluding private Director messages)
    const mainHistory = oc.thread.messages
      .filter(msg => !(msg.customData && msg.customData.isDirectorPrivate === true))
      .slice(-10)
      .map(msg => `${msg.name || msg.author}: ${msg.content}`)
      .join("\n");

    const charName = oc.character.name || "Ike";
    const roleInstruction = oc.character.roleInstruction || "";
    const reminderMessage = oc.character.reminderMessage || "";

    const systemPrompt = `You are the Director AI for a roleplay novel chat between the user (Anon) and the character ${charName}.
You have direct access to the character's settings (roleplay prompt, lore, memory) and the story history.
Your job is to help the user edit the story, delete messages, or update character personality, lore, and memory according to their request.

Here is the recent story history:
${mainHistory}

Active Character Settings:
- Name: "${charName}"
- Role Instruction (Lore & Personality): "${roleInstruction}"
- Reminder Message (Active Memory): "${reminderMessage}"

The user's private instruction to you: "${userInstruction}"

Based on the user's instruction, determine what changes to make. You can modify character settings, delete the last message, or edit the last message.
Your response MUST be a valid JSON object with the following fields:
{
  "reply": "Your conversational reply to the user explaining what you did.",
  "characterChanges": {
    "name": "New name (only if requested)",
    "roleInstruction": "Full updated role instructions incorporating new lore/rules (only if requested)",
    "reminderMessage": "Full updated reminder message incorporating new memories (only if requested)"
  },
  "actions": [
    { "type": "delete_last" },
    { "type": "edit_last", "content": "new text content" }
  ]
}
Rules:
1. Only return the fields that are being modified. If no character settings change, omit "characterChanges". If no actions are needed, omit "actions" or make it empty.
2. Maintain the core personality of ${charName} unless explicitly asked to change it.
3. Respond ONLY with the raw JSON object. Do not wrap it in markdown code blocks or add any other text outside the JSON.`;

    try {
      const rawResponse = await oc.generateText({ instruction: systemPrompt });
      return normalizeText(rawResponse);
    } catch (err) {
      console.error("[Living Novel Engine] Director AI generation failed:", err);
      return JSON.stringify({ reply: "I encountered an error trying to process your request.", actions: [] });
    }
  }

  // --- ACTION EXECUTION ENGINE ---
  // Parses and executes Director AI structural commands on the main thread
  function executeDirectorActions(actions) {
    if (!actions || !Array.isArray(actions) || typeof oc === "undefined" || !oc.thread || !oc.thread.messages) return;

    actions.forEach(action => {
      if (action.type === "delete_last") {
        // Delete the last story message (ignoring private Director messages)
        for (let i = oc.thread.messages.length - 1; i >= 0; i--) {
          const msg = oc.thread.messages[i];
          if (!(msg.customData && msg.customData.isDirectorPrivate === true)) {
            oc.thread.messages.splice(i, 1);
            console.log("[Living Novel Engine] Director deleted last story message.");
            break;
          }
        }
      } else if (action.type === "edit_last" && typeof action.content === "string") {
        // Edit the last story message
        for (let i = oc.thread.messages.length - 1; i >= 0; i--) {
          const msg = oc.thread.messages[i];
          if (!(msg.customData && msg.customData.isDirectorPrivate === true)) {
            msg.content = action.content;
            console.log("[Living Novel Engine] Director edited last story message.");
            break;
          }
        }
      }
    });
  }

  // --- DIRECTOR MODE CLEANUP ---
  // Deletes all private Director-mode messages from the chat feed when exiting
  function cleanDirectorMessages() {
    if (typeof oc === "undefined" || !oc.thread || !oc.thread.messages) return;

    console.log("[Living Novel Engine] Cleaning up private Director conversation...");
    for (let i = oc.thread.messages.length - 1; i >= 0; i--) {
      const msg = oc.thread.messages[i];
      if (msg.customData && msg.customData.isDirectorPrivate === true) {
        oc.thread.messages.splice(i, 1);
      }
    }
  }

  // --- BOOTSTRAP ---
  function bootstrap() {
    console.log("[Living Novel Engine] Initializing engine...");

    const state = getEngineState();
    
    // Always heal locks and reset loop running state on refresh/load to avoid dangling states
    state.isProcessing = false;
    state.turnsRemaining = 0;
    state.isDirectorMode = false;
    if (state.timeoutId) {
      clearTimeout(state.timeoutId);
      state.timeoutId = null;
    }

    // Initialize and display native buttons
    updateShortcutButtons();

    // Hook to Perchance MessageAdded event
    if (typeof oc !== "undefined" && oc.thread && typeof oc.thread.on === "function") {
      oc.thread.on("MessageAdded", async function(event) {
        // Defensively handle both event shapes: { message } and message directly
        let message = event;
        if (event && event.message) {
          message = event.message;
        }

        if (!message) {
          console.warn("[Living Novel Engine] MessageAdded fired but message object is null.");
          return;
        }

        console.log(`[Living Novel Engine] MessageAdded fired. Author: ${message.author}, Content: ${message.content ? message.content.slice(0, 30) : ""}`);

        const state = getEngineState();

        // 1. Intercept USER messages (commands & chat entries)
        if (message.author === "user") {
          const content = message.content ? message.content.trim() : "";
          
          // Check if it's a native button slash command
          if (content.startsWith("/")) {
            const cmd = content.toLowerCase();
            
            // Set expectsReply = false and delete the command immediately to clean the feed
            message.expectsReply = false;
            try {
              const idx = oc.thread.messages.indexOf(message);
              if (idx >= 0) {
                oc.thread.messages.splice(idx, 1);
              } else {
                // Fallback search by content and author
                for (let i = oc.thread.messages.length - 1; i >= 0; i--) {
                  if (oc.thread.messages[i].content === message.content && oc.thread.messages[i].author === message.author) {
                    oc.thread.messages.splice(i, 1);
                    break;
                  }
                }
              }
            } catch (e) {
              console.error("[Living Novel Engine] Failed to delete command message:", e);
            }

            if (cmd === "/continue5") {
              console.log("[Living Novel Engine] Intercepted /continue5");
              
              if (state.turnsRemaining > 0) {
                // Clicking the button while the loop is running acts as a Stop toggle
                console.log("[Living Novel Engine] Stopping active Continue loop.");
                state.turnsRemaining = 0;
                state.isProcessing = false;
                if (state.timeoutId) {
                  clearTimeout(state.timeoutId);
                  state.timeoutId = null;
                }
                updateShortcutButtons();
              } else {
                // Start the Continue x5 loop
                state.turnsRemaining = 5;
                updateShortcutButtons();
                triggerNextTurn();
              }
            } 
            else if (cmd === "/director") {
              console.log("[Living Novel Engine] Intercepted /director");
              state.isDirectorMode = !state.isDirectorMode;
              updateShortcutButtons();

              if (state.isDirectorMode) {
                // Welcoming message from the Director
                const welcomeMsg = {
                  author: "system",
                  name: "Director",
                  content: "*The Director opens a private connection. Ask me to edit the story, delete messages, change characters, lore, or memories. Ike cannot see these messages. Click '■ Close Dir' to save and exit.*",
                  hiddenFrom: ["ai"],
                  expectsReply: false,
                  customData: { isDirectorPrivate: true }
                };
                oc.thread.messages.push(welcomeMsg);
              } else {
                cleanDirectorMessages();
              }
            }
            return;
          }

          // Check if it's a text message in Director mode
          if (state.isDirectorMode) {
            // Mark the user message as a private request to the Director
            message.hiddenFrom = ["ai"];
            message.expectsReply = false;
            message.customData = message.customData || {};
            message.customData.isDirectorPrivate = true;

            // Call Director AI and process response
            const responseText = await callDirectorAI(content);
            
            let replyText = responseText;
            let actions = [];
            let characterChanges = null;
            try {
              // Extract JSON block if model wrapped it in markdown code blocks
              let jsonStr = responseText.trim();
              const jsonMatch = responseText.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                jsonStr = jsonMatch[0];
              }
              const parsed = JSON.parse(jsonStr);
              replyText = parsed.reply || "I processed your request.";
              actions = parsed.actions || [];
              characterChanges = parsed.characterChanges || null;
            } catch (e) {
              console.warn("[Living Novel Engine] Director AI output not in JSON format. Displaying as text.");
            }

            // Display Director's response privately in the chat
            const directorReply = {
              author: "system",
              name: "Director",
              content: replyText,
              hiddenFrom: ["ai"],
              expectsReply: false,
              customData: { isDirectorPrivate: true }
            };
            oc.thread.messages.push(directorReply);

            // Execute the actions and character edits
            if (characterChanges) {
              if (characterChanges.name) oc.character.name = characterChanges.name;
              if (characterChanges.roleInstruction) oc.character.roleInstruction = characterChanges.roleInstruction;
              if (characterChanges.reminderMessage) oc.character.reminderMessage = characterChanges.reminderMessage;
              console.log("[Living Novel Engine] Applied character settings updates from Director.");
            }
            executeDirectorActions(actions);
          } else {
            // Standard user message in the story!
            // If the continue loop was running, immediately stop it so the user can speak
            if (state.turnsRemaining > 0) {
              console.log("[Living Novel Engine] User interjected. Stopping Continue loop.");
              state.turnsRemaining = 0;
              updateShortcutButtons();
            }
          }
        }

        // 2. Intercept AI/System messages (to handle lock release and loop progression)
        else if (message.author === "ai" || message.author === "system") {
          // If it's a private Director message, ignore it
          if (message.customData && message.customData.isDirectorPrivate === true) {
            return;
          }

          // Release the processing lock since an AI/Story reply has arrived
          if (state.isProcessing) {
            console.log("[Living Novel Engine] AI reply received. Releasing generation lock.");
            state.isProcessing = false;
            if (state.timeoutId) {
              clearTimeout(state.timeoutId);
              state.timeoutId = null;
            }
          }

          // If the Continue loop is active, parse and progress
          if (state.turnsRemaining > 0) {
            // Parse the speaker prefix and check for Stop commands
            parseAIResponse(message);

            // Decrement remaining turns and update buttons
            if (state.turnsRemaining > 0) {
              state.turnsRemaining--;
            }
            updateShortcutButtons();

            // Progress to the next turn if turns are still remaining
            if (state.turnsRemaining > 0) {
              setTimeout(function() {
                const freshState = getEngineState();
                if (freshState.turnsRemaining > 0) {
                  console.log(`[Living Novel Engine] Continue loop progression: triggering next turn (${freshState.turnsRemaining} remaining)...`);
                  triggerNextTurn();
                }
              }, STEP_DELAY_MS);
            } else {
              console.log("[Living Novel Engine] Continue loop completed.");
              updateShortcutButtons();
            }
          }
        }
      });
      console.log("[Living Novel Engine] Successfully hooked into MessageAdded event.");
    }

    console.log("[Living Novel Engine] Bootstrap complete.");
  }

  // Execute bootstrap if in Perchance, or export for testing
  if (typeof oc !== "undefined") {
    bootstrap();
  }

  // Expose interface globally
  const EngineInterface = {
    bootstrap: bootstrap,
    getState: getEngineState,
    updateButtons: updateShortcutButtons,
    cleanDirector: cleanDirectorMessages
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = EngineInterface;
  } else if (typeof globalThis !== "undefined") {
    globalThis.LivingNovelEngine = EngineInterface;
  }
})();