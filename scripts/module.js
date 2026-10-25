const MODULE_ID = "custom-scripts";

/**
 * Apply exhaustion recovery settings for D&D5e v3.x+ and legacy versions.
 */
const applyExhaustionSetting = () => {
  const disableRecovery = game.settings.get(MODULE_ID, "disableExhaustionRecovery");

  const exhaustionValue = disableRecovery ? 0 : 1;
  const exhaustionDeltaValue = disableRecovery ? 0 : -1;

  // D&D5e v3.x+ (Foundry 11–14)
  if (foundry.utils.isNewerVersion("3.0.0", game.system.version)) {
    CONFIG.DND5E.restRules.longRest.exhaustion = exhaustionValue;
  } else {
    // Legacy fallback
    CONFIG.DND5E.restTypes.long.exhaustionDelta = exhaustionDeltaValue;
  }
};

Hooks.once("init", () => {
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

/**
 * HP-based condition automation:
 * - Uses D&D5e's own Bloodied condition, only changes icon.
 * - Removes Bloodied below Critical threshold.
 * - Applies/removes custom Critical condition.
 */
Hooks.on("updateActor", async (actor, update) => {
  if (!update.system?.attributes?.hp) return;

  const hp = actor.system.attributes.hp.value;
  const maxHp = actor.system.attributes.hp.max;
  const hpPct = maxHp > 0 ? (hp / maxHp) * 100 : 0;

  const criticalName = game.settings.get(MODULE_ID, "criticalConditionName");
  const criticalIcon = game.settings.get(MODULE_ID, "criticalConditionIcon");

  const enableBloodiedOverride = game.settings.get(MODULE_ID, "enableBloodiedOverride");
  const bloodiedThreshold = game.settings.get(MODULE_ID, "bloodiedThreshold");
  const criticalThreshold = game.settings.get(MODULE_ID, "criticalThreshold");
  const autoRemoveCriticalAbove = game.settings.get(MODULE_ID, "autoRemoveCriticalAboveThreshold");
  const autoRemoveBloodiedAbove = game.settings.get(MODULE_ID, "autoRemoveBloodiedAboveThreshold");

  const bloodiedIconPC = game.settings.get(MODULE_ID, "bloodiedConditionIconPC");
  const bloodiedIconNPC = game.settings.get(MODULE_ID, "bloodiedConditionIconNPC");

  // Existing D&D5e Bloodied effect (by label)
  const bloodiedEffect = actor.effects.find(e => e.label === "Bloodied");

  // Custom Critical effect
  const criticalEffect = actor.effects.find(e => e.flags[MODULE_ID]?.condition === "critical");

  // Dead → remove both
  if (hp <= 0) {
    if (criticalEffect) await actor.deleteEmbeddedDocuments("ActiveEffect", [criticalEffect.id]);
    if (bloodiedEffect) await actor.deleteEmbeddedDocuments("ActiveEffect", [bloodiedEffect.id]);
    return;
  }

  // Critical at or below threshold
  if (hpPct <= criticalThreshold) {
    // Remove Bloodied when Critical applies
    if (bloodiedEffect) await actor.deleteEmbeddedDocuments("ActiveEffect", [bloodiedEffect.id]);

    if (!criticalEffect) {
      await actor.createEmbeddedDocuments("ActiveEffect", [{
        label: criticalName,
        icon: criticalIcon,
        flags: { [MODULE_ID]: { condition: "critical" } }
      }]);
    }
  } else if (autoRemoveCriticalAbove && criticalEffect) {
    // Remove Critical when HP rises above threshold
    await actor.deleteEmbeddedDocuments("ActiveEffect", [criticalEffect.id]);
  }

  // Bloodied icon override (only when Bloodied exists and HP > critical threshold)
  if (enableBloodiedOverride && bloodiedEffect && hpPct > criticalThreshold) {
    const isNPC = actor.type === "npc";
    const desiredIcon = isNPC ? bloodiedIconNPC : bloodiedIconPC;

    if (bloodiedEffect.icon !== desiredIcon) {
      await bloodiedEffect.update({ icon: desiredIcon });
    }
  }

  // Optional: remove Bloodied above configured threshold
  if (autoRemoveBloodiedAbove && bloodiedEffect && hpPct > bloodiedThreshold) {
    await actor.deleteEmbeddedDocuments("ActiveEffect", [bloodiedEffect.id]);
  }
});



/**
 * SceneControls button injection for Foundry 14:
 * Adds a Compendium Browser button to the Tools controls.
 */
Hooks.once("ready", () => {
  Hooks.on("getSceneControlButtons", (controls) => {
    const groups = controls.controls;
    if (!Array.isArray(groups)) return;

    const toolsControl = groups.find(g => g.name === "tools");
    if (!toolsControl) return;

    toolsControl.tools.push({
      name: "compendium-browser-button",
      title: "Compendium Browser",
      icon: "fas fa-atlas",
      onClick: () => game.dnd5e.apps.compendiumBrowser.render(true),
      button: true
    });
  });
});
const MODULE_ID = "custom-scripts";

// Track our custom sub-toolbar states
let templateSubBarActive = false;
let activeSubTool = "select";

Hooks.once("init", () => {
  // Inject styling so the 3rd toolbar aligns cleanly next to the 2nd tool column
  const style = document.createElement("style");
  style.id = `${MODULE_ID}-styles`;
  style.innerHTML = `
    #scene-controls {
      display: flex;
      flex-direction: row;
      gap: 8px;
    }
    #scene-controls-subtools {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin: 0;
      padding: 0;
      list-style: none;
      pointer-events: all;
    }
  `;
  document.head.appendChild(style);
});

/**
 * 1. Register the toggle button inside Token Controls (v14 Record Object syntax)
 */
Hooks.on("getSceneControlButtons", (controls) => {
  if (!controls.tokens?.tools) return;

  controls.tokens.tools.measuredTemplateSubBar = {
    name: "measuredTemplateSubBar",
    title: "Measured Templates",
    icon: "fa-solid fa-ruler-combined",
    order: 99,
    toggle: true,
    active: templateSubBarActive,
    onChange: (event, active) => {
      templateSubBarActive = active;
      if (!active && canvas.regions?.active) {
        // Return to token layer when toggled off
        canvas.tokens.activate({ tool: "select" });
      }
      ui.controls.render();
    }
  };
});

/**
 * 2. Render the 3rd Sub-Toolbar when the toggle is active
 */
Hooks.on("renderSceneControls", (app, element) => {
  // Remove existing sub-bar before re-evaluating
  element.querySelector("#scene-controls-subtools")?.remove();

  // If the user switched to Walls, Lighting, etc., turn off our sub-bar
  const currentControl = ui.controls.control?.name;
  if (currentControl !== "tokens" && currentControl !== "regions") {
    templateSubBarActive = false;
    return;
  }

  if (!templateSubBarActive) return;

  // Define the 3rd toolbar tools matching v14 Region Tools
  const subTools = [
    { name: "select", title: "Select Template", icon: "fa-solid fa-arrow-pointer", tool: "select" },
    { name: "rectangle", title: "Rectangle", icon: "fa-solid fa-vector-square", tool: "rectangle" },
    { name: "circle", title: "Circle", icon: "fa-regular fa-circle", tool: "circle" },
    { name: "cone", title: "Cone", icon: "fa-solid fa-wifi", tool: "cone" },
    { name: "emanation", title: "Emanation", icon: "fa-solid fa-bullseye", tool: "emanation" },
    { name: "line", title: "Line", icon: "fa-solid fa-grip-lines-vertical", tool: "line" }, // Note: v14 may also alias this as "ray"
    { name: "ring", title: "Ring", icon: "fa-solid fa-ring", tool: "ring" },
    { name: "clear", title: "Clear Unattached Templates", icon: "fa-solid fa-trash", button: true }
  ];

  const menu = document.createElement("menu");
  menu.id = "scene-controls-subtools";
  menu.className = "control-tools";

  for (const t of subTools) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `control ui-control tool ${t.button ? "button" : ""} ${(!t.button && activeSubTool === t.name) ? "active" : ""}`;
    btn.dataset.subtool = t.name;
    btn.dataset.tooltip = t.title;
    btn.setAttribute("aria-label", t.title);
    btn.innerHTML = `<i class="${t.icon}"></i>`;

    btn.addEventListener("click", async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();

      if (t.name === "clear") {
        await clearUnattachedTemplates();
        return;
      }

      activeSubTool = t.name;
      await activateRegionTemplateTool(t.tool);
    });

    li.appendChild(btn);
    menu.appendChild(li);
  }

  // Append as the 3rd column inside #scene-controls
  element.appendChild(menu);
});

/**
 * 3. Activate the Region Layer in Measured Template Mode with the chosen shape
 */
async function activateRegionTemplateTool(toolName) {
  const regionControls = ui.controls.controls.regions;
  if (!regionControls) return;

  // Verify exact tool key name (handles cases where "line" is keyed as "ray" in core)
  let resolvedTool = toolName;
  if (!regionControls.tools[resolvedTool] && toolName === "line" && regionControls.tools.ray) {
    resolvedTool = "ray";
  }

  // Force Measured Template Mode toggle ON inside Region tools
  const templateModeTool = Object.values(regionControls.tools).find(
    t => t.toggle && (t.name.toLowerCase().includes("template") || t.title.includes("Template"))
  );
  
  if (templateModeTool) {
    templateModeTool.active = true;
    if (typeof templateModeTool.onChange === "function") {
      templateModeTool.onChange(new Event("change"), true);
    }
  }

  // Activate the Region Layer and select the drawing/select tool
  canvas.regions.activate({ tool: resolvedTool });
  ui.controls.render();
}

/**
 * 4. Delete only Template Regions that are NOT attached to a Token or Actor
 */
async function clearUnattachedTemplates() {
  if (!canvas.scene) return;

  const toDelete = canvas.scene.regions.filter(region => {
    // 1. Check if the region is attached to a Token/Actor (v14 core attachment & dnd5e v6 flags)
    const hasCoreAttachment = Boolean(
      region.attachment?.token || 
      region.token || 
      region.tokens?.size > 0 ||
      region.shapes?.some(s => s.type === "emanation" && s.token)
    );
    const hasSystemAttachment = Boolean(
      region.flags?.dnd5e?.attachedToken ||
      region.flags?.dnd5e?.dependents?.length ||
      region.flags?.dnd5e?.origin?.includes("Actor.")
    );

    if (hasCoreAttachment || hasSystemAttachment) return false;

    // 2. Ensure we only clear "Measured Template" style regions, not map triggers/stairs!
    // Template Mode sets highlightMode to "coverage", displays measurements, and adds no map behaviors.
    const isTemplateRegion = (
      region.displayMeasurements === true || 
      region.highlightMode === "coverage" || 
      Boolean(region.flags?.dnd5e?.spellLevel || region.flags?.dnd5e?.item)
    ) && region.behaviors.size === 0;

    return isTemplateRegion;
  }).map(r => r.id);

  if (toDelete.length > 0) {
    await canvas.scene.deleteEmbeddedDocuments("Region", toDelete);
    ui.notifications.info(`Cleared ${toDelete.length} unattached measured template(s).`);
  } else {
    ui.notifications.info("No unattached measured templates found to clear.");
  }
}