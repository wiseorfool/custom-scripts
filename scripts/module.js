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
  // Apply exhaustion rules
  applyExhaustionSetting();
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

  // Add a setting to change the font family of the HP text.
  game.settings.register(MODULE_ID, "fontFamily", {
    name: "Font Family",
    hint: "The font used for the numbers over the bar.",
    scope: "world",
    config: true,
    type: String,
    choices: Object.keys(CONFIG.fontDefinitions || {}).reduce((acc, f) => ({ ...acc, [f]: f }), {}),
    default: "Signika",
    onChange: () => canvas.tokens?.draw()
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
  const fontFamiy = game.settings.get(MODULE_ID, "fontFamily") || "Signika";

  if (!textSprite) {
    // If it doesn't exist, create it.
    // A PIXI.TextStyle object defines the font, color, size, etc.
    // A thick stroke and drop shadow make the text readable over any color bar.
    const style = new PIXI.TextStyle({
      fontFamily: fontFamiy,
      fontSize: fontSize,
      fontWeight: "bold",
      fill: "#ffffff",         // White text
      stroke: "#000000",       // Black outline
      strokeThickness: 3,      // Outline thickness
      align: "center",
      dropShadow: true,
      dropShadowColor: "#000000",
      dropShadowBlur: 2,
      dropShadowDistance: 1
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


Hooks.on("refreshRegion", (region) => {
  // 1. Check if the user is currently NOT on the regions layer
  const isRegionsLayerActive = canvas.activeLayer?.options.name === "regions";
  
  if (!isRegionsLayerActive) {
    // 2. Identify if the current user can see this region under vanilla rules
    // (Respects "Always for GM" or "Always for Everyone" settings off-layer)
    if (region.visible && region.mesh && region.border) {
      
      // 3. Set the region fill alpha to exactly 15%
      region.mesh.alpha = 0.15;

      // 4. Redraw the border to be a 4px stroke matching the fill color at 50% alpha
      const fillColor = region.document.color || 0xFFFFFF; // Fallback to white if undefined
      
      region.border.clear();
      region.border.lineStyle({
        width: 4,
        color: fillColor,
        alpha: 0.50,
        alignment: 0.5 // Centers the 4px stroke perfectly on the region edge boundary
      });

      // 5. Re-execute the shape drawing logic onto the modified border style
      for ( const shape of region.shapes ) {
        region.border.drawShape(shape);
      }
    }
  }
});
