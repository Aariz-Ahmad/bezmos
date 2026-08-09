// Runs INSIDE the Desmos page's own JS context (world: "MAIN").

(function () {
  const COMMON_NAMES = ["Calc", "calc", "Calculator", "calculator", "desmosCalculator", "DesmosCalculator"];

  function looksLikeCalculator(v) {
    return v && typeof v === "object" && typeof v.setExpression === "function";
  }

  function scanWindow() {
    const allKeys = Object.getOwnPropertyNames(window);
    const matches = allKeys.filter((k) => {
      let v;
      try { v = window[k]; } catch (e) { return false; }
      return looksLikeCalculator(v);
    });
    return { totalKeys: allKeys.length, matches };
  }

  function checkCommonNames() {
    return COMMON_NAMES.map((name) => {
      let v;
      try { v = window[name]; } catch (e) { v = undefined; }
      return { name, exists: v !== undefined, isCalculator: looksLikeCalculator(v) };
    });
  }

  let found = [];
  let attempts = 0;
  const maxAttempts = 20;

  function probe() {
    attempts++;
    const { totalKeys, matches } = scanWindow();
    const commonCheck = checkCommonNames();
    found = matches.length > 0 ? matches : commonCheck.filter((c) => c.isCalculator).map((c) => c.name);
    window.postMessage(
      { source: "desmos-plus", type: "CALC_PROBE_RESULT", candidates: found, attempts, totalKeys },
      "*"
    );
    if (found.length === 0 && attempts < maxAttempts) setTimeout(probe, 500);
  }
  probe();

  function realCalc() {
    return found.length > 0 ? window[found[0]] : null;
  }

  function formatNumber(n) {
    return String(Math.round(n * 1000) / 1000);
  }

  // Watches the oval's center (x_c, y_c) live and shifts the other three
  // handle points by the same delta the instant center moves — so dragging
  // center translates the whole shape instead of reshaping it. Built on
  // Desmos's documented HelperExpression.observe('numericValue', ...), which
  // fires on every change to the watched expression, including mid-drag.
  let ovalWatcher = null;

  function stopOvalWatcher() {
    if (!ovalWatcher) return;
    try { ovalWatcher.cxHelper.unobserve("numericValue"); } catch (e) {}
    try { ovalWatcher.cyHelper.unobserve("numericValue"); } catch (e) {}
    ovalWatcher = null;
  }

  function startOvalWatcher(calc, msg) {
    stopOvalWatcher();
    const cxHelper = calc.HelperExpression({ latex: msg.cxToken });
    const cyHelper = calc.HelperExpression({ latex: msg.cyToken });
    let lastCx = msg.initialCx;
    let lastCy = msg.initialCy;

    function onCenterChange() {
      const newCx = cxHelper.numericValue;
      const newCy = cyHelper.numericValue;
      if (typeof newCx !== "number" || typeof newCy !== "number") return;
      const dx = newCx - lastCx;
      const dy = newCy - lastCy;
      if (dx === 0 && dy === 0) return;
      lastCx = newCx;
      lastCy = newCy;

      const state = calc.getState();
      const updates = [];
      for (const other of msg.others) {
        const row = state.expressions.list.find((e) => e.id === other.id);
        if (!row || typeof row.latex !== "string") continue;
        const curVal = parseFloat(row.latex.split("=")[1]);
        if (isNaN(curVal)) continue;
        const newVal = curVal + (other.axis === "x" ? dx : dy);
        updates.push({ id: other.id, latex: `${other.token}=${formatNumber(newVal)}` });
      }
      if (updates.length) calc.setExpressions(updates);
    }

    cxHelper.observe("numericValue", onCenterChange);
    cyHelper.observe("numericValue", onCenterChange);
    ovalWatcher = { cxHelper, cyHelper };
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (!event.data || event.data.source !== "desmos-plus-request") return;
    const msg = event.data;

    if (msg.type === "GET_VIEWPORT") {
      const calc = realCalc();
      if (!calc) {
        window.postMessage({ source: "desmos-plus", type: "ERROR", message: "No calculator instance found." }, "*");
        return;
      }
      const state = calc.getState();
      window.postMessage({ source: "desmos-plus", type: "VIEWPORT_RESULT", viewport: state.graph.viewport }, "*");
      return;
    }

    if (msg.type === "INSERT_EXPRESSIONS") {
      const calc = realCalc();
      if (!calc) {
        window.postMessage({ source: "desmos-plus", type: "ERROR", message: "No calculator instance found." }, "*");
        return;
      }
      try {
        calc.setExpressions(msg.expressions);
        window.postMessage({ source: "desmos-plus", type: "INSERT_DONE" }, "*");
      } catch (err) {
        window.postMessage({ source: "desmos-plus", type: "ERROR", message: "Insert failed: " + String(err) }, "*");
      }
      return;
    }

    if (msg.type === "FINALIZE") {
      const calc = realCalc();
      if (!calc) {
        window.postMessage({ source: "desmos-plus", type: "ERROR", message: "No calculator instance found." }, "*");
        return;
      }
      try {
        const state = calc.getState();
        const values = {};
        for (const [varName, exprId] of Object.entries(msg.variableIds)) {
          const row = state.expressions.list.find((e) => e.id === exprId);
          if (row && typeof row.latex === "string") {
            const num = parseFloat(row.latex.split("=")[1]);
            if (!isNaN(num)) values[varName] = num;
          }
        }
        let bakedLatex = msg.finalCurveLatex;
        for (const [varName, token] of Object.entries(msg.variableLatexTokens)) {
          if (values[varName] !== undefined) {
            // Wrapped in \left(...\right): concatenation like "t{token}" relied on
            // implicit multiplication, which silently becomes subtraction if the
            // substituted literal is negative and left bare (e.g. "t-4.15").
            const wrapped = `\\left(${formatNumber(values[varName])}\\right)`;
            bakedLatex = bakedLatex.split(token).join(wrapped);
          }
        }
        calc.setExpression({ latex: bakedLatex, color: msg.color || "#2d70b3", domain: { min: "0", max: "1" } });
        calc.removeExpressions(msg.scaffoldIds.map((id) => ({ id })));
        window.postMessage({ source: "desmos-plus", type: "FINALIZE_DONE" }, "*");
      } catch (err) {
        window.postMessage({ source: "desmos-plus", type: "ERROR", message: "Finalize failed: " + String(err) }, "*");
      }
      return;
    }

    if (msg.type === "WATCH_OVAL_CENTER") {
      const calc = realCalc();
      if (!calc) {
        window.postMessage({ source: "desmos-plus", type: "ERROR", message: "No calculator instance found." }, "*");
        return;
      }
      try {
        startOvalWatcher(calc, msg);
        window.postMessage({ source: "desmos-plus", type: "WATCH_OVAL_CENTER_DONE" }, "*");
      } catch (err) {
        window.postMessage({ source: "desmos-plus", type: "ERROR", message: "Couldn't watch oval center: " + String(err) }, "*");
      }
      return;
    }

    if (msg.type === "FINALIZE_OVAL") {
      stopOvalWatcher();
      const calc = realCalc();
      if (!calc) {
        window.postMessage({ source: "desmos-plus", type: "ERROR", message: "No calculator instance found." }, "*");
        return;
      }
      try {
        const state = calc.getState();
        const readVal = (id) => {
          const row = state.expressions.list.find((e) => e.id === id);
          if (!row || typeof row.latex !== "string") return null;
          const num = parseFloat(row.latex.split("=")[1]);
          return isNaN(num) ? null : num;
        };
        const ids = msg.handleVariableIds;
        const cx = readVal(ids.cx), cy = readVal(ids.cy);
        const rx = readVal(ids.rx), ry = readVal(ids.ry);
        const wx = readVal(ids.wx), wy = readVal(ids.wy);
        const hx = readVal(ids.hx), hy = readVal(ids.hy);
        if ([cx, cy, rx, ry, wx, wy, hx, hy].some((v) => v === null)) {
          throw new Error("couldn't read one or more handle positions");
        }

        // Same math as the live preview formula, recomputed here in JS so we
        // can bake literal numbers rather than relying on Desmos to hand us
        // an already-evaluated value for a derived (formula-defined) variable.
        const drx = rx - cx, dry = ry - cy;
        const dist = Math.sqrt(drx * drx + dry * dry);
        const cosL = drx / dist, sinL = -dry / dist; // verified sign — see templates.js buildOvalTemplate

        // Plain distance to center — deliberately NOT a projection onto the
        // rotation axis, so rotating is geometrically incapable of changing
        // a or b (distance doesn't care about angle).
        const a = Math.sqrt((wx - cx) ** 2 + (wy - cy) ** 2);
        const b = Math.sqrt((hx - cx) ** 2 + (hy - cy) ** 2);

        // h,k aren't simply (cx,cy) — the source equation has an asymmetric
        // sign convention (+h, -k); this is the solved form (verified above).
        const h = cy * sinL - cx * cosL;
        const k = cx * sinL + cy * cosL;

        const w = (n) => `\\left(${formatNumber(n)}\\right)`;
        const bakedLatex =
          `\\left(x${w(cosL)}-y${w(sinL)}+${w(h)}\\right)^{2}/${w(a)}^{2}` +
          `+\\left(x${w(sinL)}+y${w(cosL)}-${w(k)}\\right)^{2}/${w(b)}^{2}=1`;

        calc.setExpression({ latex: bakedLatex, color: msg.color || "#2d70b3" });
        calc.removeExpressions(msg.scaffoldIds.map((id) => ({ id })));
        window.postMessage({ source: "desmos-plus", type: "FINALIZE_OVAL_DONE" }, "*");
      } catch (err) {
        window.postMessage({ source: "desmos-plus", type: "ERROR", message: "Oval finalize failed: " + String(err) }, "*");
      }
      return;
    }

    if (msg.type === "FILL_INSERT") {
      const calc = realCalc();
      if (!calc) {
        window.postMessage({ source: "desmos-plus", type: "ERROR", message: "No calculator instance found." }, "*");
        return;
      }
      try {
        calc.setExpression({ latex: msg.latex, color: msg.color || "#2d70b3" });
        window.postMessage({ source: "desmos-plus", type: "FILL_INSERT_DONE" }, "*");
      } catch (err) {
        window.postMessage({ source: "desmos-plus", type: "ERROR", message: "Fill insert failed: " + String(err) }, "*");
      }
      return;
    }

    if (msg.type === "DELETE_SCAFFOLD") {
      stopOvalWatcher();
      const calc = realCalc();
      if (!calc) {
        window.postMessage({ source: "desmos-plus", type: "ERROR", message: "No calculator instance found." }, "*");
        return;
      }
      try {
        calc.removeExpressions(msg.scaffoldIds.map((id) => ({ id })));
        window.postMessage({ source: "desmos-plus", type: "DELETE_DONE" }, "*");
      } catch (err) {
        window.postMessage({ source: "desmos-plus", type: "ERROR", message: "Delete failed: " + String(err) }, "*");
      }
      return;
    }
  });
})();
