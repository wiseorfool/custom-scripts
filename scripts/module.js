Hooks.once("init", () => {
  CONFIG.DND5E.restTypes.long.exhaustionDelta = 0;
});

Hooks.on("getSceneControlButtons", (controls) => {
  const compendiumControl = {
    name: "compendium",
    title: "Compendium",
    layer: "controls",
    icon: "fas fa-atlas",
    visible: true,
    tools: [
      {
        name: "browser",
        title: "Open Compendium Browser",
        icon: "fas fa-book",
        onClick: () => {
          // Check actual dnd5e app path here
          new dnd5e.applications.CompendiumBrowser().render(true);
        },
        button: true
      }
    ]
  };
  controls.push(compendiumControl);
});


/** Disposition Colors **/

function getDispositionColors() {
  return {
    "-2": '#' + CONFIG.Canvas.dispositionColors.SECRET.toString(16).padStart(6, '0'),
    "-1": '#' + CONFIG.Canvas.dispositionColors.HOSTILE.toString(16).padStart(6, '0'),
    "0": '#' + CONFIG.Canvas.dispositionColors.NEUTRAL.toString(16).padStart(6, '0'),
    "1": '#' + CONFIG.Canvas.dispositionColors.FRIENDLY.toString(16).padStart(6, '0')
  };
}

function applyDispositionDot(item, color) {
  let dot = item.querySelector('.nd5t-disposition-dot');
  if (!dot) {
    dot = document.createElement('span');
    dot.className = 'nd5t-disposition-dot';

    const firstChild = item.children[0];
    if (firstChild) item.insertBefore(dot, firstChild);
    else item.appendChild(dot);
  }
  dot.style.backgroundColor = color;
}

function colorActorDispositionRender(app, html, options) {
  const colors = getDispositionColors();

  const directoryHTML = html[0] || html;
  directoryHTML.querySelectorAll("li.directory-item.entry.actor").forEach(item => {
    let actorId = item.dataset.entryId || item.dataset.documentId;
    let actor = game.actors.get(actorId);

    if (actor && actor.prototypeToken.disposition.toString() in colors) {
      applyDispositionDot(item, colors[actor.prototypeToken.disposition.toString()]);
    }
  });
}

function colorActorDisposition(actor, updates, options, userId) {
  const colors = getDispositionColors();

  if (actor && actor.prototypeToken.disposition.toString() in colors) {
    let item = document.querySelector(`li.directory-item[data-document-id="${actor.id}"]`) ||
               document.querySelector(`li.directory-item[data-entry-id="${actor.id}"]`);
    if (item) {
      applyDispositionDot(item, colors[actor.prototypeToken.disposition.toString()]);
    }
  }
}

// World script initialization - runs automatically
Hooks.on("renderActorDirectory", colorActorDispositionRender);
// Also support AppV2 sidebar rendering (V14+)
Hooks.on("renderApplicationV2", (app, html) => {
  if (app instanceof CONFIG.ui?.actors?.constructor || app.constructor?.name === "ActorDirectory") {
    colorActorDispositionRender(app, html);
  }
});
Hooks.on("updateActor", (actor, updates, options, userId) => {
  if (updates.prototypeToken?.disposition !== undefined)
    colorActorDisposition(actor, updates, options, userId);
});
