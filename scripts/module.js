Hooks.once("init", () => {
  CONFIG.DND5E.restTypes.long.exhaustionDelta = 0;
});

Hooks.on("getSceneControlButtons", (controls) => {
  // Guard: only add this if the dnd5e system is active and the browser exists.
  if (game.system.id !== "dnd5e") return;
  if (!dnd5e?.applications?.CompendiumBrowser) {
    console.warn("Compendium Browser Button | dnd5e.applications.CompendiumBrowser not found.");
    return;
  }
 
  // Add to the "tokens" control group (the default left toolbar).
  const tokenControls = controls.tokens;
  if (!tokenControls) {
    console.warn("Compendium Browser Button | 'tokens' control group not found.");
    return;
  }
 
  tokenControls.tools.compendiumBrowser = {
    name: "compendiumBrowser",
    title: "Compendium Browser",
    icon: "fa-solid fa-book-atlas",
    order: Object.keys(tokenControls.tools).length,
    button: true,
    visible: true, // set to game.user.isGM if you want GM-only
    onChange: () => {
      // Reuse an existing rendered instance if one is open, otherwise create one.
      const existing = Object.values(ui.windows).find(
        (app) => app instanceof dnd5e.applications.CompendiumBrowser
      );
      if (existing) existing.bringToFront();
      else new dnd5e.applications.CompendiumBrowser().render({ force: true });
    }
  };
});
 