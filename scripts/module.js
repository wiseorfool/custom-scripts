Hooks.once("init", () => {
  CONFIG.DND5E.restTypes.long.exhaustionDelta = 0;
});

export function initForceCompendiumBrowser() {
    // Optimization: Don't attach a hook at all if the current user is a GM.
    if (game.user.isGM) return;

    const interceptCompendiumClick = (sidebar) => {
        if (!game.settings.get(MODULE_ID, "enableForceCompendiumBrowser")) return;
        const compendiumButton = sidebar.querySelector('#sidebar-tabs [data-tab="compendium"]');

        if (compendiumButton) {
            if (compendiumButton.dataset.nd5tForced) return;
            compendiumButton.dataset.nd5tForced = "true";

            compendiumButton.addEventListener("click", (event) => {
                debug("Intercepting Compendium tab click to force browser");
                event.stopPropagation();
                event.preventDefault();

                if (globalThis.dnd5e?.applications?.CompendiumBrowser) {
                    new globalThis.dnd5e.applications.CompendiumBrowser().render(true);
                } else if (game.dnd5e?.applications?.CompendiumBrowser) {
                    new game.dnd5e.applications.CompendiumBrowser().render(true);
                } else {
                    ui.notifications.warn("Unable to find the DnD5e Compendium Browser.");
                }
            }, { capture: true }); 
        }
    };

    Hooks.on("renderSidebar", (app, html, data) => {
        const sidebar = html[0] || html;
        interceptCompendiumClick(sidebar);
    });
    // Also support AppV2 sidebar rendering (V14+)
    Hooks.on("renderApplicationV2", (app, html) => {
        if (app.id === "sidebar" || app.constructor?.name === "Sidebar") {
            const sidebar = html[0] || html;
            interceptCompendiumClick(sidebar);
        }
    });
}
 
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
  if (!game.settings.get(MODULE_ID, "enableActorDispositionColors")) return;
  const colors = getDispositionColors();

  const directoryHTML = html[0] || html;
  directoryHTML.querySelectorAll("li.directory-item.entry.actor").forEach(item => {
    let actorId = item.dataset.entryId || item.dataset.documentId;
    let actor = game.actors.get(actorId);

    if (actor && actor.prototypeToken.disposition.toString() in colors) {
      debug(`Applying disposition color to actor ${actor.name} (${actor.id})`);
      applyDispositionDot(item, colors[actor.prototypeToken.disposition.toString()]);
    }
  });
}

function colorActorDisposition(actor, updates, options, userId) {
  if (!game.settings.get(MODULE_ID, "enableActorDispositionColors")) return;
  const colors = getDispositionColors();

  if (actor && actor.prototypeToken.disposition.toString() in colors) {
      let item = document.querySelector(`li.directory-item[data-document-id="${actor.id}"]`) ||
                 document.querySelector(`li.directory-item[data-entry-id="${actor.id}"]`);
      if (item) {
        applyDispositionDot(item, colors[actor.prototypeToken.disposition.toString()]);
      }
  }
}

let initialized = false;
export function initActorDispositionColors() {
  if (initialized) return;
  initialized = true;
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
}
