/**
 * Living Novel Engine - v1.2.2
 * Streamlined, non-intrusive story coordinator for Perchance Character Chat.
 * Uses native shortcutButtons and chat-integrated hidden messages to bypass sandbox constraints.
 */
(function() {
  "use strict";

  // --- CONFIGURABLE CONSTANTS ---
  const AUTO_STEP_DELAY_MS = 2500;     // Delay before triggering the next turn (gives user time to read)
  const GENERATION_TIMEOUT_MS = 15000;  // 15-second self-healing safety lock timeout

  // --- ENGINE STATE ---
  // Store minimal persistent state directly in oc.thread.customData
  function getEngineState() {
    if (typeof oc !== "undefined" && oc.thread && oc.thread.customData) {
      oc.thread.customData.livingNovelEngine = oc.thread.customData.livingNovelEngine || {
        isAutoRunning: false,
        isDirectorMode: false,
        isProcessing: false,
        timeoutId: null
      };
      return oc.thread.customData.livingNovelEngine;
    }
    // Headless fallback for testing
    return { isAutoRunning: false, isDirectorMode: false, isProcessing: false, timeoutId: null };
  }

  // --- NATIVE BUTTONS CONTROLLER ---
  // Updates the shortcut buttons rendered natively by Perchance above the input box
  function updateShortcutButtons() {
    if (typeof oc === "undefined" || !oc.thread) return;

    const state = getEngineState();
    oc.thread.shortcutButtons = [
      {
        name: state.isAutoRunning ? "■ Stop Auto" : "▶ Auto",
        message: "/auto",
        autoSend: true
      },
      {
        name: "⏭ Continue",
        message: "/continue",
        autoSend: true
      },
      {
        name: state.isDirectorMode ? "■ Exit Dir" : "💬 Director",
        message: "/director",
        autoSend: true
      }
    ];
  }

  // --- NATIVE GENERATION TRIGGER ---
  // Triggers one turn of AI generation by pushing a hidden user message with expectsReply: true
  // We experimentally verify if this triggers Perchance's native generation pipeline
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
        console.warn("[Living Novel Engine] [WARNING] Native generation trigger timed out. The platform may have failed to trigger a response to the hidden message. Disabling Auto/Continue mode to fail safely.");
        freshState.isProcessing = false;
        freshState.isAutoRunning = false; // Disable Auto
        updateShortcutButtons();          // Revert button label to "▶ Auto"
        freshState.timeoutId = null;
      }
    }, GENERATION_TIMEOUT_MS);

    try {
      // Push a hidden user message to trigger the native generator
      oc.thread.messages.push({
        author: "user",
        hiddenFrom: ["user"],
        content: "[Director: Continue the story. Generate the next logical message. This can be Ike speaking, or the Narrator describing the scenery and actions. Do NOT write dialogue or actions for Anon.]",
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

  // --- PRIVATE DIRECTOR AI CALL ---
  // Calls the Director AI in the background to handle private commands and edits
  async function callDirectorAI(userInstruction) {
    if (typeof oc === "undefined" || typeof oc.generateText !== "function") {
      return JSON.stringify({ reply: "I am the Director. (Running in offline mode)", actions: [] });
    }

    // Compile recent chat history (excluding private Director messages)
    const mainHistory = oc.thread.messages
      .filter(msg => !(msg.customData && msg.customData.isDirectorPrivate === true))
      .slice(-12)
      .map(msg => `${msg.name || msg.author}: ${msg.content}`)
      .join("\n");

    const systemPrompt = `You are the Director AI. You are helping the user manage their roleplay story with the character "Ike". The user's character is "Anon".
Here is the recent story history:
${mainHistory}

The user is speaking to you privately. They want to edit the story, delete messages, change characters, lore, or memories.
User's instruction: "${userInstruction}"

You must respond in the following JSON format:
{
  "reply": "Your conversational response to the user explaining what changes you made.",
  "actions": [
    { "type": "delete_last" },
    { "type": "edit_last", "content": "new text content" },
    { "type": "update_lore", "content": "new lore details" },
    { "type": "update_memory", "content": "new memory details" }
  ]
}
Rules:
- If no action was requested, return an empty actions array.
- Only perform actions explicitly requested by the user.
- Respond ONLY with the raw JSON object. Do not add markdown code blocks or explanations outside the JSON.`;

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
      } else if (action.type === "edit_last" && action.content) {
        // Edit the last story message
        for (let i = oc.thread.messages.length - 1; i >= 0; i--) {
          const msg = oc.thread.messages[i];
          if (!(msg.customData && msg.customData.isDirectorPrivate === true)) {
            msg.content = action.content;
            console.log("[Living Novel Engine] Director edited last story message.");
            break;
          }
        }
      } else if (action.type === "update_lore" && action.content) {
        // Save lore to customData
        oc.thread.customData.lore = action.content;
        console.log("[Living Novel Engine] Director updated story lore.");
      } else if (action.type === "update_memory" && action.content) {
        // Save memory to customData
        oc.thread.customData.memory = action.content;
        console.log("[Living Novel Engine] Director updated Ike's memory.");
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
    state.isAutoRunning = false;
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

            if (cmd === "/continue") {
              console.log("[Living Novel Engine] Intercepted /continue");
              triggerNextTurn();
            } 
            else if (cmd === "/auto") {
              console.log("[Living Novel Engine] Intercepted /auto");
              state.isAutoRunning = !state.isAutoRunning;
              updateShortcutButtons();
              
              if (state.isAutoRunning) {
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
                  content: "*The Director opens a private connection in the chat. Any messages you type here will be private and hidden from Ike. Type instructions to change the story, delete messages, or edit lore. Click '■ Exit Dir' above to close this connection.*",
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

          // Check if it's a standard text message
          if (state.isDirectorMode) {
            // A private message to the Director!
            message.hiddenFrom = ["ai"];
            message.expectsReply = false;
            message.customData = message.customData || {};
            message.customData.isDirectorPrivate = true;

            // Call Director AI and process response
            const responseText = await callDirectorAI(content);
            
            let replyText = responseText;
            let actions = [];
            try {
              // Extract JSON block if model wrapped it in markdown
              let jsonStr = responseText.trim();
              const jsonMatch = responseText.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                jsonStr = jsonMatch[0];
              }
              const parsed = JSON.parse(jsonStr);
              replyText = parsed.reply || "I processed your request.";
              actions = parsed.actions || [];
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

            // Execute the actions (mutations)
            executeDirectorActions(actions);
          } else {
            // Standard user message in the story!
            // If the auto loop was running, automatically pause it so the user can speak
            if (state.isAutoRunning) {
              console.log("[Living Novel Engine] User interjected. Pausing Auto loop.");
              state.isAutoRunning = false;
              updateShortcutButtons();
            }
          }
        }

        // 2. Intercept AI messages (to handle lock release and Auto loop progression)
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

          // If Auto Endless is active, trigger the next turn after the configurable delay
          if (state.isAutoRunning) {
            setTimeout(function() {
              const freshState = getEngineState();
              if (freshState.isAutoRunning) {
                console.log("[Living Novel Engine] Event-driven Auto loop: triggering next turn...");
                triggerNextTurn();
              }
            }, AUTO_STEP_DELAY_MS);
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