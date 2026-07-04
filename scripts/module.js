const MODULE_ID = "custom-scripts";

/**
 * A helper function to apply the exhaustion setting.
 * This reads the setting and modifies the D&D 5e configuration accordingly.
 */
const applyExhaustionSetting = () => {
  const disableRecovery = game.settings.get(MODULE_ID, "disableExhaustionRecovery");

  // For dnd5e system v3.x+, the default is to recover 1 exhaustion.
  // For older systems, the default exhaustionDelta is -1.
  const exhaustionValue = disableRecovery ? 0 : 1;
  const exhaustionDeltaValue = disableRecovery ? 0 : -1;

  // For dnd5e system v3.x+
  if (foundry.utils.isNewerVersion("3.0.0", game.system.version)) {
    CONFIG.DND5E.restRules.longRest.exhaustion = exhaustionValue;
  } else { // Fallback for older dnd5e systems
    CONFIG.DND5E.restTypes.long.exhaustionDelta = exhaustionDeltaValue;
  }
};

Hooks.once("init", () => {
  // Exhaustion setting
  game.settings.register(MODULE_ID, "disableExhaustionRecovery", {
    name: "Disable Exhaustion Recovery on Long Rest",
    hint: "If checked, characters will not recover a level of exhaustion after a long rest. Requires a reload to apply.",
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

  // Bloodied Condition settings
  game.settings.register(MODULE_ID, "bloodiedConditionName", {
    name: "Bloodied Condition Name",
    scope: "world",
    config: true,
    type: String,
    default: "Bloodied",
  });
  game.settings.register(MODULE_ID, "bloodiedConditionIcon", {
    name: "Bloodied Condition Icon",
    scope: "world",
    config: true,
    type: String,
    default: "icons/svg/blood.svg",
    filePicker: "image"
  });
  
  game.settings.register(MODULE_ID, "enableBloodiedAt50", {
    name: "Enable Bloodied at 50% HP",
    hint: "If checked, the bloodied condition will be applied at 50% HP.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
  });

  // Apply the setting on initialization
  applyExhaustionSetting();
});

Hooks.on("updateActor", async (actor, update) => {
    if (!update.system?.attributes?.hp) {
        return;
    }

    const hp = actor.system.attributes.hp.value;
    const maxHp = actor.system.attributes.hp.max;
    const hpPercentage = maxHp > 0 ? (hp / maxHp) * 100 : 0;

    const criticalName = game.settings.get(MODULE_ID, "criticalConditionName");
    const criticalIcon = game.settings.get(MODULE_ID, "criticalConditionIcon");
    const bloodiedName = game.settings.get(MODULE_ID, "bloodiedConditionName");
    const bloodiedIcon = game.settings.get(MODULE_ID, "bloodiedConditionIcon");
    const enableBloodied = game.settings.get(MODULE_ID, "enableBloodiedAt50");

    const criticalEffectData = {
        label: criticalName,
        icon: criticalIcon,
        flags: { [MODULE_ID]: { condition: 'critical' } }
    };

    const bloodiedEffectData = {
        label: bloodiedName,
        icon: bloodiedIcon,
        flags: { [MODULE_ID]: { condition: 'bloodied' } }
    };

    const hasCritical = actor.effects.find(e => e.flags[MODULE_ID]?.condition === 'critical');
    const hasBloodied = actor.effects.find(e => e.flags[MODULE_ID]?.condition === 'bloodied');

    if (hp <= 0) {
        if (hasCritical) await actor.deleteEmbeddedDocuments("ActiveEffect", [hasCritical.id]);
        if (hasBloodied) await actor.deleteEmbeddedDocuments("ActiveEffect", [hasBloodied.id]);
        return;
    }

    // Critical Condition at 25%
    if (hpPercentage <= 25) {
        if (!hasCritical) await actor.createEmbeddedDocuments("ActiveEffect", [criticalEffectData]);
    } else {
        if (hasCritical) await actor.deleteEmbeddedDocuments("ActiveEffect", [hasCritical.id]);
    }

    // Optional Bloodied Condition at 50%
    if (enableBloodied) {
        if (hpPercentage <= 50 && hpPercentage > 25) {
            if (!hasBloodied) await actor.createEmbeddedDocuments("ActiveEffect", [bloodiedEffectData]);
        } else {
            if (hasBloodied) await actor.deleteEmbeddedDocuments("ActiveEffect", [hasBloodied.id]);
        }
    } else { // If bloodied is not enabled, make sure to remove it if it exists
        if (hasBloodied) await actor.deleteEmbeddedDocuments("ActiveEffect", [hasBloodied.id]);
    }
});

Hooks.once("ready", () => {
  Hooks.on("getSceneControlButtons", (controls) => {
    const toolsControl = controls.find(c => c.name === "tools");
    if (toolsControl) {
      toolsControl.tools.push({
        name: "compendium-browser-button",
        title: "Compendium Browser",
        icon: "fas fa-atlas",
        onClick: () => {
          if (window.compendiumBrowserInstance) {
            window.compendiumBrowserInstance.render(true);
          } else {
            ui.notifications.warn("Compendium Browser not available.");
          }
        },
        button: true
      });
    }
  });
});
