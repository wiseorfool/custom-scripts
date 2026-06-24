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
  game.settings.register(MODULE_ID, "disableExhaustionRecovery", {
    name: "Disable Exhaustion Recovery on Long Rest",
    hint: "If checked, characters will not recover a level of exhaustion after a long rest. Requires a reload to apply.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    requiresReload: true,
  });

  // Apply the setting on initialization
  applyExhaustionSetting();
});



  Hooks.on("getSceneControlButtons", (controls) => {
    const toolsControl = controls.find(c => c.name === "tools");

    if (toolsControl) {
      toolsControl.tools["myCustomButton"] = {
        title: "My Custom Tool",
        icon: "fas fa-star",
        button: true,
        onClick: () => console.log("Button clicked!")
      };
    }
  });
