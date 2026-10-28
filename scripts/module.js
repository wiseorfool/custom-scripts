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
    scope: "client",
    config: true,
    type: Number,
    default: 18,
    onChange: () => canvas.tokens?.placeables.forEach(t => t.drawBars())
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
    onChange: () => canvas.tokens?.placeables.forEach(t => t.drawBars())
  });

  // Add a toggle setting to show "Current HP" vs "Current / Max HP".
  game.settings.register(MODULE_ID, "showMax", {
    name: "Show Max Value",
    hint: "Display 10/20 instead of just 10.",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
    onChange: () => canvas.tokens?.placeables.forEach(t => t.drawBars())
  });

  // Turn on our custom drawing instructions
  patchTokenDrawBars();
});

/**
 * Replaces core Token.prototype.drawBars to inject custom numeric sprites.
 */
function patchTokenDrawBars() {
  const originalDrawBars = Token.prototype.drawBars;

  Token.prototype.drawBars = function() {
    originalDrawBars.call(this);

    if (!this.actor || !this.hasActiveHUD) {
      if (this.document.displayBars === CONST.TOKEN_DISPLAY_MODES.NONE) return;
    }

    renderBarNumber(this, "bar1", 0);
    renderBarNumber(this, "bar2", 1);
  };
}

/**
 * Core drawing function that adds crisp text to token resource bars.
 *
 * @param {Token} token - The token object we're drawing on.
 * @param {string} barName - The name of the bar attribute (e.g., "bar1").
 * @param {number} barIndex - The index of the bar (0 for bottom, 1 for top).
 */
function renderBarNumber(token, barName, barIndex) {
  const resource = token.document.getBarAttribute?.(barName);

  if (!resource || resource.type !== "bar") {
    cleanUpBarText(token, barName);
    return;
  }

  // --- Text Content ---
  const { value, max } = resource;
  const showMax = game.settings.get(MODULE_ID, "showMax");
  const displayText = showMax && max !== undefined ? `${value} / ${max}` : `${value}`;

  const textObjectName = `_numericText_${barName}`;
  const barContainer = token.bars;
  if (!barContainer) return;

  let textSprite = barContainer.getChildByName(textObjectName);
  const fontSize = game.settings.get(MODULE_ID, "fontSize") || 12;
  const fontFamily = game.settings.get(MODULE_ID, "fontFamily") || "Signika";

  if (!textSprite) {
    const style = new PIXI.TextStyle({
      fontFamily: fontFamily,
      fontSize: fontSize,
      fontWeight: "bold",
      fill: "#ffffff",
      stroke: "#000000",
      strokeThickness: 2,
      align: "center",
      dropShadow: true,
      dropShadowColor: "#000000",
      dropShadowBlur: 2,
      dropShadowDistance: 1
    });

    textSprite = new PIXI.Text(displayText, style);
    textSprite.name = textObjectName;
    textSprite.anchor.set(0.5, 0.5);

    // FIX 1: Increase off-screen rasterization resolution to prevent pixelation
    textSprite.resolution = Math.max(window.devicePixelRatio || 1, 2);

    // FIX 2: Lock raster rendering to whole pixels to prevent blur at sub-pixel offsets
    textSprite.roundPixels = true;

    barContainer.addChild(textSprite);
  } else {
    // Keep cached sprite synced with updated values and settings
    textSprite.text = displayText;
    textSprite.style.fontSize = fontSize;
    textSprite.style.fontFamily = fontFamily;
  }

  // --- Positioning ---
  const barHeight = Math.max(canvas.dimensions.size / 12, 8);
  const tokenWidth = token.w;
  const tokenHeight = token.h;

  // FIX 3: Snap positions to integers so odd dimensions don't sit on half-pixels
  textSprite.x = Math.round(tokenWidth / 2);

  if (barIndex === 0) {
    textSprite.y = Math.round(tokenHeight - (barHeight / 2));
  } else {
    textSprite.y = Math.round(barHeight / 2);
  }
}

/**
 * Removes and destroys leftover text objects when a bar is removed.
 *
 * @param {Token} token - The token to clean up.
 * @param {string} barName - The name of the bar to clean up.
 */
function cleanUpBarText(token, barName) {
  const textObjectName = `_numericText_${barName}`;
  const existing = token.bars?.getChildByName(textObjectName);

  if (existing) {
    token.bars.removeChild(existing);
    existing.destroy();
  }
}

Hooks.on("refreshRegion", (region) => {
  const isRegionsLayerActive = canvas.activeLayer?.options.name === "regions";
  
  if (!isRegionsLayerActive) {
    if (region.visible && region.mesh && region.border) {
      region.mesh.alpha = 0.15;

      const fillColor = region.document.color || 0xFFFFFF;
      
      region.border.clear();
      region.border.lineStyle({
        width: 4,
        color: fillColor,
        alpha: 0.50,
        alignment: 0.5
      });

      for (const shape of region.shapes) {
        region.border.drawShape(shape);
      }
    }
  }
});
