Hooks.once("init", () => {
  CONFIG.DND5E.restTypes.long.exhaustionDelta = 0;
});

Hooks.once("ready", () => {
  Hooks.on("getSceneControlButtons", (controls) => {
    const toolsControl = controls.find(c => c.name === "tools");
    
    if (toolsControl) {
      toolsControl.tools.push({
        name: "myCustomButton",
        title: "My Custom Tool",
        icon: "fas fa-star",
        onClick: () => {
          console.log("Button clicked!");
          // Your code here
        },
        button: true
      });
    }
  });
});
