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
