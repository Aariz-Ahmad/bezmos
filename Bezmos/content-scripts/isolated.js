// Runs in the extension's isolated world.

(function () {
  const TEMPLATES = window.__desmosPlusTemplates;

  // Desmos's own standard expression colors (matches Desmos.Colors in the page)
  const DESMOS_COLORS = ["#c74440", "#2d70b3", "#388c46", "#fa7e19", "#6042a6", "#000000"];

  const ICONS = {
    main: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 16 C4 8 16 12 18 5"/><line x1="19" y1="15" x2="19" y2="21"/><line x1="16" y1="18" x2="22" y2="18"/></svg>`,
    line: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><line x1="5" y1="19" x2="19" y2="5"/><circle cx="5" cy="19" r="2.2" fill="currentColor" stroke="none"/><circle cx="19" cy="5" r="2.2" fill="currentColor" stroke="none"/></svg>`,
    quadratic: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 18 Q12 2 20 18"/><circle cx="4" cy="18" r="2" fill="currentColor" stroke="none"/><circle cx="20" cy="18" r="2" fill="currentColor" stroke="none"/></svg>`,
    cubic: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 18 C4 10 20 14 20 6"/><circle cx="4" cy="18" r="2" fill="currentColor" stroke="none"/><circle cx="20" cy="6" r="2" fill="currentColor" stroke="none"/></svg>`,
    gear: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 8a4 4 0 100 8 4 4 0 000-8zm9.4 4a7.4 7.4 0 00-.1-1l2.1-1.6-2-3.5-2.5 1a7.6 7.6 0 00-1.7-1l-.4-2.7H9.2l-.4 2.7a7.6 7.6 0 00-1.7 1l-2.5-1-2 3.5L4.7 11a7.4 7.4 0 000 2l-2.1 1.6 2 3.5 2.5-1c.5.4 1.1.8 1.7 1l.4 2.7h5.6l.4-2.7c.6-.2 1.2-.6 1.7-1l2.5 1 2-3.5L21.3 13c.1-.3.1-.7.1-1z"/></svg>`,
    polygon: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 3 L21 9 L18 20 L6 20 L3 9 Z"/></svg>`,
    oval: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><ellipse cx="12" cy="12" rx="9" ry="6" transform="rotate(-25 12 12)"/></svg>`,
    fill: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12 L11 4 L20 13 L12 21 Z"/><path d="M3 12 L12 21" stroke-width="1.4"/><circle cx="19" cy="18" r="2.5" fill="currentColor" stroke="none"/></svg>`,
  };

  let calcFound = false;
  let mode = "idle"; // idle | loading | polygon-config | active
  let activeTemplate = null;
  let activeInstance = null;
  let activeKind = null; // "template" | "oval" — decides which FINALIZE message to send
  let hideGuides = false;
  let defaultColor = "#2d70b3";
  let gapTolerance = 2; // fill-tool: bridges gaps up to ~2x this many pixels wide
  let popoverOpen = false;

  chrome.storage.local.get(["dp_hideGuides", "dp_defaultColor", "dp_gapTolerance"], (result) => {
    if (typeof result.dp_hideGuides === "boolean") hideGuides = result.dp_hideGuides;
    if (typeof result.dp_defaultColor === "string") defaultColor = result.dp_defaultColor;
    if (typeof result.dp_gapTolerance === "number") gapTolerance = result.dp_gapTolerance;
    renderPopoverContent();
  });

  function setHideGuides(value) {
    hideGuides = value;
    chrome.storage.local.set({ dp_hideGuides: value });
  }

  function setDefaultColor(value) {
    defaultColor = value;
    chrome.storage.local.set({ dp_defaultColor: value });
  }

  function setGapTolerance(value) {
    gapTolerance = value;
    chrome.storage.local.set({ dp_gapTolerance: value });
  }

  // ---------- Toolbar button injection ----------
  // Matches DesModder's real nesting exactly (dsm-pillbox-buttons > tooltip
  // hit-area container > popover anchor > actual button div) rather than a
  // bare div — Desmos's CSS/event handling appears to depend on this shape.

  const button = document.createElement("div");
  button.className = "dcg-btn-flat-gray dcg-pillbox-btn-interior dcg-pillbox-element";
  button.setAttribute("role", "button");
  button.setAttribute("tabindex", "0");
  button.title = "Bezmos";
  button.style.cursor = "pointer";
  button.innerHTML = ICONS.main;
  button.addEventListener(
    "click",
    (e) => {
      e.stopPropagation();
      if (mode === "idle") {
        popoverOpen = !popoverOpen;
        renderPopoverContent();
      }
    },
    { capture: true }
  );

  const anchorWrapper = document.createElement("div");
  anchorWrapper.className = "dcg-popover-with-anchor__anchor";
  anchorWrapper.setAttribute("role", "button");
  anchorWrapper.setAttribute("tabindex", "0");
  anchorWrapper.appendChild(button);

  const hitAreaWrapper = document.createElement("div");
  hitAreaWrapper.className = "dcg-tooltip-hit-area-container dcg-display-block dcg-do-not-blur dcg-cursor-default";
  hitAreaWrapper.setAttribute("handleevent", "true");
  hitAreaWrapper.setAttribute("tabindex", "-1");
  hitAreaWrapper.appendChild(anchorWrapper);

  const buttonGroup = document.createElement("div");
  buttonGroup.className = "dsm-pillbox-buttons dsm-pillbox-and-popover";
  buttonGroup.style.display = "flex";
  buttonGroup.appendChild(hitAreaWrapper);

  const popover = document.createElement("div");
  popover.style.cssText = `
    position: fixed; z-index: 999999; display: none;
    background: #fff; border-radius: 8px; box-shadow: 0 2px 12px rgba(0,0,0,.25);
    padding: 10px; font: 13px/1.4 -apple-system, BlinkMacSystemFont, sans-serif; color: #333;
    width: 260px;
  `;
  document.documentElement.appendChild(popover);

  function positionPopover() {
    const rect = button.getBoundingClientRect();
    const popoverWidth = 260;
    let left = rect.left - popoverWidth - 8;
    if (left < 8) left = rect.right + 8; // not enough room on the left, open to the right instead
    popover.style.left = left + "px";
    popover.style.right = "auto";
    popover.style.top = Math.max(8, rect.top) + "px";
  }

  let fallbackContainer = null;
  let usingFallback = false;

  function insertButtonInto(container) {
    const zoomGroup = document.querySelector(".dcg-zoominout-pillbox");
    if (zoomGroup && zoomGroup.parentElement === container) {
      container.insertBefore(buttonGroup, zoomGroup);
    } else {
      container.appendChild(buttonGroup);
    }
  }

  // Returns true if the button is (now) present in the real toolbar.
  // Desmos's UI re-renders this area periodically and silently evicts
  // any foreign child it doesn't know about, so this isn't a one-shot check.
  function ensureButtonPresent() {
    const container = document.querySelector(".dcg-right-pillbox-elements");
    if (!container) return false;
    if (!container.contains(buttonGroup)) {
      insertButtonInto(container);
      console.log("[desmos-plus] re-inserted button (page re-render evicted it)");
    }
    return true;
  }

  function startWatching() {
    const observer = new MutationObserver(() => {
      if (usingFallback) return;
      ensureButtonPresent();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  let injectAttempts = 0;
  function tryInject() {
    injectAttempts++;
    if (ensureButtonPresent()) {
      startWatching();
      return;
    }
    if (injectAttempts < 10) {
      setTimeout(tryInject, 500);
    } else {
      usingFallback = true;
      // Fallback: Desmos's DOM didn't match what we expected. Drop a plain
      // corner button instead of silently doing nothing.
      fallbackContainer = document.createElement("div");
      fallbackContainer.style.cssText = "position:fixed; top:12px; right:12px; z-index:999999;";
      fallbackContainer.appendChild(button);
      document.documentElement.appendChild(fallbackContainer);
      button.style.cssText += "background:#fff; border:1px solid #ccc; border-radius:6px; width:37px; height:37px; display:flex; align-items:center; justify-content:center;";
      console.warn("[desmos-plus] couldn't find .dcg-right-pillbox-elements, using fallback corner button.");
    }
  }
  tryInject();

  // ---------- Popover content ----------

  function closePopover() {
    popoverOpen = false;
    popover.style.display = "none";
  }

  function renderPopoverContent() {
    if (mode === "idle") {
      if (!popoverOpen) {
        popover.style.display = "none";
        return;
      }
      popover.innerHTML = `
        <div style="font-size:11px; font-weight:600; letter-spacing:.04em; opacity:.55; margin-bottom:8px;">BEZMOS</div>
        <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:6px;">
          <button class="dp-tpl-btn" data-tpl="line" ${calcFound ? "" : "disabled"}>${ICONS.line}<span>Line</span></button>
          <button class="dp-tpl-btn" data-tpl="cubic" ${calcFound ? "" : "disabled"}>${ICONS.cubic}<span>Cubic</span></button>
          <button id="dp-custom-btn" ${calcFound ? "" : "disabled"}>${ICONS.cubic}<span>Custom</span></button>
          <button id="dp-polygon-btn" ${calcFound ? "" : "disabled"}>${ICONS.polygon}<span>Polygon</span></button>
          <button id="dp-oval-btn" ${calcFound ? "" : "disabled"}>${ICONS.oval}<span>Oval</span></button>
          <button id="dp-fill-btn" ${calcFound ? "" : "disabled"}>${ICONS.fill}<span>Fill</span></button>
        </div>
        <div style="margin-top:6px;">
          <button id="dp-settings-btn" style="width:100%;">${ICONS.gear}<span>Settings</span></button>
        </div>
        ${calcFound ? "" : '<div style="font-size:11px; opacity:.6; margin-top:6px;">looking for your graph…</div>'}
        <div id="dp-settings-panel" style="display:none; margin-top:8px; padding-top:8px; border-top:1px solid #eee; display:none;">
          <label style="display:flex; align-items:center; gap:6px; font-size:12px; cursor:pointer; margin-bottom:8px;">
            <input type="checkbox" id="dp-hide-guides" ${hideGuides ? "checked" : ""} />
            Hide construction guides
          </label>
          <div style="font-size:11px; opacity:.7; margin-bottom:4px;">Default curve color</div>
          <div style="display:flex; gap:5px; margin-bottom:8px; align-items:center;">
            ${DESMOS_COLORS.map(
              (c) => `<button class="dp-color-swatch" data-color="${c}" style="width:20px; height:20px; border-radius:50%; border:2px solid ${c === defaultColor ? "#333" : "transparent"}; background:${c}; cursor:pointer; padding:0;"></button>`
            ).join("")}
            <input type="color" id="dp-default-color" value="${defaultColor}" style="width:22px; height:22px; padding:0; border:1px solid #ddd; border-radius:4px; cursor:pointer; margin-left:2px;" title="Custom color" />
          </div>
          <label style="display:flex; align-items:center; gap:8px; font-size:12px;">
            Fill gap tolerance
            <input type="number" id="dp-gap-tolerance" value="${gapTolerance}" min="0" max="6" style="width:42px; padding:3px; border:1px solid #ddd; border-radius:4px;" />
          </label>
          <div style="font-size:10px; opacity:.55; margin-top:2px;">Bridges small gaps in a boundary (e.g. two curves that almost meet). Higher = bridges bigger gaps, but rounds off sharp corners more.</div>
        </div>
      `;
      popover.querySelectorAll(".dp-tpl-btn, #dp-settings-btn, #dp-polygon-btn, #dp-oval-btn, #dp-custom-btn, #dp-fill-btn").forEach((btn) => {
        btn.style.cssText = "display:flex; flex-direction:column; align-items:center; gap:3px; padding:8px 4px; border:1px solid #ddd; border-radius:6px; cursor:pointer; background:#f7f7f7; color:#333;";
        const label = btn.querySelector("span");
        if (label) label.style.cssText = "font-size:10px;";
      });
      popover.querySelectorAll(".dp-tpl-btn").forEach((btn) => {
        btn.addEventListener("click", () => startTemplate(btn.dataset.tpl));
      });
      popover.querySelector("#dp-custom-btn").addEventListener("click", () => {
        mode = "curve-config";
        renderPopoverContent();
      });
      popover.querySelector("#dp-polygon-btn").addEventListener("click", () => {
        mode = "polygon-config";
        renderPopoverContent();
      });
      popover.querySelector("#dp-oval-btn").addEventListener("click", startOval);
      popover.querySelector("#dp-fill-btn").addEventListener("click", startFill);
      const settingsBtn = popover.querySelector("#dp-settings-btn");
      settingsBtn.style.cssText += "flex-direction:row; justify-content:center;";
      settingsBtn.addEventListener("click", () => {
        const panel = popover.querySelector("#dp-settings-panel");
        panel.style.display = panel.style.display === "none" ? "block" : "none";
      });
      popover.querySelector("#dp-hide-guides").addEventListener("change", (e) => setHideGuides(e.target.checked));
      popover.querySelector("#dp-default-color").addEventListener("input", (e) => setDefaultColor(e.target.value));
      popover.querySelector("#dp-gap-tolerance").addEventListener("change", (e) => {
        const v = Math.max(0, Math.min(6, parseInt(e.target.value, 10) || 0));
        setGapTolerance(v);
      });
      popover.querySelectorAll(".dp-color-swatch").forEach((btn) => {
        btn.addEventListener("click", () => {
          setDefaultColor(btn.dataset.color);
          // re-render just the settings section so the selected ring updates
          const panel = popover.querySelector("#dp-settings-panel");
          const wasOpen = panel && panel.style.display !== "none";
          renderPopoverContent();
          if (wasOpen) {
            const newPanel = popover.querySelector("#dp-settings-panel");
            if (newPanel) newPanel.style.display = "block";
          }
        });
      });

      positionPopover();
      popover.style.display = "block";
    }

    if (mode === "polygon-config") {
      popover.innerHTML = `
        <strong style="font-size:12px;">POLYGON</strong>
        <label style="display:flex; align-items:center; gap:8px; font-size:12px; margin:10px 0;">
          Number of points:
          <input type="number" id="dp-polygon-n" value="5" min="3" max="20" style="width:56px; padding:4px; border:1px solid #ddd; border-radius:4px;" />
        </label>
        <div style="display:flex; gap:6px;">
          <button id="dp-polygon-start" style="flex:1; padding:8px; border:none; border-radius:6px; cursor:pointer; background:#3b82f6; color:white; font-size:13px;">Start</button>
          <button id="dp-polygon-back" style="flex:1; padding:8px; border:none; border-radius:6px; cursor:pointer; background:#444; color:white; font-size:13px;">Back</button>
        </div>
      `;
      popover.querySelector("#dp-polygon-start").addEventListener("click", () => {
        const n = Math.max(3, Math.min(20, parseInt(popover.querySelector("#dp-polygon-n").value, 10) || 5));
        startPolygon(n);
      });
      popover.querySelector("#dp-polygon-back").addEventListener("click", () => {
        mode = "idle";
        renderPopoverContent();
      });
      positionPopover();
      popover.style.display = "block";
    }

    if (mode === "curve-config") {
      popover.innerHTML = `
        <strong style="font-size:12px;">CUSTOM CURVE</strong>
        <label style="display:flex; align-items:center; gap:8px; font-size:12px; margin:10px 0;">
          Number of points:
          <input type="number" id="dp-curve-n" value="5" min="2" max="15" style="width:56px; padding:4px; border:1px solid #ddd; border-radius:4px;" />
        </label>
        <div style="display:flex; gap:6px;">
          <button id="dp-curve-start" style="flex:1; padding:8px; border:none; border-radius:6px; cursor:pointer; background:#3b82f6; color:white; font-size:13px;">Start</button>
          <button id="dp-curve-back" style="flex:1; padding:8px; border:none; border-radius:6px; cursor:pointer; background:#444; color:white; font-size:13px;">Back</button>
        </div>
      `;
      popover.querySelector("#dp-curve-start").addEventListener("click", () => {
        const n = Math.max(2, Math.min(15, parseInt(popover.querySelector("#dp-curve-n").value, 10) || 5));
        startCurve(n);
      });
      popover.querySelector("#dp-curve-back").addEventListener("click", () => {
        mode = "idle";
        renderPopoverContent();
      });
      positionPopover();
      popover.style.display = "block";
    }

    if (mode === "loading") {
      popover.innerHTML = `<div style="padding:4px;">placing your points…</div>`;
      positionPopover();
      popover.style.display = "block";
    }

    if (mode === "active") {
      const hint = activeKind === "oval" ? "Drag the points to shape it" : "Drag the orange points";
      popover.innerHTML = `
        <strong style="font-size:12px;">${activeTemplate.name.toUpperCase()}</strong>
        <div style="font-size:12px; opacity:.8; margin:6px 0;">${hint}, then:</div>
        <div style="display:flex; gap:6px;">
          <button id="dp-add" style="flex:1; padding:8px; border:none; border-radius:6px; cursor:pointer; background:#22c55e; color:white; font-size:13px;">Add to graph</button>
          <button id="dp-cancel" style="flex:1; padding:8px; border:none; border-radius:6px; cursor:pointer; background:#444; color:white; font-size:13px;">Cancel</button>
        </div>
        <div id="dp-status" style="font-size:11px; opacity:.6; margin-top:6px;"></div>
      `;
      popover.querySelector("#dp-add").addEventListener("click", () => {
        if (activeKind === "oval") commitOval();
        else commitTemplate();
      });
      popover.querySelector("#dp-cancel").addEventListener("click", () => {
        if (activeKind === "oval") cancelOval();
        else cancelTemplate();
      });
      positionPopover();
      popover.style.display = "block";
    }

    if (mode === "fill-waiting") {
      popover.innerHTML = `
        <strong style="font-size:12px;">FILL</strong>
        <div style="font-size:12px; opacity:.8; margin:6px 0;">Click a point inside the area you want to fill.</div>
        <button id="dp-fill-cancel" style="width:100%; padding:8px; border:none; border-radius:6px; cursor:pointer; background:#444; color:white; font-size:13px;">Cancel</button>
      `;
      popover.querySelector("#dp-fill-cancel").addEventListener("click", cancelFill);
      positionPopover();
      popover.style.display = "block";
    }

    if (mode === "fill-working") {
      popover.innerHTML = `<div style="padding:4px;">filling…</div>`;
      positionPopover();
      popover.style.display = "block";
    }
  }

  // Close on outside click, but not while actively editing (avoid stranding scaffold silently)
  document.addEventListener("click", (e) => {
    if (mode !== "idle") return;
    if (!popoverOpen) return;
    if (popover.contains(e.target) || button.contains(e.target)) return;
    closePopover();
  });

  // ---------- Core logic (unchanged from previous milestone) ----------

  function round(n) {
    return Math.round(n * 1000) / 1000;
  }

  function seedPositions(template, viewport) {
    const { xmin, xmax, ymin, ymax } = viewport;
    const n = template.numPoints;
    const positions = [];
    for (let i = 0; i < n; i++) {
      const frac = n === 1 ? 0.5 : i / (n - 1);
      positions.push({
        x: round(xmin + (0.25 + 0.5 * frac) * (xmax - xmin)),
        y: round(ymin + (0.35 + 0.3 * frac) * (ymax - ymin)),
      });
    }
    return positions;
  }

  // Regular N-gon layout — points evenly spaced around a circle, so an
  // N-point polygon starts as an actual regular polygon instead of a
  // collinear line (which was both visually degenerate and made it easy to
  // drag points across each other's paths for higher point counts).
  function seedPolygonPositions(n, viewport) {
    const { xmin, xmax, ymin, ymax } = viewport;
    const cx = (xmin + xmax) / 2;
    const cy = (ymin + ymax) / 2;
    const radius = 0.35 * Math.min(xmax - xmin, ymax - ymin);
    const positions = [];
    for (let i = 0; i < n; i++) {
      const angle = -Math.PI / 2 + (2 * Math.PI * i) / n; // start pointing up
      positions.push({
        x: round(cx + radius * Math.cos(angle)),
        y: round(cy + radius * Math.sin(angle)),
      });
    }
    return positions;
  }

  function instantiateTemplate(template, tag, hideGuidesFlag) {
    const state = JSON.parse(JSON.stringify(template.state));
    let survivors = state.expressions.list.filter((e) => e.type !== "folder");
    if (hideGuidesFlag) {
      const guideSet = new Set(template.guideIds);
      survivors = survivors.filter((e) => !guideSet.has(e.id));
    }

    const idMap = {};
    for (const expr of survivors) {
      const newId = `dp${tag}_${expr.id}`;
      idMap[expr.id] = newId;
      expr.id = newId;
      delete expr.folderId;
    }

    const varRenames = [];
    for (let i = template.numPoints - 1; i >= 0; i--) {
      // Descending order matters: "x_1" is a literal substring of "x_10",
      // "x_11", etc. Renaming index 1 before index 10 would corrupt "x_10"
      // mid-string (found "x_1" inside it, replaced just that part) before
      // index 10 ever gets its own turn — which is exactly why polygons
      // above 10 points had a point stuck at the origin. Going high-to-low
      // means every longer token gets its full exact match renamed (and
      // becomes immune to further matching, since the replacement text
      // always contains "{" right after "_") before any shorter prefix of
      // it is searched for.
      varRenames.push([`x_${i}`, `x_{${i}dp${tag}}`]);
      varRenames.push([`y_${i}`, `y_{${i}dp${tag}}`]);
    }
    for (const expr of survivors) {
      if (typeof expr.latex === "string") {
        for (const [oldTok, newTok] of varRenames) {
          expr.latex = expr.latex.split(oldTok).join(newTok);
        }
      }
    }

    const finalCurveLatex = varRenames.reduce(
      (latex, [oldTok, newTok]) => latex.split(oldTok).join(newTok),
      template.finalCurveLatex
    );

    const variableIds = {};
    for (const [varName, oldId] of Object.entries(template.variableIds)) {
      variableIds[varName] = idMap[oldId];
    }
    const variableLatexTokens = {};
    for (const [oldTok, newTok] of varRenames) {
      variableLatexTokens[oldTok] = newTok;
    }

    return {
      expressions: survivors,
      finalCurveLatex,
      variableIds,
      variableLatexTokens,
      allIds: survivors.map((e) => e.id),
    };
  }

  function buildInsertPayload(template, viewport, seeder) {
    const tag = Math.random().toString(36).slice(2, 8);
    const instance = instantiateTemplate(template, tag, hideGuides);
    const positions = (seeder || seedPositions)(template, viewport);
    for (let i = 0; i < template.numPoints; i++) {
      const xId = instance.variableIds[`x_${i}`];
      const yId = instance.variableIds[`y_${i}`];
      const xToken = instance.variableLatexTokens[`x_${i}`];
      const yToken = instance.variableLatexTokens[`y_${i}`];
      const xRow = instance.expressions.find((e) => e.id === xId);
      const yRow = instance.expressions.find((e) => e.id === yId);
      if (xRow) xRow.latex = `${xToken}=${positions[i].x}`;
      if (yRow) yRow.latex = `${yToken}=${positions[i].y}`;
    }
    return instance;
  }

  let pendingViewportCallback = null;

  function startTemplateInstance(template, seeder) {
    activeTemplate = template;
    activeKind = "template";
    mode = "loading";
    renderPopoverContent();
    pendingViewportCallback = (viewport) => {
      activeInstance = buildInsertPayload(activeTemplate, viewport, seeder);
      mode = "active";
      renderPopoverContent();
      window.postMessage(
        { source: "desmos-plus-request", type: "INSERT_EXPRESSIONS", expressions: activeInstance.expressions },
        "*"
      );
    };
    window.postMessage({ source: "desmos-plus-request", type: "GET_VIEWPORT" }, "*");
  }

  function startTemplate(key) {
    startTemplateInstance(TEMPLATES[key]);
  }

  function startPolygon(n) {
    startTemplateInstance(window.__desmosPlusBuildPolygon(n), (template, viewport) =>
      seedPolygonPositions(n, viewport)
    );
  }

  function startCurve(n) {
    startTemplateInstance(window.__desmosPlusBuildBezier(n, `${n}-point`));
  }

  function commitTemplate() {
    window.postMessage(
      {
        source: "desmos-plus-request",
        type: "FINALIZE",
        variableIds: activeInstance.variableIds,
        variableLatexTokens: activeInstance.variableLatexTokens,
        finalCurveLatex: activeInstance.finalCurveLatex,
        scaffoldIds: activeInstance.allIds,
        color: defaultColor,
      },
      "*"
    );
  }

  function cancelTemplate() {
    window.postMessage(
      { source: "desmos-plus-request", type: "DELETE_SCAFFOLD", scaffoldIds: activeInstance.allIds },
      "*"
    );
  }

  // ---------- Oval: separate flow, since committing it means running trig on
  // three raw point positions rather than substituting tokens into a formula.

  function renameOvalVar(name, tag) {
    // Every template var name already contains "{...}", so inserting the tag
    // right before the closing brace keeps every renamed token containing a
    // literal underscore — same safety property that makes bezier's renaming
    // collision-proof against a randomly generated alphanumeric tag.
    return name.replace("}", `dp${tag}}`);
  }

  function instantiateOval(tag, hideGuidesFlag) {
    const template = window.__desmosPlusBuildOval();
    const state = JSON.parse(JSON.stringify(template.state));
    let survivors = state.expressions.list;
    if (hideGuidesFlag) {
      const guideSet = new Set(template.guideIds);
      survivors = survivors.filter((e) => !guideSet.has(e.id));
    }

    const idMap = {};
    for (const expr of survivors) {
      const newId = `dp${tag}_${expr.id}`;
      idMap[expr.id] = newId;
      expr.id = newId;
    }

    const varNames = [
      "x_{c}", "y_{c}", "x_{r}", "y_{r}", "x_{w}", "y_{w}", "x_{h}", "y_{h}",
      "d_{rx}", "d_{ry}", "d_{rr}", "c_{L}", "s_{L}", "a_{v}", "b_{v}", "h_{v}", "k_{v}",
    ];
    const varRenames = varNames.map((name) => [name, renameOvalVar(name, tag)]);
    for (const expr of survivors) {
      if (typeof expr.latex === "string") {
        for (const [oldTok, newTok] of varRenames) {
          expr.latex = expr.latex.split(oldTok).join(newTok);
        }
      }
    }

    const handleVariableIds = {};
    for (const [key, oldId] of Object.entries(template.handleVariableIds)) {
      handleVariableIds[key] = idMap[oldId];
    }

    const renameLookup = Object.fromEntries(varRenames);
    const handleOldTokens = {
      cx: "x_{c}", cy: "y_{c}", rx: "x_{r}", ry: "y_{r}",
      wx: "x_{w}", wy: "y_{w}", hx: "x_{h}", hy: "y_{h}",
    };
    const handleVariableTokens = {};
    for (const [key, oldTok] of Object.entries(handleOldTokens)) {
      handleVariableTokens[key] = renameLookup[oldTok];
    }

    return {
      expressions: survivors,
      handleVariableIds,
      handleVariableTokens,
      allIds: survivors.map((e) => e.id),
    };
  }

  function seedOvalPositions(viewport) {
    const { xmin, xmax, ymin, ymax } = viewport;
    const w = xmax - xmin, h = ymax - ymin;
    const cx = round(xmin + 0.5 * w);
    const cy = round(ymin + 0.5 * h);
    const rx = round(cx + 0.15 * w); // rotate handle: direction only, defaults to pointing right
    const ry = cy;
    const wx = round(cx + 0.3 * w); // width handle
    const wy = cy;
    const hx = cx; // height handle
    const hy = round(cy + 0.2 * h);
    return { cx, cy, rx, ry, wx, wy, hx, hy };
  }

  function startOval() {
    activeTemplate = { name: "Oval" };
    activeKind = "oval";
    mode = "loading";
    renderPopoverContent();
    pendingViewportCallback = (viewport) => {
      const tag = Math.random().toString(36).slice(2, 8);
      activeInstance = instantiateOval(tag, hideGuides);
      const seeded = seedOvalPositions(viewport);
      const setRow = (varKey, value) => {
        const id = activeInstance.handleVariableIds[varKey];
        const row = activeInstance.expressions.find((e) => e.id === id);
        if (row) {
          const varName = row.latex.split("=")[0];
          row.latex = `${varName}=${value}`;
        }
      };
      Object.entries(seeded).forEach(([key, value]) => setRow(key, value));

      mode = "active";
      renderPopoverContent();
      window.postMessage(
        { source: "desmos-plus-request", type: "INSERT_EXPRESSIONS", expressions: activeInstance.expressions },
        "*"
      );

      const ids = activeInstance.handleVariableIds;
      const tokens = activeInstance.handleVariableTokens;
      window.postMessage(
        {
          source: "desmos-plus-request",
          type: "WATCH_OVAL_CENTER",
          cxToken: tokens.cx,
          cyToken: tokens.cy,
          initialCx: seeded.cx,
          initialCy: seeded.cy,
          others: [
            { id: ids.rx, token: tokens.rx, axis: "x" },
            { id: ids.ry, token: tokens.ry, axis: "y" },
            { id: ids.wx, token: tokens.wx, axis: "x" },
            { id: ids.wy, token: tokens.wy, axis: "y" },
            { id: ids.hx, token: tokens.hx, axis: "x" },
            { id: ids.hy, token: tokens.hy, axis: "y" },
          ],
        },
        "*"
      );
    };
    window.postMessage({ source: "desmos-plus-request", type: "GET_VIEWPORT" }, "*");
  }

  function commitOval() {
    window.postMessage(
      {
        source: "desmos-plus-request",
        type: "FINALIZE_OVAL",
        handleVariableIds: activeInstance.handleVariableIds,
        scaffoldIds: activeInstance.allIds,
        color: defaultColor,
      },
      "*"
    );
  }

  function cancelOval() {
    window.postMessage(
      { source: "desmos-plus-request", type: "DELETE_SCAFFOLD", scaffoldIds: activeInstance.allIds },
      "*"
    );
  }

  // ---------- Fill tool ----------
  // Runs entirely on pixel data from the graph's own <canvas> — deliberately
  // doesn't reason about curve math at all, so it doesn't care whether the
  // enclosed area is bounded by one closed curve or ten looping into each
  // other. Click capture + pixel reading happen here (isolated world, plain
  // DOM/canvas access); the final polygon gets sent to inject.js to insert.

  const COLOR_TOLERANCE = 40; // sum of |dR|+|dG|+|dB| before a pixel counts as "wall" — untested against real Desmos pixels yet, first guess
  let fillOverlay = null;

  function findGraphCanvas() {
    // dcg-graph-inner is the actual rendered plot; Desmos also has other,
    // much smaller canvases (icons etc.) we don't want.
    const candidates = [...document.querySelectorAll("canvas")];
    return candidates.find((c) => c.className && c.className.includes("dcg-graph-inner")) || candidates[0] || null;
  }

  function startFill() {
    const canvas = findGraphCanvas();
    if (!canvas) {
      const statusEl = popover.querySelector("#dp-status");
      if (statusEl) statusEl.textContent = "⚠️ couldn't find the graph canvas";
      return;
    }
    mode = "fill-waiting";
    renderPopoverContent();

    fillOverlay = document.createElement("div");
    const rect = canvas.getBoundingClientRect();
    fillOverlay.style.cssText = `
      position: fixed; top: ${rect.top}px; left: ${rect.left}px;
      width: ${rect.width}px; height: ${rect.height}px;
      z-index: 999997; cursor: crosshair; background: transparent;
    `;
    document.documentElement.appendChild(fillOverlay);
    fillOverlay.addEventListener("click", onFillClick, { once: true });
  }

  function removeFillOverlay() {
    if (fillOverlay) {
      fillOverlay.remove();
      fillOverlay = null;
    }
  }

  function cancelFill() {
    removeFillOverlay();
    mode = "idle";
    renderPopoverContent();
  }

  function onFillClick(e) {
    const canvas = findGraphCanvas();
    removeFillOverlay();
    if (!canvas) return;
    mode = "fill-working";
    renderPopoverContent();

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const pixelX = Math.round((e.clientX - rect.left) * scaleX);
    const pixelY = Math.round((e.clientY - rect.top) * scaleY);

    // Let the click UI finish updating before the (synchronous, potentially
    // slow) pixel work runs.
    setTimeout(() => runFill(canvas, pixelX, pixelY), 30);
  }

  function runFill(canvas, startX, startY) {
    const ctx = canvas.getContext("2d");
    const { width, height } = canvas;
    let imageData;
    try {
      imageData = ctx.getImageData(0, 0, width, height);
    } catch (err) {
      finishFillWithError("Couldn't read the graph's pixels: " + String(err));
      return;
    }
    const data = imageData.data;
    const pixelAt = (x, y) => {
      const i = (y * width + x) * 4;
      return [data[i], data[i + 1], data[i + 2]];
    };

    if (startX < 0 || startY < 0 || startX >= width || startY >= height) {
      finishFillWithError("That click was outside the graph.");
      return;
    }

    const ref = pixelAt(startX, startY);
    const isWallRaw = (x, y) => {
      if (x < 0 || y < 0 || x >= width || y >= height) return false;
      const [r, g, b] = pixelAt(x, y);
      return Math.abs(r - ref[0]) + Math.abs(g - ref[1]) + Math.abs(b - ref[2]) > COLOR_TOLERANCE;
    };

    // Try the configured gap tolerance first; if it finds nothing (likely
    // because dilation ate a small shape's whole interior), fall back to
    // progressively gentler radii rather than failing outright. Only kicks
    // in when the current setting produces an outright failure — doesn't
    // change anything for fills that already work.
    let mask, filledCount, hitBounds, usedRadius;
    for (let radius = gapTolerance; radius >= 0; radius--) {
      const result = floodFillAlgo(width, height, startX, startY, isWallRaw, radius);
      mask = result.mask; filledCount = result.filledCount; hitBounds = result.hitBounds; usedRadius = radius;
      if (filledCount >= 4 && !hitBounds) break;
    }

    if (filledCount < 4) {
      // Even radius 0 found essentially nothing — dump local diagnostics so
      // we can tell apart "click landed on a wall" from "anti-aliasing halo
      // is wider than expected" without needing to guess blind next time.
      console.warn("[bezmos] fill failed at all radii. Reference color at click:", ref);
      const rows = [];
      for (let dy = -10; dy <= 10; dy++) {
        let row = "";
        for (let dx = -10; dx <= 10; dx++) {
          row += isWallRaw(startX + dx, startY + dy) ? "#" : ".";
        }
        rows.push(row);
      }
      console.warn("[bezmos] local wall map (21x21 around click, # = wall):\n" + rows.join("\n"));
      finishFillWithError("Couldn't find an enclosed area there — try clicking somewhere more open, or check the console for a diagnostic map.");
      return;
    }
    if (hitBounds) {
      finishFillWithError("That area isn't fully closed off — the fill reached the edge of the graph.");
      return;
    }
    if (usedRadius < gapTolerance) {
      console.log(`[bezmos] fill needed to fall back to a smaller gap tolerance (${usedRadius} instead of ${gapTolerance}) to find this area — it was probably too small for the full setting.`);
    }

    const contour = traceContourAlgo(mask, width, height);
    const simplified = simplifyContourAlgo(contour, 100);

    window.postMessage({ source: "desmos-plus-request", type: "GET_VIEWPORT" }, "*");
    pendingViewportCallback = (viewport) => {
      const { xmin, xmax, ymin, ymax } = viewport;
      const points = simplified.map(([px, py]) => [
        round(xmin + (px / width) * (xmax - xmin)),
        round(ymax - (py / height) * (ymax - ymin)), // pixel Y grows downward, math Y grows upward
      ]);
      const pointsLatex = points.map(([x, y]) => `\\left(${x},${y}\\right)`).join(",");
      const latex = `\\operatorname{polygon}\\left(${pointsLatex}\\right)`;
      window.postMessage(
        { source: "desmos-plus-request", type: "FILL_INSERT", latex, color: defaultColor },
        "*"
      );
      mode = "idle";
      renderPopoverContent();
    };
  }

  function finishFillWithError(message) {
    mode = "idle";
    renderPopoverContent();
    console.warn("[bezmos] fill:", message);
  }

  // Same algorithm verified against synthetic test shapes before wiring up —
  // see fill_test/algo2.js. Ported inline here rather than loaded separately
  // since content scripts can't easily import local modules.
  //
  // Separable dilation: horizontal pass then vertical pass. Mathematically
  // exact for a square structuring element, much cheaper than re-scanning a
  // full (2R+1)x(2R+1) neighborhood per pixel — matters once the radius is
  // large enough to bridge a real gap, not just a 1px diagonal corner-touch.
  function dilateMask(isWallRaw, width, height, radius) {
    const raw = new Uint8Array(width * height);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++)
        raw[y * width + x] = isWallRaw(x, y) ? 1 : 0;

    const hPass = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let hit = 0;
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx;
          if (nx >= 0 && nx < width && raw[y * width + nx]) { hit = 1; break; }
        }
        hPass[y * width + x] = hit;
      }
    }
    const dilated = new Uint8Array(width * height);
    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        let hit = 0;
        for (let dy = -radius; dy <= radius; dy++) {
          const ny = y + dy;
          if (ny >= 0 && ny < height && hPass[ny * width + x]) { hit = 1; break; }
        }
        dilated[y * width + x] = hit;
      }
    }
    return dilated;
  }

  function floodFillAlgo(width, height, startX, startY, isWallRaw, gapRadius) {
    const wallMask = dilateMask(isWallRaw, width, height, gapRadius);
    const mask = new Uint8Array(width * height);
    if (wallMask[startY * width + startX]) return { mask, filledCount: 0, hitBounds: false };
    const queue = [[startX, startY]];
    mask[startY * width + startX] = 1;
    let filledCount = 1;
    let hitBounds = false;
    while (queue.length) {
      const [x, y] = queue.pop();
      const neighbors = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
      for (const [nx, ny] of neighbors) {
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) { hitBounds = true; continue; }
        const idx = ny * width + nx;
        if (mask[idx]) continue;
        if (wallMask[idx]) continue;
        mask[idx] = 1;
        filledCount++;
        queue.push([nx, ny]);
      }
    }
    return { mask, filledCount, hitBounds };
  }

  function traceContourAlgo(mask, width, height) {
    let start = null;
    for (let y = 0; y < height && !start; y++) {
      for (let x = 0; x < width; x++) {
        if (mask[y * width + x]) { start = [x, y]; break; }
      }
    }
    if (!start) return [];
    const dirs = [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];
    const filled = (x, y) => x >= 0 && y >= 0 && x < width && y < height && mask[y * width + x] === 1;
    const boundary = [start];
    let current = start;
    let backtrack = 6;
    const maxSteps = width * height * 4;
    let steps = 0;
    while (steps++ < maxSteps) {
      let found = false;
      for (let i = 0; i < 8; i++) {
        const dirIdx = (backtrack + i) % 8;
        const [dx, dy] = dirs[dirIdx];
        const nx = current[0] + dx, ny = current[1] + dy;
        if (filled(nx, ny)) {
          current = [nx, ny];
          backtrack = (dirIdx + 5) % 8;
          found = true;
          break;
        }
      }
      if (!found) break;
      if (current[0] === start[0] && current[1] === start[1]) break;
      boundary.push(current);
    }
    return boundary;
  }

  function simplifyContourAlgo(points, targetCount) {
    if (points.length <= targetCount) return points;
    const stride = points.length / targetCount;
    const result = [];
    for (let i = 0; i < targetCount; i++) result.push(points[Math.floor(i * stride)]);
    return result;
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (!event.data || event.data.source !== "desmos-plus") return;
    const msg = event.data;

    if (msg.type === "CALC_PROBE_RESULT") {
      calcFound = msg.candidates.length > 0;
      if (mode === "idle" && popoverOpen) renderPopoverContent();
    }

    if (msg.type === "VIEWPORT_RESULT" && pendingViewportCallback) {
      pendingViewportCallback(msg.viewport);
      pendingViewportCallback = null;
    }

    if (msg.type === "FINALIZE_DONE" || msg.type === "FINALIZE_OVAL_DONE" || msg.type === "DELETE_DONE") {
      mode = "idle";
      activeTemplate = null;
      activeInstance = null;
      activeKind = null;
      popoverOpen = false;
      renderPopoverContent();
    }

    if (msg.type === "ERROR") {
      const statusEl = popover.querySelector("#dp-status");
      if (statusEl) statusEl.textContent = "⚠️ " + msg.message;
      else console.error("[desmos-plus]", msg.message);
    }
  });
})();
