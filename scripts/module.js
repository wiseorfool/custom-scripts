// ========================================================================== //
//
//  STEP 1: MODULE IDENTIFICATION
//
//  Every module needs a unique ID to prevent its settings and data from
//  colliding with other modules. We'll define it here as a constant so we
//  can reuse it easily throughout our code.
//
// ========================================================================== //

const MODULE_ID = "custom-scripts";

/**
 * This function reads our module's setting for exhaustion and tells the D&D 5e
 * system how to handle it during a long rest.
 *
 * It's good practice to keep logic separate from the initial setup hooks.
 */
const applyExhaustionSetting = () => {
  // `game.settings.get()` is how we retrieve a saved setting's value.
  // We pass it our module's ID and the setting's unique key.
  const disableRecovery = game.settings.get(MODULE_ID, "disableExhaustionRecovery");

  // Based on the setting, we determine the correct value to pass to the 5e system.
  const exhaustionValue = disableRecovery ? 0 : 1;
  const exhaustionDeltaValue = disableRecovery ? 0 : -1;

  // The D&D 5e system changed how it handles rest in version 3.0.0.
  // We need to check the system version to apply our change correctly.
  // D&D5e v3.x+ (Foundry 11–14)
  if (foundry.utils.isNewerVersion("3.0.0", game.system.version)) {
    CONFIG.DND5E.restRules.longRest.exhaustion = exhaustionValue;
  } else {
    // Legacy fallback
    CONFIG.DND5E.restTypes.long.exhaustionDelta = exhaustionDeltaValue;
  }
};

// ========================================================================== //
//
//  STEP 2: INITIALIZATION HOOK (init)
//
//  The "init" hook is the first hook that fires for a module. It's the
//  perfect place to register settings, because they need to be available
//  very early in Foundry's startup sequence.
//
// ========================================================================== //

Hooks.once("init", () => {
  // `game.settings.register` creates a new setting in the module settings menu.
  // Let's break down the parameters for the first one:
  // name: The human-readable text that appears in the settings menu.
  // hint: The helper text that appears below the name.
  // scope: "world" means the setting is saved for the entire world and can only be changed by a GM.
  // config: `true` means this setting will appear in the module settings menu.
  // type: The data type for the setting, like Boolean (a checkbox), String (text), or Number.
  // default: The value the setting will have until a GM changes it.
  // requiresReload: `true` prompts the user to reload the game for the change to take effect.
  // Exhaustion setting
  game.settings.register(MODULE_ID, "disableExhaustionRecovery", {
    name: "Disable Exhaustion Recovery on Long Rest",
    hint: "Characters will not recover exhaustion on long rest. Reload required.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    requiresReload: true,
  });

  // Critical Condition settings
  game.settings.register(MODULE_ID, "criticalConditionName", {
    name: "Critical Condition Name",
    scope: "world",
    config: true,
    type: String,
    default: "Critical",
  });

  game.settings.register(MODULE_ID, "criticalConditionIcon", {
    name: "Critical Condition Icon",
    scope: "world",
    config: true,
    type: String,
    default: "icons/svg/skull.svg",
    // `filePicker: "image"` tells Foundry to show a file browser button for this setting.
    filePicker: "image"
  });

  // Bloodied Condition icon settings (per actor type)
  game.settings.register(MODULE_ID, "bloodiedConditionIconPC", {
    name: "Bloodied Icon (PC)",
    scope: "world",
    config: true,
    type: String,
    default: "icons/svg/blood.svg",
    filePicker: "image"
  });

  game.settings.register(MODULE_ID, "bloodiedConditionIconNPC", {
    name: "Bloodied Icon (NPC)",
    scope: "world",
    config: true,
    type: String,
    default: "icons/svg/blood.svg",
    filePicker: "image"
  });

  // Bloodied override + thresholds
  game.settings.register(MODULE_ID, "enableBloodiedOverride", {
    name: "Enable Bloodied Icon Override",
    hint: "If checked, the module will change the Bloodied icon instead of adding its own effect.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
  });

  game.settings.register(MODULE_ID, "bloodiedThreshold", {
    name: "Bloodied Threshold (%)",
    hint: "Above this HP%, Bloodied will be removed (if override removal is enabled).",
    scope: "world",
    config: true,
    type: Number,
    default: 50,
  });

  // Critical threshold + auto-removal
  game.settings.register(MODULE_ID, "criticalThreshold", {
    name: "Critical Threshold (%)",
    hint: "At or below this HP%, Critical is applied and Bloodied is removed.",
    scope: "world",
    config: true,
    type: Number,
    default: 25,
  });

  game.settings.register(MODULE_ID, "autoRemoveCriticalAboveThreshold", {
    name: "Auto-Remove Critical Above Threshold",
    hint: "Remove Critical when HP rises above the Critical threshold.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
  });

  game.settings.register(MODULE_ID, "autoRemoveBloodiedAboveThreshold", {
    name: "Auto-Remove Bloodied Above Threshold",
    hint: "Remove Bloodied when HP rises above the Bloodied threshold.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
  });

  // Apply exhaustion rules
  applyExhaustionSetting();
});

// ========================================================================== //
//
//  STEP 3: REACTING TO GAME EVENTS (updateActor hook)
//
//  This section automates adding and removing conditions based on a
//  character's hit points. We use the "updateActor" hook, which fires
//  every time an actor's data changes.
//
// ========================================================================== //

Hooks.on("updateActor", async (actor, update) => {
  // This hook fires for *any* update. We only care about HP changes.
  // This check prevents the code from running unnecessarily.
  // The `?` is optional chaining: it stops if `update.system` or `update.system.attributes` is not present.
  if (!update.system?.attributes?.hp) return;

  // Get the actor's current and max HP.
  const hp = actor.system.attributes.hp.value;
  const maxHp = actor.system.attributes.hp.max;
  // Calculate the HP percentage. We check for maxHp > 0 to prevent division by zero errors.
  const hpPct = maxHp > 0 ? (hp / maxHp) * 100 : 0;

  // --- Gather all our settings ---
  // It's good practice to get all settings at the start of the function.
  const criticalName = game.settings.get(MODULE_ID, "criticalConditionName");
  const criticalIcon = game.settings.get(MODULE_ID, "criticalConditionIcon");

  const bloodiedIconPC = game.settings.get(MODULE_ID, "bloodiedConditionIconPC");
  const bloodiedIconNPC = game.settings.get(MODULE_ID, "bloodiedConditionIconNPC");

  const enableBloodiedOverride = game.settings.get(MODULE_ID, "enableBloodiedOverride");
  const bloodiedThreshold = game.settings.get(MODULE_ID, "bloodiedThreshold");
  const criticalThreshold = game.settings.get(MODULE_ID, "criticalThreshold");
  const autoRemoveCriticalAbove = game.settings.get(MODULE_ID, "autoRemoveCriticalAboveThreshold");
  const autoRemoveBloodiedAbove = game.settings.get(MODULE_ID, "autoRemoveBloodiedAboveThreshold");

  // --- Find existing effects on the actor ---
  // The D&D 5e system has a built-in "Bloodied" status. We can find it by its label.
  const bloodiedEffect = actor.effects.find(e => e.label === "Bloodied");

  // For our custom "Critical" condition, we need a reliable way to find it.
  // We add a special "flag" to the effect when we create it. This is the best
  // way to attach module-specific data to any document in Foundry.
  const criticalEffect = actor.effects.find(e => e.flags[MODULE_ID]?.condition === "critical");

  // --- Main Logic ---

  // If the actor is dead or dying, remove our conditions.
  if (hp <= 0) {
    // We must check if the effects exist before trying to delete them.
    if (criticalEffect) await actor.deleteEmbeddedDocuments("ActiveEffect", [criticalEffect.id]);
    if (bloodiedEffect) await actor.deleteEmbeddedDocuments("ActiveEffect", [bloodiedEffect.id]);
    return;
  }

  // If HP is at or below the "critical" threshold...
  if (hpPct <= criticalThreshold) {
    // Remove Bloodied when Critical applies
    if (bloodiedEffect) await actor.deleteEmbeddedDocuments("ActiveEffect", [bloodiedEffect.id]);

    if (!criticalEffect) {
      await actor.createEmbeddedDocuments("ActiveEffect", [{
        label: criticalName,
        icon: criticalIcon,
        // Here we add our custom flag so we can find this effect later.
        flags: { [MODULE_ID]: { condition: "critical" } }
      }]);
    }
  } else if (autoRemoveCriticalAbove && criticalEffect) {
    // Otherwise, if HP is above the threshold and the setting is on, remove Critical.
    await actor.deleteEmbeddedDocuments("ActiveEffect", [criticalEffect.id]);
  }

  // If the Bloodied effect exists (the 5e system adds it automatically) and our override is on...
  if (enableBloodiedOverride && bloodiedEffect && hpPct > criticalThreshold) {
    const isNPC = actor.type === "npc";
    const desiredIcon = isNPC ? bloodiedIconNPC : bloodiedIconPC;

    if (bloodiedEffect.icon !== desiredIcon) {
      await bloodiedEffect.update({ icon: desiredIcon });
    }
  }

  // If the auto-remove setting is on and HP is above the bloodied threshold, remove it.
  // This overrides the default 5e system behavior if the user wants it.
  if (autoRemoveBloodiedAbove && bloodiedEffect && hpPct > bloodiedThreshold) {
    await actor.deleteEmbeddedDocuments("ActiveEffect", [bloodiedEffect.id]);
  }
});

// ========================================================================== //
//
//  STEP 4: MODIFYING THE UI (getSceneControlButtons hook)
//
//  The "ready" hook fires once all core data is loaded and the canvas is
//  ready. It's a good place for tasks that need the game to be fully set up.
//  Here, we use it to inject another hook that modifies the UI.
//
// ========================================================================== //

Hooks.on("getSceneControlButtons", (controls) => {
  controls.tokens.tools.myTool = {
    name: "myTool",
    title: "Open Compendium Browser",
    icon: "fa-solid fa-atlas",
    order: Object.keys(controls.tokens.tools).length,
    button: true,
    // visible: game.user.isGM,
    onChange: () => {
      // Store the browser instance in a global variable
if (!window.compendiumBrowserInstance) {
  window.compendiumBrowserInstance = new dnd5e.applications.CompendiumBrowser();
}

// Toggle open/close for the Compendium Browser
if (window.compendiumBrowserInstance.rendered) {
  window.compendiumBrowserInstance.close(); // Close if already open
} else {
  window.compendiumBrowserInstance.render(true); // Open if not already open
}
    }
  };
});

Hooks.on("getSceneControlButtons", (controls) => {
  controls.push({
    name: "my-custom-category",
    title: "My Custom Toolbar",
    icon: "fa-solid fa-wand-magic-sparkles",
    layer: "controls", // The canvas layer this button activates
    visible: game.user.isGM,
    tools: [
      {
        name: "my-first-tool",
        title: "Activate Tool Effect",
        icon: "fa-solid fa-bolt",
        onClick: () => {
          ui.notifications.info("Custom top-level tool activated!");
        },
        button: true // Makes it an instant-click action instead of a persistent toggle
      }
    ]
  });
});


// ========================================================================== //
//
//  FEATURE: NUMERIC RESOURCE BARS
//
//  This feature draws numeric text (e.g., "15/30") over the resource bars
//  on tokens. It uses a technique called "monkey patching" to override
//  Foundry's default drawing behavior.
//
// ========================================================================== //

// We use the "init" hook again to set up the logic for this feature.
// Foundry allows multiple functions to be attached to the same hook.
Hooks.once("init", () => {
  // Add a setting in the Foundry menu so users can change the text size.
  game.settings.register(MODULE_ID, "fontSize", {
    name: "Font Size",
    hint: "How big the numbers appear over the bar.",
    scope: "client", // Saves per user (your screen only)
    config: true,    // Shows up in the Settings window
    type: Number,
    default: 12,
    onChange: () => canvas.tokens?.draw() // Refresh map when changed
  });

  // Add a toggle setting to show "Current HP" vs "Current / Max HP".
  game.settings.register(MODULE_ID, "showMax", {
    name: "Show Max Value",
    hint: "Display 10/20 instead of just 10.",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
    onChange: () => canvas.tokens?.draw()
  });

  // Turn on our custom drawing instructions
  patchTokenDrawBars();
});

/**
 * This function performs the "monkey patch". It replaces a core Foundry
 * function with our own custom version.
 *
 * WARNING: Monkey patching can be fragile. If Foundry changes the original
 * function in an update, our patch might break. It's powerful but should be
 * used carefully.
 */
function patchTokenDrawBars() {
  // libWrapper is a safer way to patch, but for a simple example, this works.
  // 1. Store a reference to the original function.
  const originalDrawBars = Token.prototype.drawBars;

  // 2. Overwrite the function on the Token's prototype.
  // `function() {}` is used to preserve the `this` context, which refers to the specific token instance.
  Token.prototype.drawBars = function() {
    // 3. Call the original function first. This draws the colored bars.
    // We use `.call(this)` to ensure it runs with the correct token context.
    originalDrawBars.call(this);

    // 4. If this token has its bars turned off, do nothing.
    if (!this.actor || !this.hasActiveHUD) {
      if (this.document.displayBars === CONST.TOKEN_DISPLAY_MODES.NONE) return;
    }

    // 3. Draw numbers on Bar 1 (usually HP) and Bar 2 (secondary resource)
    renderBarNumber(this, "bar1", 0);
    renderBarNumber(this, "bar2", 1);
  };
}

/**
 * This is the core drawing function that adds the text to a token.
 * It gets called for each of the two resource bars.
 *
 * @param {Token} token - The token object we're drawing on.
 * @param {string} barName - The name of the bar attribute (e.g., "bar1").
 * @param {number} barIndex - The index of the bar (0 for bottom, 1 for top).
 */
function renderBarNumber(token, barName, barIndex) {
  // Ask the token for the data associated with this bar (current value, max value).
  const resource = token.document.getBarAttribute?.(barName);

  // If the bar isn't configured for this token, clean up any old text and stop.
  if (!resource || resource.type !== "bar") {
    cleanUpBarText(token, barName);
    return;
  }

  // --- Text Creation and Styling ---
  // Build our text string (e.g., "15 / 30" or just "15")
  const { value, max } = resource;
  const showMax = game.settings.get(MODULE_ID, "showMax");
  const displayText = showMax && max !== undefined ? `${value} / ${max}` : `${value}`;

  // Name our text object so we can find it again on the next frame
  const textObjectName = `_numericText_${barName}`;
  const barContainer = token.bars;
  if (!barContainer) return;

  // PIXI.js is the rendering engine Foundry uses. We check if a PIXI.Text
  // object for this bar already exists.
  let textSprite = barContainer.getChildByName(textObjectName);
  const fontSize = game.settings.get(MODULE_ID, "fontSize") || 12;

  if (!textSprite) {
    // If it doesn't exist, create it.
    // A PIXI.TextStyle object defines the font, color, size, etc.
    // A thick stroke and drop shadow make the text readable over any color bar.
    const style = new PIXI.TextStyle({
      fontFamily: "Signika, sans-serif",
      fontSize: fontSize,
      fontWeight: "bold",
      fill: "#ffffff",         // White text
      stroke: "#000000",       // Black outline
      strokeThickness: 3,      // Outline thickness
      align: "center",
      dropShadow: true,
      dropShadowColor: "#000000",
      dropShadowBlur: 2,
      dropShadowDistance: 0
    });

    // Create the actual PIXI.Text object.
    textSprite = new PIXI.Text(displayText, style);
    textSprite.name = textObjectName;

    // The "anchor" is the text's origin point. (0.5, 0.5) means the exact center.
    // This makes positioning much easier.
    textSprite.anchor.set(0.5, 0.5);

    // Add the new text object to the token's `bars` container so it gets rendered.
    barContainer.addChild(textSprite);
  } else {
    // If it already exists, just update its text content and style.
    // This is much more efficient than destroying and recreating it every frame.
    textSprite.text = displayText;
    textSprite.style.fontSize = fontSize;
  }

  // --- Positioning ---
  // Figure out where to place the text on the token square
  const barHeight = Math.max(canvas.dimensions.size / 12, 8);
  const tokenWidth = token.w;
  const tokenHeight = token.h;

  // Center horizontally
  textSprite.x = tokenWidth / 2;

  // Position vertically. Bar 0 (bar1) is at the bottom, Bar 1 (bar2) is at the top.
  if (barIndex === 0) {
    textSprite.y = tokenHeight - (barHeight / 2);
  } else {
    textSprite.y = barHeight / 2;
  }
}

/**
 * If a bar is no longer visible (e.g., the resource is removed from the
 * character sheet), we need to remove the PIXI.Text object from the screen
 * to prevent visual glitches or "zombie" text.
 *
 * @param {Token} token - The token to clean up.
 * @param {string} barName - The name of the bar to clean up.
 */
function cleanUpBarText(token, barName) {
  const textObjectName = `_numericText_${barName}`;
  const existing = token.bars?.getChildByName(textObjectName);

  // If we find an old text object...
  if (existing) {
    // ...remove it from the container and destroy it to free up memory.
    token.bars.removeChild(existing);
    existing.destroy();
  }
}