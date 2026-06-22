/**
 * Living Novel Engine - v1.0.0
 * Persistent story engine running within a Perchance Character Chat sandbox.
 * Coordinates narrative progression via Director, Narrator, and Character modules.
 */
(function() {
  "use strict";

  // --- VERSIONING ---
  /**
   * Engine metadata and version information.
   * @type {{NAME: string, VERSION: string}}
   */
  const EngineMeta = {
    NAME: "Living Novel Engine",
    VERSION: "1.0.0"
  };

  // --- UTILITIES ---
  /**
   * Deep clones an object to prevent direct mutations of state.
   * @param {*} obj - The object to clone.
   * @returns {*} Deeply cloned object.
   */
  function deepClone(obj) {
    if (obj === null || typeof obj !== "object") {
      return obj;
    }
    return JSON.parse(JSON.stringify(obj));
  }

  // --- ENGINE STATUS ---
  /**
   * Telemetry and runtime health indicators.
   * @type {{initialized: boolean, version: string, build: string, runtime: string, lastSave: string|null, debugEnabled: boolean}}
   */
  const EngineStatus = {
    initialized: false,
    version: EngineMeta.VERSION,
    build: "202606222321",
    runtime: typeof oc !== "undefined" ? "perchance" : "node",
    lastSave: null,
    debugEnabled: true
  };

  // --- DEBUG LOGGER ---
  /**
   * Handles engine-wide logging with severity levels and standard prefixes.
   * Exposes a public interface for other modules to log diagnostics.
   */
  const DebugLogger = (function() {
    const PREFIX = `[${EngineMeta.NAME} v${EngineMeta.VERSION}]`;

    /**
     * Format a message with the engine prefix.
     * @param {string} level - Log level (e.g. INFO, WARN).
     * @param {string} msg - Message content.
     * @returns {string} Formatted log string.
     */
    function format(level, msg) {
      return `${PREFIX} [${level}] ${msg}`;
    }

    return {
      /**
       * Log informational message.
       * @param {string} msg
       */
      info: function(msg) {
        if (EngineStatus.debugEnabled) console.log(format("INFO", msg));
      },

      /**
       * Log debug message.
       * @param {string} msg
       */
      debug: function(msg) {
        if (EngineStatus.debugEnabled) console.debug(format("DEBUG", msg));
      },

      /**
       * Log warning message.
       * @param {string} msg
       */
      warn: function(msg) {
        if (EngineStatus.debugEnabled) console.warn(format("WARN", msg));
      },

      /**
       * Log error message.
       * @param {string} msg
       */
      error: function(msg) {
        console.error(format("ERROR", msg));
      }
    };
  })();

  // --- STATE MANAGER ---
  /**
   * Manages persistence of the engine state stored in oc.thread.customData.
   * Enforces validation schemas and deep copy safety to prevent data corruption.
   * Only this module may directly read/write the persistent thread store.
   */
  const StateManager = (function() {
    const STATE_KEY = "livingNovelEngine";

    /**
     * Returns a blank template of the engine's state schema.
     * @returns {Object} Default state layout.
     */
    function getDefaultState() {
      return {
        worldState: {
          CurrentScene: "",
          WorldTime: {
            epoch: 0,
            daysElapsed: 0,
            hour: 12
          },
          Weather: "clear",
          Locations: {},
          Objects: [],
          GlobalFlags: {},
          Timeline: [],
          QuestState: {},
          ActiveNPCs: [],
          AmbientMood: "neutral"
        },
        relationshipGraph: {
          nodes: [],
          edges: {}
        },
        characterStates: {},
        pendingEvents: [],
        storyArc: {
          currentAct: 1,
          theme: "",
          goal: "",
          checkpoints: [],
          progress: 0
        },
        chapter: {
          number: 1,
          title: "Introduction",
          summary: ""
        },
        uiState: {
          isWindowVisible: false,
          theme: "dark"
        },
        autoState: {
          mode: "idle",
          turnsRemaining: 0,
          isRunning: false,
          isProcessing: false
        },
        lastSpeaker: null
      };
    }

    /**
     * Resolves the customData object. If unverified or missing on the thread,
     * safe initialisation falls back to local simulation during dry-runs.
     * [UNVERIFIED] - oc.thread might not be initialised at load time.
     * @returns {Object} Ref to thread customData.
     */
    function getThreadCustomData() {
      if (typeof oc !== "undefined" && oc.thread && oc.thread.customData) {
        return oc.thread.customData;
      }
      if (typeof globalThis !== "undefined") {
        globalThis.__mockCustomData = globalThis.__mockCustomData || {};
        return globalThis.__mockCustomData;
      }
      return {};
    }

    return {
      /**
       * Verifies if state is present, or initialises it with default schema.
       */
      init: function() {
        const customData = getThreadCustomData();
        if (!customData[STATE_KEY]) {
          DebugLogger.info("Initializing new state schema in thread customData.");
          customData[STATE_KEY] = getDefaultState();
        } else {
          DebugLogger.info("State schema already exists. Restoring engine state.");
          const defaults = getDefaultState();
          const current = customData[STATE_KEY];
          for (let key in defaults) {
            if (current[key] === undefined) {
              current[key] = defaults[key];
              DebugLogger.warn(`Restoring missing key "${key}" to existing state.`);
            }
          }
        }
        EngineStatus.initialized = true;
      },

      /**
       * Retrieves a read-only clone of the current engine state.
       * @returns {Object} Deep-cloned engine state object.
       */
      load: function() {
        const customData = getThreadCustomData();
        if (!customData[STATE_KEY]) {
          this.init();
        }
        return deepClone(customData[STATE_KEY]);
      },

      /**
       * Saves changes to the state store after validation.
       * @param {Object} newState - The mutated state to save.
       */
      save: function(newState) {
        if (!newState || typeof newState !== "object") {
          DebugLogger.error("Failed to save state: newState must be a valid object.");
          return;
        }
        const customData = getThreadCustomData();
        customData[STATE_KEY] = deepClone(newState);
        EngineStatus.lastSave = new Date().toISOString();
        DebugLogger.debug("State saved successfully.");
      },

      /**
       * Helper to perform an atomic mutation on the state.
       * @param {function(Object): void} mutationFn - Function that mutates the state object.
       */
      mutate: function(mutationFn) {
        try {
          const state = this.load();
          mutationFn(state);
          this.save(state);
        } catch (err) {
          DebugLogger.error(`Mutation failed: ${err.message}`);
        }
      }
    };
  })();

  // --- SAFE GENERATE TEXT WRAPPER ---
  /**
   * Safe wrapper for oc.generateText() that inspects return shape and handles headless environments.
   * [UNVERIFIED] - oc.generateText might return a string or an object with a .text property.
   * @param {Object} options - Generation parameters.
   * @returns {Promise<string>} Generated text content.
   */
  async function safeGenerateText(options) {
    if (typeof oc !== "undefined" && typeof oc.generateText === "function") {
      try {
        const response = await oc.generateText(options);
        if (!response) return "";
        if (typeof response === "string") return response;
        if (response.text && typeof response.text === "string") return response.text;
        return JSON.stringify(response);
      } catch (err) {
        DebugLogger.error(`oc.generateText failed: ${err.message}`);
        throw err;
      }
    }
    
    // Headless mock for local node testing
    DebugLogger.warn("[MOCK LLM] Simulating generation in headless environment.");
    const inst = (options.instruction || "").toLowerCase();
    if (inst.includes("evaluate how this user message updates") || inst.includes("evaluate how this updates")) {
      // Mock Speak mode gradual updates
      return JSON.stringify({
        characterStates: {
          user: {
            Identity: "The brave explorer",
            Beliefs: ["This cave holds danger"],
            Intentions: "Search for a way out",
            Habits: ["Asks questions often"],
            SpeechStyle: "Determined"
          }
        },
        relationships: [
          { from: "user", to: "Bob", affection: 5, trust: 10 }
        ]
      });
    }
    if (inst.includes("evaluate this canon command")) {
      // Mock CANON update command
      return JSON.stringify({
        worldState: {
          CurrentScene: "Haunted Tavern",
          AmbientMood: "spooky"
        },
        relationshipGraph: {
          edges: {
            Alice: {
              Bob: { affection: 80, trust: 90 }
            }
          }
        }
      });
    }
    return "Mock Director private planning strategical notes.";
  }

  // --- RELATIONSHIP GRAPH ---
  /**
   * Manages directed edge connections representing character social standings.
   */
  const RelationshipGraph = (function() {
    /**
     * Default relationship edge values.
     * @returns {Object}
     */
    function getDefaultEdge() {
      return {
        affection: 0,
        trust: 0,
        respect: 0,
        fear: 0,
        dependence: 0,
        rivalry: 0,
        recentInteractions: [],
        hiddenFeelings: "",
        lastChanged: null
      };
    }

    return {
      /**
       * Register a character ID in relationship graph nodes.
       * @param {Object} state - Mutable state object.
       * @param {string} charId - The character ID.
       */
      addCharacter: function(state, charId) {
        if (!state.relationshipGraph.nodes.includes(charId)) {
          state.relationshipGraph.nodes.push(charId);
          state.relationshipGraph.edges[charId] = {};
        }
      },

      /**
       * Sets relationship edge stats between two characters.
       * @param {Object} state - Mutable state object.
       * @param {string} from - Source character ID.
       * @param {string} to - Destination character ID.
       * @param {Object} params - Metrics to update.
       */
      setEdge: function(state, from, to, params) {
        this.addCharacter(state, from);
        this.addCharacter(state, to);

        const currentEdges = state.relationshipGraph.edges[from];
        if (!currentEdges[to]) {
          currentEdges[to] = getDefaultEdge();
        }

        const edge = currentEdges[to];
        for (let key in params) {
          if (edge[key] !== undefined) {
            edge[key] = params[key];
          }
        }
        edge.lastChanged = new Date().toISOString();
        DebugLogger.debug(`Updated relationship edge from ${from} to ${to}`);
      },

      /**
       * Fetches relationship edge details between two characters.
       * @param {Object} state - Read-only or mutable state object.
       * @param {string} from - Source character ID.
       * @param {string} to - Destination character ID.
       * @returns {Object} Edge data structure.
       */
      getEdge: function(state, from, to) {
        const fromEdges = state.relationshipGraph.edges[from];
        if (fromEdges && fromEdges[to]) {
          return deepClone(fromEdges[to]);
        }
        return getDefaultEdge();
      }
    };
  })();

  // --- CHARACTER MEMORY ---
  /**
   * Manages character memory structures and profiles.
   */
  const CharacterMemory = (function() {
    /**
     * Default profile layout for a character memory model.
     * @returns {Object}
     */
    function getDefaultProfile() {
      return {
        Identity: "",
        Beliefs: [],
        Goals: [],
        Intentions: "",
        CurrentEmotion: "neutral",
        PrivateKnowledge: [],
        SharedKnowledge: [],
        RecentEvents: [],
        LongTermMemory: [],
        RelationshipMemory: {},
        Habits: [],
        SpeechStyle: ""
      };
    }

    return {
      /**
       * Creates a new character profile in the states store.
       * @param {Object} state - Mutable state object.
       * @param {string} charId - Unique identifier.
       * @param {Object} profileParams - Initial properties.
       */
      createProfile: function(state, charId, profileParams) {
        if (!state.characterStates[charId]) {
          state.characterStates[charId] = getDefaultProfile();
        }
        const profile = state.characterStates[charId];
        for (let key in profileParams) {
          if (profile[key] !== undefined) {
            profile[key] = profileParams[key];
          }
        }
        DebugLogger.debug(`Created/Updated profile for character: ${charId}`);
      },

      /**
       * Appends an event to a character's RecentEvents.
       * @param {Object} state - Mutable state object.
       * @param {string} charId - Character ID.
       * @param {string} eventText - Memory details.
       */
      addRecentEvent: function(state, charId, eventText) {
        const profile = state.characterStates[charId];
        if (profile) {
          profile.RecentEvents.push({
            id: `ev_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            content: eventText,
            timestamp: new Date().toISOString()
          });
          // Cap recent events to preserve context size
          if (profile.RecentEvents.length > 10) {
            const expired = profile.RecentEvents.shift();
            profile.LongTermMemory.push(expired.content);
          }
        }
      },

      /**
       * Filters character memory parameters to form a prompt subset.
       * Director owns memory presentation layer filtering logic.
       * @param {Object} state - Read-only engine state snapshot.
       * @param {string} charId - The character ID.
       * @param {Array<string>} contextKeywords - Words to filter memories by.
       * @returns {Object} Selected memory subset.
       */
      filterMemoriesForPrompt: function(state, charId, contextKeywords) {
        const profile = state.characterStates[charId];
        if (!profile) return null;

        // Base memory filters
        const filteredRecent = profile.RecentEvents.filter(function(ev) {
          if (!contextKeywords || contextKeywords.length === 0) return true;
          return contextKeywords.some(kw => ev.content.toLowerCase().includes(kw.toLowerCase()));
        }).slice(-3); // Limit to top 3 matching recent events

        return {
          Identity: profile.Identity,
          SpeechStyle: profile.SpeechStyle,
          CurrentEmotion: profile.CurrentEmotion,
          Intentions: profile.Intentions,
          RecentEvents: filteredRecent.map(ev => ev.content),
          Goals: profile.Goals.slice(0, 2)
        };
      }
    };
  })();

  // --- WORLD STATE MANAGER ---
  /**
   * Coordinates the world state variables.
   */
  const WorldStateManager = (function() {
    return {
      /**
       * Updates the scene setting and ambient mood parameters.
       * @param {Object} state - Mutable state object.
       * @param {string} scene - Scene name.
       * @param {string} mood - Ambient mood.
       */
      setScene: function(state, scene, mood) {
        state.worldState.CurrentScene = scene;
        state.worldState.AmbientMood = mood;
        DebugLogger.debug(`Setting scene to: ${scene} with mood: ${mood}`);
      },

      /**
       * Advances the game clock timeline.
       * @param {Object} state - Mutable state object.
       * @param {number} hours - Hours elapsed.
       */
      advanceTime: function(state, hours) {
        const time = state.worldState.WorldTime;
        time.hour += hours;
        if (time.hour >= 24) {
          const days = Math.floor(time.hour / 24);
          time.daysElapsed += days;
          time.hour = time.hour % 24;
        }
        time.epoch += hours;
        // Determine timeOfDay string
        if (time.hour >= 6 && time.hour < 18) {
          time.timeOfDay = "day";
        } else {
          time.timeOfDay = "night";
        }
        DebugLogger.debug(`Advanced world time. Days: ${time.daysElapsed}, Hour: ${time.hour}`);
      },

      /**
       * Inserts a tracking item object into active setting props.
       * @param {Object} state - Mutable state object.
       * @param {string} id - Object ID.
       * @param {string} name - Item name.
       * @param {string} description - Details.
       * @param {string} location - Location name.
       * @param {string} owner - Owner character ID.
       */
      addObject: function(state, id, name, description, location, owner) {
        const props = state.worldState.Objects;
        const index = props.findIndex(p => p.id === id);
        const obj = { id, name, description, location, owner };
        if (index > -1) {
          props[index] = obj;
        } else {
          props.push(obj);
        }
        DebugLogger.debug(`Tracked object state: ${name}`);
      },

      /**
       * Updates global tracking flags.
       * @param {Object} state - Mutable state object.
       * @param {string} flag - Flag key.
       * @param {*} value - Flag value.
       */
      setFlag: function(state, flag, value) {
        state.worldState.GlobalFlags[flag] = value;
      }
    };
  })();

  // --- EVENT QUEUE MANAGER ---
  /**
   * Manages scheduling of future plot points, triggers and incidents.
   */
  const EventQueueManager = (function() {
    /**
     * Default event structure schema.
     * @returns {Object}
     */
    function getDefaultEvent() {
      return {
        priority: 1,
        scheduledTime: 0,
        participants: [],
        location: "",
        triggerCondition: "",
        payload: {},
        expiration: 0,
        status: "pending"
      };
    }

    return {
      /**
       * Registers a scheduled event in pending queue list.
       * @param {Object} state - Mutable state object.
       * @param {Object} eventParams - Event parameter details.
       */
      scheduleEvent: function(state, eventParams) {
        const ev = getDefaultEvent();
        for (let key in eventParams) {
          if (ev[key] !== undefined) {
            ev[key] = eventParams[key];
          }
        }
        state.pendingEvents.push(ev);
        DebugLogger.debug(`Scheduled narrative event: priority=${ev.priority}, location=${ev.location}`);
      }
    };
  })();

  // --- DIRECTOR MODULE ---
  /**
   * The Director evaluates state parameters and decides narrative progression paths.
   * Exposes dynamic memory-filtering.
   * Forbidden: Direct writes to worldState or other persistent keys.
   */
  const Director = (function() {
    return {
      /**
       * Evaluates current state parameters and determines the turn plan.
       * @param {Object} state - Read-only snapshot of engine state.
       * @returns {{speaker: string, action: string, context: string}} Proposed turn plan.
       */
      plan: function(state) {
        DebugLogger.info("Director planning turn progression...");
        
        let speaker = "Narrator";
        let action = "describe_setting";
        let context = "Introductory description of the setting.";

        // Basic selection progression skeleton using state objects
        if (state.lastSpeaker === "Narrator") {
          // If there are NPC participants present in the scene, pick one
          if (state.worldState.ActiveNPCs.length > 0) {
            speaker = state.worldState.ActiveNPCs[0];
            action = "speak";
            context = "Dialogue react to atmospheric settings.";
          } else {
            speaker = "Narrator";
            action = "describe_atmosphere";
            context = "Scenic transition atmospheric beats.";
          }
        }

        return {
          speaker: speaker,
          action: action,
          context: context
        };
      },

      /**
       * Logic execution step for planning log generation.
       * Discussion is PRIVATE: never modifies story directly, never generates visible messages, never mutates state
       * unless instructions start with CANON:.
       * @param {string} prompt - Prompt parameters.
       * @returns {Promise<string>} Textual strategy outline.
       */
      generateDiscussion: async function(prompt) {
        DebugLogger.info("Director planning strategies privately...");
        if (prompt.trim().startsWith("CANON:")) {
          await StoryController.executeCanonCommand(prompt);
          return "Authoritative CANON modifications applied successfully.";
        }
        
        // Private prompt generation (strictly read-only state/story)
        const state = StateManager.load();
        const instruction = `Director private thought space. Strategy for scene: ${state.worldState.CurrentScene}. Prompt: ${prompt}`;
        const strategy = await safeGenerateText({ instruction });
        DebugLogger.info("Director discussion strategy completed (private thought).");
        return strategy;
      }
    };
  })();

  // --- NARRATOR MODULE ---
  /**
   * Generates atmosphere, environment and sensory text.
   * Forbidden: Direct writes to relationshipGraph or other state properties.
   */
  const Narrator = (function() {
    return {
      /**
       * Generates environmental atmosphere narration text.
       * @param {Object} state - Read-only snapshot of engine state.
       * @returns {Promise<string>} Atmospheric description text.
       */
      describeAtmosphere: async function(state) {
        DebugLogger.info("Narrator describing atmospheric details...");
        const mood = state.worldState.AmbientMood || "neutral";
        const sceneName = state.worldState.CurrentScene || "unknown scene";
        return `The mood in the ${sceneName} settles, turning distinctly ${mood}.`;
      }
    };
  })();

  // --- STORY CONTROLLER ---
  /**
   * StoryController manages turn execution loops, checks locks, and coordinates modules.
   */
  const StoryController = (function() {
    /**
     * Triggers the next asynchronous step in the loop, yielding execution control to the browser.
     * Prevents stack recursion and busy-loops.
     */
    function queueNextAutoStep() {
      setTimeout(function() {
        StoryController.executeNextLoopStep();
      }, 1500);
    }

    return {
      /**
       * Orchestrates a single story progression turn step.
       * @param {string} triggerType - Mode trigger type (e.g. "continue", "auto").
       * @returns {Promise<void>} Resolves when turn processes.
       */
      executeTurn: async function(triggerType) {
        const state = StateManager.load();

        if (state.autoState.isProcessing) {
          DebugLogger.warn("Loop execution blocked: active turn processing lock is engaged.");
          return;
        }

        // Engage turn lock and save mode via state manager mutation
        StateManager.mutate(function(s) {
          s.autoState.isProcessing = true;
          if (triggerType !== "auto") {
            s.autoState.mode = triggerType;
          }
        });

        let success = false;
        try {
          const freshState = StateManager.load();
          // Consult Director for plot path decision
          const plan = Director.plan(freshState);
          DebugLogger.info(`Director selected speaker: ${plan.speaker} for action: ${plan.action}`);

          // Delegate text generation to selected speaker
          let turnContent = "";
          if (plan.speaker === "Narrator") {
            turnContent = await Narrator.describeAtmosphere(freshState);
          } else {
            // Simulated dialogue using prompt builder filtered subset memory
            const filteredMemory = CharacterMemory.filterMemoriesForPrompt(freshState, plan.speaker, ["scenic", "setting"]);
            const emotion = filteredMemory ? filteredMemory.CurrentEmotion : "calm";
            turnContent = `[${plan.speaker} speaks with ${emotion} expression: "This place has an unusual feel to it."]`;
          }

          // Append output to the thread
          if (typeof oc !== "undefined" && oc.thread && oc.thread.messages) {
            oc.thread.messages.push({
              author: plan.speaker === "Narrator" ? "system" : "ai",
              name: plan.speaker,
              content: turnContent,
              expectsReply: false
            });
          } else {
            DebugLogger.info(`[MOCK THREAD PUSH] ${plan.speaker}: ${turnContent}`);
          }

          // Record history changes through StateManager mutation
          StateManager.mutate(function(s) {
            s.lastSpeaker = plan.speaker;
            if (plan.speaker !== "Narrator") {
              CharacterMemory.addRecentEvent(s, plan.speaker, `Spoke in ${s.worldState.CurrentScene}`);
            }
          });

          success = true;
        } catch (err) {
          DebugLogger.error(`Error running story progression turn: ${err.message}`);
          this.pause();
        } finally {
          // Release turn lock and trigger next step if loop is active
          StateManager.mutate(function(s) {
            s.autoState.isProcessing = false;
            if (success && s.autoState.isRunning) {
              if (s.autoState.turnsRemaining > 0) {
                s.autoState.turnsRemaining--;
                DebugLogger.info(`Auto turns remaining: ${s.autoState.turnsRemaining}`);
              }
            }
          });

          if (success) {
            const finalState = StateManager.load();
            if (finalState.autoState.isRunning) {
              if (finalState.autoState.turnsRemaining === 0) {
                DebugLogger.info("Auto turns completed. Halting loop.");
                this.pause();
              } else {
                queueNextAutoStep();
              }
            }
          }
        }
      },

      /**
       * Starts the automation loop sequence.
       * @param {number} turns - Number of turns to run (-1 for infinite).
       */
      startAuto: function(turns) {
        const state = StateManager.load();
        if (state.autoState.isRunning) {
          DebugLogger.warn("Automation is already active.");
          return;
        }

        DebugLogger.info(`Starting automation loop. Turns: ${turns}`);
        StateManager.mutate(function(s) {
          s.autoState.isRunning = true;
          s.autoState.turnsRemaining = turns;
          s.autoState.mode = turns === 5 ? "auto5" : "autoloop";
        });

        this.executeTurn("auto");
      },

      /**
       * Pauses the loop execution and resets state modes.
       */
      pause: function() {
        DebugLogger.info("Halting automation loop.");
        StateManager.mutate(function(s) {
          s.autoState.isRunning = false;
          s.autoState.turnsRemaining = 0;
          s.autoState.mode = "idle";
        });
      },

      /**
       * Evaluates and executes the next step in the loop, if active.
       */
      executeNextLoopStep: function() {
        const state = StateManager.load();
        if (!state.autoState.isRunning) {
          DebugLogger.debug("Loop step skipped: isRunning is false.");
          return;
        }
        if (state.autoState.turnsRemaining === 0) {
          this.pause();
          return;
        }
        this.executeTurn("auto");
      },

      /**
       * Intercepts a canonical user message (Speak Mode).
       * Evaluates intent to update Identity, Beliefs, Intentions, Habits, and Relationships.
       * Changes are gradual.
       * @param {Object} message - Pushed user message.
       */
      handleUserSpeak: async function(message) {
        DebugLogger.info("User Speak Turn: running profile and social update check...");
        
        // Initialise user profile if missing
        StateManager.mutate(function(s) {
          if (!s.characterStates["user"]) {
            CharacterMemory.createProfile(s, "user", {
              Identity: "A visitor",
              SpeechStyle: "Normal"
            });
          }
        });

        try {
          const state = StateManager.load();
          // Build prompt for Director's social evaluation
          const prompt = `Evaluate how this user message updates their Profile and relationships. User: "${message.content}". Current state: ${JSON.stringify(state.characterStates.user)}`;
          
          const resultStr = await safeGenerateText({ instruction: prompt });
          let updates = null;
          try {
            updates = JSON.parse(resultStr);
          } catch (e) {
            DebugLogger.warn("User speak evaluation returned unstructured text. Parsing attributes gradually.");
          }

          // Apply updates to user profile and relationship edges gradually
          StateManager.mutate(function(s) {
            const userProfile = s.characterStates.user;
            if (updates && updates.characterStates && updates.characterStates.user) {
              const u = updates.characterStates.user;
              if (u.Identity) userProfile.Identity = u.Identity;
              if (u.SpeechStyle) userProfile.SpeechStyle = u.SpeechStyle;
              if (u.Intentions) userProfile.Intentions = u.Intentions;
              if (u.CurrentEmotion) userProfile.CurrentEmotion = u.CurrentEmotion;
              if (u.Beliefs) userProfile.Beliefs = userProfile.Beliefs.concat(u.Beliefs).slice(-5);
              if (u.Habits) userProfile.Habits = userProfile.Habits.concat(u.Habits).slice(-5);
            }
            
            // Gradual relationship adjustments
            if (updates && updates.relationships && Array.isArray(updates.relationships)) {
              updates.relationships.forEach(function(rel) {
                const current = RelationshipGraph.getEdge(s, rel.from, rel.to);
                const affectionDelta = (rel.affection - current.affection) * 0.2; // 20% gradual shift
                const trustDelta = (rel.trust - current.trust) * 0.2;
                
                RelationshipGraph.setEdge(s, rel.from, rel.to, {
                  affection: Math.round(current.affection + affectionDelta),
                  trust: Math.round(current.trust + trustDelta)
                });
              });
            }

            // Log recent event in history
            CharacterMemory.addRecentEvent(s, "user", `User said: "${message.content}"`);
          });

          DebugLogger.info("User Speak profile mutation complete.");
        } catch (err) {
          DebugLogger.error(`Failed to execute Speak social updates: ${err.message}`);
        }
      },

      /**
       * Executes immediate authoritative changes from CANON: prefix instructions.
       * Mutates characterStates, relationships, worldState, pendingEvents, or storyArc.
       * @param {string} command - Authoritative instruction string.
       */
      executeCanonCommand: async function(command) {
        DebugLogger.info(`CANON Action: executing authoritative update: ${command}`);

        // Direct parse checks for fast changes (Regex backup)
        if (command.toLowerCase().includes("set scene to")) {
          const match = command.match(/set scene to\s+([^.]+)/i);
          if (match) {
            const newScene = match[1].trim();
            StateManager.mutate(function(s) {
              WorldStateManager.setScene(s, newScene, s.worldState.AmbientMood);
            });
            DebugLogger.info(`Authoritative direct parse setting scene to: ${newScene}`);
            return;
          }
        }

        // LLM interpreter fallback for flexible instructions
        try {
          const prompt = `Evaluate this CANON command: '${command}'. Generate a JSON mutation command for the Living Novel Engine state. Available state keys: worldState, relationshipGraph, characterStates, pendingEvents, storyArc. Output only valid JSON matching the changes.`;
          const mutationStr = await safeGenerateText({ instruction: prompt });
          
          let mutations = null;
          try {
            mutations = JSON.parse(mutationStr);
          } catch (e) {
            DebugLogger.error("Failed to parse CANON LLM mutation JSON.");
          }

          if (mutations) {
            StateManager.mutate(function(s) {
              // Apply worldState edits
              if (mutations.worldState) {
                for (let k in mutations.worldState) {
                  s.worldState[k] = mutations.worldState[k];
                }
              }
              // Apply relationshipGraph updates
              if (mutations.relationshipGraph && mutations.relationshipGraph.edges) {
                const edges = mutations.relationshipGraph.edges;
                for (let from in edges) {
                  for (let to in edges[from]) {
                    RelationshipGraph.setEdge(s, from, to, edges[from][to]);
                  }
                }
              }
              // Apply characterState updates
              if (mutations.characterStates) {
                for (let char in mutations.characterStates) {
                  if (s.characterStates[char]) {
                    Object.assign(s.characterStates[char], mutations.characterStates[char]);
                  } else {
                    CharacterMemory.createProfile(s, char, mutations.characterStates[char]);
                  }
                }
              }
            });
            DebugLogger.info("Authoritative CANON mutation applied successfully.");
          }
        } catch (err) {
          DebugLogger.error(`CANON execution failure: ${err.message}`);
        }
      }
    };
  })();

  // --- COMMAND PARSER ---
  /**
   * Parses user input slash commands and CANON actions.
   */
  const CommandParser = (function() {
    return {
      /**
       * Intercepts and parses commands.
       * @param {string} content - Message body.
       * @returns {boolean} True if a command was handled.
       */
      handleCommand: function(content) {
        const text = content.trim().toLowerCase();
        
        // Slash commands
        if (text === "/continue") {
          DebugLogger.info("Parsed /continue command.");
          StoryController.executeTurn("continue");
          return true;
        }
        if (text === "/auto5") {
          DebugLogger.info("Parsed /auto5 command.");
          StoryController.startAuto(5);
          return true;
        }
        if (text === "/autoloop") {
          DebugLogger.info("Parsed /autoloop command.");
          StoryController.startAuto(-1);
          return true;
        }
        if (text === "/pause") {
          DebugLogger.info("Parsed /pause command.");
          StoryController.pause();
          return true;
        }
        
        // CANON: prefix
        if (content.trim().startsWith("CANON:")) {
          DebugLogger.info("Parsed CANON prefix instruction.");
          StoryController.executeCanonCommand(content);
          return true;
        }
        
        // Director private thought command
        if (text.startsWith("/director ")) {
          DebugLogger.info("Parsed /director planning command.");
          Director.generateDiscussion(content.slice(10));
          return true;
        }

        return false;
      }
    };
  })();

  // --- BOOTSTRAP ---
  /**
   * Initializes the engine, checks environment, and registers listeners.
   */
  function bootstrap() {
    DebugLogger.info(`Bootstrapping ${EngineMeta.NAME} v${EngineMeta.VERSION}...`);

    // Initialise the state
    StateManager.init();

    // Self-healing locks on startup
    StateManager.mutate(function(s) {
      s.autoState.isProcessing = false;
    });

    // Hook events
    // [UNVERIFIED] - oc.thread.on might behave synchronously or asynchronously.
    if (typeof oc !== "undefined" && oc.thread && typeof oc.thread.on === "function") {
      oc.thread.on("MessageAdded", function({ message }) {
        DebugLogger.info(`Message added by: ${message.author}. Processing...`);
        
        // Intercept user inputs to parse commands or process Speak mode
        if (message.author === "user") {
          const commandHandled = CommandParser.handleCommand(message.content);
          if (commandHandled) {
            // [UNVERIFIED] - expectsReply is tested to prevent default reply triggers
            message.expectsReply = false;
          } else {
            // Treat standard user text as canon Speak turn
            StoryController.handleUserSpeak(message);
          }
        }
      });
      DebugLogger.info("Hooked into Perchance MessageAdded event successfully.");
    } else {
      DebugLogger.warn("Perchance environment not detected. Running in headless mode.");
    }

    // Check if auto loop was running prior to reload/refresh
    const state = StateManager.load();
    if (state.autoState.isRunning) {
      DebugLogger.info("Auto loop was running prior to reload. Resuming automation...");
      setTimeout(function() {
        StoryController.executeNextLoopStep();
      }, 2000);
    }

    DebugLogger.info("Bootstrap complete.");
  }

  // Execute bootstrap if in browser/iframe, or export for testing
  if (typeof oc !== "undefined") {
    bootstrap();
  }

  // Expose engine modules globally for troubleshooting and verification
  const EngineInterface = {
    Meta: EngineMeta,
    Status: EngineStatus,
    Logger: DebugLogger,
    StateManager: StateManager,
    RelationshipGraph: RelationshipGraph,
    CharacterMemory: CharacterMemory,
    WorldStateManager: WorldStateManager,
    EventQueueManager: EventQueueManager,
    Director: Director,
    Narrator: Narrator,
    StoryController: StoryController,
    CommandParser: CommandParser,
    bootstrap: bootstrap
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = EngineInterface;
  } else if (typeof globalThis !== "undefined") {
    globalThis.LivingNovelEngine = EngineInterface;
  }
})();
