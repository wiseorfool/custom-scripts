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
const BEHAVIOR_TYPE = `${MODULE_ID}.styling`;

const pulsingRegions = new Set();
const patternCache = new Map();


// ========================================================================== //
//
//  FEATURE: COMPENDIUM BROWSER SCENE CONTROL BUTTON
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
//  FEATURE: NUMERIC RESOURCE BARS & INITIALIZATION
//
//  This feature draws numeric text (e.g., "15/30") over the resource bars
//  on tokens. It uses a technique called "monkey patching" to override
//  Foundry's default drawing behavior.
//
// ========================================================================== //

Hooks.once("init", () => {
  // 1. Register Numeric Bar Settings
  game.settings.register(MODULE_ID, "fontSize", {
    name: "Font Size",
    hint: "How big the numbers appear over the bar.",
    scope: "client",
    config: true,
    type: Number,
    default: 18,
    onChange: () => canvas.tokens?.placeables.forEach(t => t.drawBars())
  });

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

  game.settings.register(MODULE_ID, "showMax", {
    name: "Show Max Value",
    hint: "Display 10/20 instead of just 10.",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
    onChange: () => canvas.tokens?.placeables.forEach(t => t.drawBars())
  });

  // Turn on our custom token bar drawing instructions
  patchTokenDrawBars();

  // 2. Register Custom Region Styling Behavior DataModel
  Object.assign(CONFIG.RegionBehavior.dataModels, {
    [BEHAVIOR_TYPE]: CustomRegionStylingBehavior
  });
  CONFIG.RegionBehavior.typeLabels[BEHAVIOR_TYPE] = "Custom Region Styling";
  CONFIG.RegionBehavior.typeIcons[BEHAVIOR_TYPE] = "fa-solid fa-swatchbook";
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


// ========================================================================== //
//
//  FEATURE: CUSTOM REGION STYLING (PATTERNS, OPACITY & PULSE)
//
//  Adds a "Custom Region Styling" RegionBehavior with procedural pattern
//  fills, separate border/fill colors and opacities, and pulsing animations.
//  Falls back to subtle border/fill styling for unconfigured regions.
//
// ========================================================================== //

/**
 * Generates and caches a repeatable 32x32 PIXI.Texture in white (0xFFFFFF)
 * so it can be dynamically tinted and alpha-blended by PIXI.Graphics.
 */
function getPatternTexture(patternType) {
  if (patternCache.has(patternType)) return patternCache.get(patternType);

  const size = 32;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  ctx.strokeStyle = "#ffffff";
  ctx.fillStyle = "#ffffff";
  ctx.lineWidth = 3;
  ctx.lineCap = "square";

  switch (patternType) {
    case "hatch":
      ctx.beginPath();
      ctx.moveTo(-size, size);
      ctx.lineTo(size, -size);
      ctx.moveTo(0, size);
      ctx.lineTo(size, 0);
      ctx.moveTo(0, size * 2);
      ctx.lineTo(size * 2, 0);
      ctx.stroke();
      break;

    case "crosshatch":
      ctx.beginPath();
      ctx.moveTo(-size, size);
      ctx.lineTo(size, -size);
      ctx.moveTo(0, size);
      ctx.lineTo(size, 0);
      ctx.moveTo(0, size * 2);
      ctx.lineTo(size * 2, 0);
      ctx.moveTo(0, -size);
      ctx.lineTo(size * 2, size);
      ctx.moveTo(0, 0);
      ctx.lineTo(size, size);
      ctx.moveTo(-size, 0);
      ctx.lineTo(size, size * 2);
      ctx.stroke();
      break;

    case "dots":
      ctx.beginPath();
      ctx.arc(8, 8, 3, 0, Math.PI * 2);
      ctx.arc(24, 24, 3, 0, Math.PI * 2);
      ctx.fill();
      break;

    case "grid":
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(size, 0);
      ctx.moveTo(0, 0);
      ctx.lineTo(0, size);
      ctx.stroke();
      break;
  }

  const texture = PIXI.Texture.from(canvas);
  texture.baseTexture.wrapMode = PIXI.WRAP_MODES.REPEAT;
  patternCache.set(patternType, texture);
  return texture;
}

/**
 * RegionBehavior DataModel defining custom visual parameters.
 */
class CustomRegionStylingBehavior extends foundry.data.regionBehaviors.RegionBehaviorType {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      fillPattern: new fields.StringField({
        initial: "hatch",
        choices: {
          none: "None (Outline Only)",
          solid: "Solid Fill",
          hatch: "Diagonal Stripes (Hatch)",
          crosshatch: "Crosshatch",
          dots: "Polka Dots",
          grid: "Square Grid"
        },
        label: "Fill Pattern"
      }),
      fillColor: new fields.ColorField({
        initial: "",
        nullable: true,
        label: "Fill Color (Leave blank to use Region Color)"
      }),
      fillOpacity: new fields.NumberField({
        initial: 0.25,
        min: 0,
        max: 1,
        step: 0.05,
        nullable: false,
        label: "Fill Opacity"
      }),
      patternScale: new fields.NumberField({
        initial: 1,
        min: 0.25,
        max: 4,
        step: 0.25,
        nullable: false,
        label: "Pattern Scale"
      }),
      borderColor: new fields.ColorField({
        initial: "",
        nullable: true,
        label: "Border Color (Leave blank to use Region Color)"
      }),
      borderWidth: new fields.NumberField({
        initial: 4,
        min: 0,
        max: 20,
        integer: true,
        nullable: false,
        label: "Border Width (px)"
      }),
      borderOpacity: new fields.NumberField({
        initial: 0.7,
        min: 0,
        max: 1,
        step: 0.05,
        nullable: false,
        label: "Border Opacity"
      }),
      pulseAnimation: new fields.BooleanField({
        initial: false,
        label: "Pulse Opacity Animation"
      })
    };
  }

  _onUpdate(changed, options, userId) {
    super._onUpdate(changed, options, userId);
    if (this.region?.object) renderRegionStyling(this.region.object);
  }

  _onCreate(data, options, userId) {
    super._onCreate(data, options, userId);
    if (this.region?.object) renderRegionStyling(this.region.object);
  }

  _onDelete(options, userId) {
    super._onDelete(options, userId);
    if (this.region?.object) renderRegionStyling(this.region.object);
  }
}

/**
 * Draws either the custom RegionBehavior styling or falls back to the default
 * non-Region-layer border/alpha adjustment.
 */
function renderRegionStyling(region) {
  const behaviorDoc = region.document.behaviors.find(
    b => (b.type === BEHAVIOR_TYPE) && !b.disabled
  );

  // --- FALLBACK: No active Custom Styling behavior on this region ---
  if (!behaviorDoc) {
    if (region.customStyleGraphics) {
      region.customStyleGraphics.destroy();
      region.customStyleGraphics = null;
    }
    pulsingRegions.delete(region);

    if (region.mesh) region.mesh.visible = true;

    // Preserve your original non-Region-layer styling fallback
    const isRegionsLayerActive = canvas.activeLayer?.options?.name === "regions";
    if (!isRegionsLayerActive && region.visible && region.mesh && region.border) {
      region.mesh.alpha = 0.15;
      const fallbackColor = Color.from(region.document.color || "#ffffff").valueOf();

      region.border.clear();
      region.border.lineStyle({
        width: 4,
        color: fallbackColor,
        alpha: 0.50,
        alignment: 0.5
      });

      for (const poly of region.polygons) {
        region.border.drawPolygon(poly.points);
      }
    }
    return;
  }

  // --- CUSTOM BEHAVIOR ACTIVE ---
  const style = behaviorDoc.system;

  let gfx = region.customStyleGraphics;
  if (!gfx || gfx.destroyed) {
    gfx = new PIXI.Graphics();
    region.customStyleGraphics = region.addChild(gfx);
  }
  gfx.clear();

  // Hide Foundry's default flat fill mesh so our pattern/opacity takes over cleanly
  if (region.mesh) region.mesh.visible = false;

  // Inherit the Region's native color if the behavior's color picker was left blank
  const baseRegionColor = region.document.color || "#ff6400";
  const borderHex = Color.from(style.borderColor || baseRegionColor).valueOf();
  const fillHex = Color.from(style.fillColor || baseRegionColor).valueOf();

  // 1. Configure Border Stroke
  if (style.borderWidth > 0 && style.borderOpacity > 0) {
    gfx.lineStyle({
      width: style.borderWidth,
      color: borderHex,
      alpha: style.borderOpacity,
      alignment: 0.5,
      join: PIXI.LINE_JOIN.ROUND
    });
  } else {
    gfx.lineStyle(0);
  }

  // 2. Configure Fill (Solid, Procedural Pattern, or None)
  const hasFill = (style.fillPattern !== "none") && (style.fillOpacity > 0);
  if (hasFill) {
    if (style.fillPattern === "solid") {
      gfx.beginFill(fillHex, style.fillOpacity);
    } else {
      const texture = getPatternTexture(style.fillPattern);
      const matrix = new PIXI.Matrix();
      matrix.scale(style.patternScale || 1, style.patternScale || 1);

      gfx.beginTextureFill({
        texture,
        color: fillHex,
        alpha: style.fillOpacity,
        matrix
      });
    }
  }

  // 3. Draw Geometry (Supports holes & polygon unions)
  if (region.polygonTree) {
    drawPolygonTreeNodes(gfx, region.polygonTree, hasFill);
  } else {
    for (const poly of region.polygons) {
      gfx.drawPolygon(poly.points);
    }
  }

  if (hasFill) {
    gfx.endFill();
  }

  // 4. Register/Unregister Pulse Ticker
  if (style.pulseAnimation) {
    pulsingRegions.add(region);
  } else {
    pulsingRegions.delete(region);
    gfx.alpha = 1.0;
  }
}

/**
 * Recursively traverses Foundry's RegionPolygonTree to draw outer boundaries
 * and punch out interior holes cleanly.
 */
function drawPolygonTreeNodes(gfx, node, hasFill) {
  for (const child of node.children) {
    const isHole = (child.depth % 2 === 1);

    if (isHole && hasFill) gfx.beginHole();
    gfx.drawPolygon(child.polygon.points);
    if (isHole && hasFill) gfx.endHole();

    if (child.children?.length) {
      drawPolygonTreeNodes(gfx, child, hasFill);
    }
  }
}

Hooks.on("drawRegion", (region) => renderRegionStyling(region));
Hooks.on("refreshRegion", (region) => renderRegionStyling(region));
Hooks.on("destroyRegion", (region) => pulsingRegions.delete(region));
Hooks.on("canvasTearDown", () => pulsingRegions.clear());

Hooks.once("canvasReady", () => {
  canvas.app.ticker.add(() => {
    if (pulsingRegions.size === 0) return;

    const time = performance.now() * 0.0025;
    const pulseFactor = (Math.sin(time) + 1) / 2;

    for (const region of pulsingRegions) {
      const gfx = region.customStyleGraphics;
      if (!gfx || gfx.destroyed || !region.visible) continue;
      gfx.alpha = 0.35 + (pulseFactor * 0.65);
    }
  });
});