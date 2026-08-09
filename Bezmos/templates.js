// Generates Bezier construction templates using de Casteljau's algorithm —
// same pattern as the user's hand-built cubic graph (desmos.com/calculator/pbbfors4rn).
// Verified to reproduce that graph's exact formulas for n=4.

const LEVEL_COLORS = ["#fa7e19", "#388c46", "#2d70b3", "#6042a6", "#c74440"]; // control, then guide levels 1-4
const FINAL_COLOR = "#000000";

function buildBezierTemplate(n, name) {
  const list = [];
  let idCounter = 1;
  const nextId = () => String(idCounter++);

  const folderId = nextId();
  list.push({ type: "folder", id: folderId, title: `${name} curve` });

  const pushPointRow = (latex, color) => {
    const id = nextId();
    list.push({
      type: "expression",
      id,
      folderId,
      color,
      latex,
      labelSize: "1",
      parametricDomain: { min: "0", max: "1" },
      fillOpacity: "0.4",
      domain: { min: "0", max: "1" },
    });
    return id;
  };

  const controlPointIds = [];
  const guideIds = [];

  // Level 0: raw control points (draggable)
  let curLevel = [];
  for (let i = 0; i < n; i++) {
    const id = pushPointRow(`\\left(x_${i},y_${i}\\right)`, LEVEL_COLORS[0]);
    controlPointIds.push(id);
    curLevel.push({ x: `x_${i}`, y: `y_${i}`, simple: true });
  }

  // Levels 1..n-1: recursive linear interpolation (de Casteljau)
  let finalCurveId = null;
  let finalCurveLatex = null;
  for (let k = 1; k < n; k++) {
    const isFinal = k === n - 1;
    const color = isFinal ? FINAL_COLOR : LEVEL_COLORS[k] || LEVEL_COLORS[LEVEL_COLORS.length - 1];
    const nextLevel = [];
    for (let i = 0; i < curLevel.length - 1; i++) {
      const a = curLevel[i];
      const b = curLevel[i + 1];
      const ax = a.simple ? a.x : `\\left(${a.x}\\right)`;
      const bx = b.simple ? b.x : `\\left(${b.x}\\right)`;
      const ay = a.simple ? a.y : `\\left(${a.y}\\right)`;
      const by = b.simple ? b.y : `\\left(${b.y}\\right)`;
      const xExpr = `\\left(1-t\\right)${ax}+t${bx}`;
      const yExpr = `\\left(1-t\\right)${ay}+t${by}`;
      const id = pushPointRow(`\\left(${xExpr},${yExpr}\\right)`, color);
      nextLevel.push({ x: xExpr, y: yExpr, simple: false });
      if (isFinal) {
        finalCurveId = id;
        finalCurveLatex = `\\left(${xExpr},${yExpr}\\right)`;
      } else {
        guideIds.push(id);
      }
    }
    curLevel = nextLevel;
  }

  // Live value rows — these back the draggable points; read these at commit time.
  const variableIds = {};
  for (let i = 0; i < n; i++) {
    const xId = nextId();
    list.push({ type: "expression", id: xId, folderId, latex: `x_${i}=0` });
    variableIds[`x_${i}`] = xId;

    const yId = nextId();
    list.push({ type: "expression", id: yId, folderId, latex: `y_${i}=0` });
    variableIds[`y_${i}`] = yId;
  }

  return {
    name,
    numPoints: n,
    state: {
      version: 11,
      graph: { viewport: { xmin: -10, ymin: -10, xmax: 10, ymax: 10 } },
      expressions: { list },
    },
    finalCurveId,
    finalCurveLatex,
    variableIds,
    controlPointIds, // level-0 draggable points — always inserted
    guideIds,        // intermediate construction points — skippable via "hide guides"
  };
}

// Polygon: N raw points, no interpolation — the final expression is Desmos's
// native polygon() call, which fills automatically. Same return shape as
// buildBezierTemplate so it plugs into the exact same insert/commit logic.
function buildPolygonTemplate(n) {
  const list = [];
  let idCounter = 1;
  const nextId = () => String(idCounter++);
  const controlPointIds = [];

  for (let i = 0; i < n; i++) {
    const id = nextId();
    list.push({ type: "expression", id, color: "#fa7e19", latex: `\\left(x_${i},y_${i}\\right)` });
    controlPointIds.push(id);
  }

  const pointsList = Array.from({ length: n }, (_, i) => `\\left(x_${i},y_${i}\\right)`).join(",");
  const finalCurveLatex = `\\operatorname{polygon}\\left(${pointsList}\\right)`;
  const finalCurveId = nextId();
  list.push({ type: "expression", id: finalCurveId, color: "#2d70b3", latex: finalCurveLatex, fillOpacity: "0.4" });

  const variableIds = {};
  for (let i = 0; i < n; i++) {
    const xId = nextId();
    list.push({ type: "expression", id: xId, latex: `x_${i}=0` });
    variableIds[`x_${i}`] = xId;
    const yId = nextId();
    list.push({ type: "expression", id: yId, latex: `y_${i}=0` });
    variableIds[`y_${i}`] = yId;
  }

  return {
    name: `${n}-gon`,
    numPoints: n,
    state: { version: 11, graph: { viewport: { xmin: -10, ymin: -10, xmax: 10, ymax: 10 } }, expressions: { list } },
    finalCurveId,
    finalCurveLatex,
    variableIds,
    controlPointIds,
    guideIds: [],
  };
}

// Oval: 4 independently-draggable (x,y) points — center, rotate, width,
// height — same proven mechanism as every other point in this project.
// (A previous version tried defining rotate/width/height from a single
// solved parameter instead, since Desmos supports dragging points defined
// that way; it turned out unreliable once the point's formula also
// referenced the center's x_c/y_c — Desmos ended up adjusting x_c/y_c
// instead of the intended parameter. Reverted rather than re-guess at it.)
// Width/height use raw DISTANCE to center (not a projection onto the
// rotation axis) specifically so rotating is geometrically incapable of
// changing them — distance doesn't care about angle.
function buildOvalTemplate() {
  const list = [];
  let idCounter = 1;
  const nextId = () => String(idCounter++);

  function pushPoint(nameX, nameY, color) {
    const ptId = nextId();
    list.push({ type: "expression", id: ptId, color, latex: `\\left(${nameX},${nameY}\\right)` });
    const xId = nextId();
    list.push({ type: "expression", id: xId, latex: `${nameX}=0` });
    const yId = nextId();
    list.push({ type: "expression", id: yId, latex: `${nameY}=0` });
    return { ptId, xId, yId };
  }

  const center = pushPoint("x_{c}", "y_{c}", "#388c46"); // green
  const rotate = pushPoint("x_{r}", "y_{r}", "#6042a6"); // purple — angle only, distance ignored
  const width = pushPoint("x_{w}", "y_{w}", "#fa7e19");  // orange — distance to center = a
  const height = pushPoint("x_{h}", "y_{h}", "#c74440"); // red — distance to center = b
  const controlPointIds = [center.ptId, rotate.ptId, width.ptId, height.ptId];

  // Visual guide lines, center -> each handle (safe to hide via "hide guides")
  const guideIds = [];
  function pushGuide(nameX, nameY) {
    const id = nextId();
    list.push({
      type: "expression", id, color: "#999999",
      latex: `\\left(\\left(1-t\\right)x_{c}+t\\,${nameX},\\left(1-t\\right)y_{c}+t\\,${nameY}\\right)`,
      domain: { min: "0", max: "1" }, parametricDomain: { min: "0", max: "1" },
    });
    guideIds.push(id);
  }
  pushGuide("x_{r}", "y_{r}");
  pushGuide("x_{w}", "y_{w}");
  pushGuide("x_{h}", "y_{h}");

  // Derived quantities feeding the LIVE preview — not hideable, the preview
  // formula depends on these existing.
  const derivedIds = [];
  const push = (latex) => {
    const id = nextId();
    list.push({ type: "expression", id, latex });
    derivedIds.push(id);
    return id;
  };
  push("d_{rx}=x_{r}-x_{c}");
  push("d_{ry}=y_{r}-y_{c}");
  push("d_{rr}=\\sqrt{d_{rx}^{2}+d_{ry}^{2}}");
  push("c_{L}=\\frac{d_{rx}}{d_{rr}}");
  push("s_{L}=-\\frac{d_{ry}}{d_{rr}}"); // verified sign — see FINALIZE_OVAL in inject.js
  push("a_{v}=\\sqrt{\\left(x_{w}-x_{c}\\right)^{2}+\\left(y_{w}-y_{c}\\right)^{2}}"); // plain distance, rotation-invariant
  push("b_{v}=\\sqrt{\\left(x_{h}-x_{c}\\right)^{2}+\\left(y_{h}-y_{c}\\right)^{2}}"); // plain distance, rotation-invariant
  push("h_{v}=y_{c}s_{L}-x_{c}c_{L}");
  push("k_{v}=x_{c}s_{L}+y_{c}c_{L}");

  const ovalLatex =
    "\\left(x\\cdot c_{L}-y\\cdot s_{L}+h_{v}\\right)^{2}/a_{v}^{2}+\\left(x\\cdot s_{L}+y\\cdot c_{L}-k_{v}\\right)^{2}/b_{v}^{2}=1";
  const ovalId = nextId();
  list.push({ type: "expression", id: ovalId, color: "#2d70b3", latex: ovalLatex });

  return {
    name: "Oval",
    state: { version: 11, graph: { viewport: { xmin: -10, ymin: -10, xmax: 10, ymax: 10 } }, expressions: { list } },

    ovalId,
    controlPointIds,
    guideIds,       // guide lines only — safe to hide
    derivedIds,     // always inserted, never hidden, always deleted at commit/cancel
    handleVariableIds: {
      cx: center.xId, cy: center.yId,
      rx: rotate.xId, ry: rotate.yId,
      wx: width.xId, wy: width.yId,
      hx: height.xId, hy: height.yId,
    },
  };
}

window.__desmosPlusBuildPolygon = buildPolygonTemplate;
window.__desmosPlusBuildOval = buildOvalTemplate;
window.__desmosPlusBuildBezier = buildBezierTemplate;

const TEMPLATES = {
  line: buildBezierTemplate(2, "Line"),
  quadratic: buildBezierTemplate(3, "Quadratic"),
  cubic: buildBezierTemplate(4, "Cubic"),
  quintic: buildBezierTemplate(5, "Quintic"),
  sextic: buildBezierTemplate(6, "Sextic"),
};

window.__desmosPlusTemplates = TEMPLATES;
