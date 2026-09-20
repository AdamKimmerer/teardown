// Spike C content script: the in-page control surface from spine §8.3, reduced to what needs
// proving on hostile pages.
//   - host at max z-index with a CLOSED shadow root; page CSS must not reach in, ours must not leak
//   - freehand: drag a rect; it persists, is viewport-relative (fixed), and clamps to the viewport
//   - element pick: rAF-throttled hover highlight, ancestor dedupe by rect, click = pick,
//     preventDefault + stopPropagation so the pick never navigates
//   - capture: hide the UI, wait two rAF, ask the worker for a screenshot, show it as a thumbnail
//     so you can see with your own eyes whether the overlay leaked into the shot
// Running it again removes the overlay (toggle), so the action button is enough to test with.

(() => {
  if (window.__teardownSpikeC) {
    window.__teardownSpikeC.remove();
    delete window.__teardownSpikeC;
    return;
  }

  const MAX_Z = 2147483647;
  const PADDING = 8;

  // ---- host + closed shadow root -----------------------------------------------------------
  const host = document.createElement("teardown-spike");
  host.style.cssText = `all: initial; position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: ${MAX_Z};`;
  const shadow = host.attachShadow({ mode: "closed" });
  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; }
      .bar {
        position: fixed; left: 50%; bottom: 16px; transform: translateX(-50%);
        display: flex; gap: 6px; align-items: center; padding: 8px;
        background: #111; color: #fff; border-radius: 10px;
        font: 13px/1.2 system-ui, sans-serif; box-shadow: 0 4px 16px rgba(0,0,0,.4);
        pointer-events: auto; user-select: none;
      }
      button { all: initial; font: inherit; color: inherit; background: #333; padding: 6px 10px; border-radius: 6px; cursor: pointer; }
      button:hover { background: #555; } button.on { background: #2a7; }
      .status { width: 320px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; opacity: .85; }
      .thumb { height: 48px; border: 1px solid #666; display: none; }
      .glass { position: fixed; inset: 0; cursor: crosshair; pointer-events: auto; user-select: none; display: none; }
      .rect { position: fixed; border: 2px dashed #2a7; background: rgba(34,170,119,.08); pointer-events: none; display: none; }
      .hl { position: fixed; outline: 2px solid #e5a; outline-offset: 0; background: rgba(238,85,170,.10); pointer-events: none; display: none; }
    </style>
    <div class="glass"></div>
    <div class="rect"></div>
    <div class="hl"></div>
    <div class="bar">
      <button data-act="capture">Capture</button>
      <button data-act="freehand">Freehand</button>
      <button data-act="element">Element</button>
      <button data-act="clear">Clear</button>
      <span class="status">dpr ${devicePixelRatio} · ${innerWidth}×${innerHeight}</span>
      <img class="thumb" alt="last capture" />
    </div>
  `;
  document.documentElement.appendChild(host);

  const $ = (sel) => shadow.querySelector(sel);
  const status = (text) => ($(".status").textContent = text);
  const glass = $(".glass");
  const rectEl = $(".rect");
  const hl = $(".hl");
  const bar = $(".bar");

  let mode = "idle"; // idle | freehand-armed | dragging | picking
  let region = null; // { mode, rect, selectors?, tPickStart }
  let dragStart = null;
  let hoverTarget = null;
  let rafPending = false;

  // ---- freehand ----------------------------------------------------------------------------
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  function rectFromPoints(a, b) {
    const x1 = clamp(Math.min(a.x, b.x), 0, innerWidth);
    const y1 = clamp(Math.min(a.y, b.y), 0, innerHeight);
    const x2 = clamp(Math.max(a.x, b.x), 0, innerWidth);
    const y2 = clamp(Math.max(a.y, b.y), 0, innerHeight);
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }
  function drawRect(r) {
    Object.assign(rectEl.style, {
      left: r.x + "px",
      top: r.y + "px",
      width: r.w + "px",
      height: r.h + "px",
      display: "block",
    });
  }

  glass.addEventListener("mousedown", (e) => {
    if (mode !== "freehand-armed") return;
    e.preventDefault();
    dragStart = { x: e.clientX, y: e.clientY, t: performance.now() };
    mode = "dragging";
  });
  glass.addEventListener("mousemove", (e) => {
    if (mode !== "dragging") return;
    drawRect(rectFromPoints(dragStart, { x: e.clientX, y: e.clientY }));
  });
  glass.addEventListener("mouseup", (e) => {
    if (mode !== "dragging") return;
    const rect = rectFromPoints(dragStart, { x: e.clientX, y: e.clientY });
    region = { mode: "freehand", rect, tPickStart: dragStart.t };
    drawRect(rect);
    mode = "idle";
    glass.style.display = "none";
    setActive(null);
    status(
      `freehand ${Math.round(rect.w)}×${Math.round(rect.h)} @ ${Math.round(rect.x)},${Math.round(rect.y)} — scroll: it should stay put`,
    );
  });

  // ---- element pick ------------------------------------------------------------------------
  function selectorsFor(el) {
    const out = [];
    const testId = el.getAttribute("data-testid");
    if (testId) out.push(`[data-testid="${testId}"]`);
    if (el.id) out.push(`#${CSS.escape(el.id)}`);
    const role = el.getAttribute("role");
    out.push(
      role
        ? `${el.tagName.toLowerCase()}[role="${role}"]`
        : el.tagName.toLowerCase(),
    );
    return out;
  }
  // Ancestors whose bounds match the hovered element within 2 px add nothing; count how many we skip.
  function dedupedAncestorDepth(el) {
    const r = el.getBoundingClientRect();
    let depth = 0;
    let p = el.parentElement;
    while (p) {
      const pr = p.getBoundingClientRect();
      const same =
        Math.abs(pr.x - r.x) < 2 &&
        Math.abs(pr.y - r.y) < 2 &&
        Math.abs(pr.width - r.width) < 2 &&
        Math.abs(pr.height - r.height) < 2;
      if (!same) break;
      depth++;
      p = p.parentElement;
    }
    return depth;
  }
  function targetFromEvent(e) {
    // composedPath()[0] sees inside open shadow roots on the page; elementFromPoint would stop at the host.
    const t = e.composedPath()[0];
    return t instanceof Element ? t : null;
  }
  function onHover(e) {
    if (mode !== "picking") return;
    // composedPath() is only populated while the event is dispatching, so read the target now
    // and defer only the layout work (getBoundingClientRect forces reflow) to the next frame.
    const t = targetFromEvent(e);
    if (!t || t === host) return;
    hoverTarget = t;
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      const t = hoverTarget;
      const r = t.getBoundingClientRect();
      Object.assign(hl.style, {
        left: r.x - PADDING + "px",
        top: r.y - PADDING + "px",
        width: r.width + PADDING * 2 + "px",
        height: r.height + PADDING * 2 + "px",
        display: "block",
      });
      status(
        `${selectorsFor(t)[0]} · ${dedupedAncestorDepth(t)} same-rect ancestors skipped`,
      );
    });
  }
  // While picking, no press reaches the page: pointerdown/mousedown would focus or start a drag,
  // and the pick itself happens on click, which is also the event a link navigates on.
  function swallow(e) {
    if (mode !== "picking") return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
  }
  function onPickClick(e) {
    if (mode !== "picking") return;
    swallow(e);
    const t = hoverTarget ?? targetFromEvent(e);
    if (!t) return;
    const r = t.getBoundingClientRect();
    region = {
      mode: "element",
      rect: { x: r.x, y: r.y, w: r.width, h: r.height },
      selectors: selectorsFor(t),
      padding: PADDING,
    };
    drawRect({
      x: r.x - PADDING,
      y: r.y - PADDING,
      w: r.width + PADDING * 2,
      h: r.height + PADDING * 2,
    });
    stopPicking();
    status(
      `picked ${region.selectors.join(" | ")} — did the page navigate? it must not`,
    );
  }
  function onKey(e) {
    if (e.key === "Escape" && mode !== "idle") {
      e.preventDefault();
      e.stopPropagation();
      stopPicking();
      glass.style.display = "none";
      mode = "idle";
      setActive(null);
      status("cancelled");
    }
  }
  const SWALLOWED = [
    "pointerdown",
    "mousedown",
    "pointerup",
    "mouseup",
    "auxclick",
  ];
  function startPicking() {
    mode = "picking";
    document.addEventListener("mousemove", onHover, true);
    for (const type of SWALLOWED)
      document.addEventListener(type, swallow, true);
    document.addEventListener("click", onPickClick, true);
    status("hover to preview, click to pick, Esc to cancel");
  }
  function stopPicking() {
    document.removeEventListener("mousemove", onHover, true);
    for (const type of SWALLOWED)
      document.removeEventListener(type, swallow, true);
    document.removeEventListener("click", onPickClick, true);
    hl.style.display = "none";
    mode = "idle";
    setActive(null);
  }
  document.addEventListener("keydown", onKey, true);

  // ---- capture: hide, wait two frames, shoot, show ------------------------------------------
  const twoFrames = () =>
    new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  async function capture() {
    const t0 = performance.now();
    host.style.visibility = "hidden"; // :host visibility hides everything in the shadow tree
    await twoFrames();
    const hiddenMs = Math.round(performance.now() - t0);
    const res = await chrome.runtime.sendMessage({ type: "CAPTURE_TEST" });
    host.style.visibility = "";
    if (!res.ok) return status(`capture failed: ${res.error}`);
    const img = $(".thumb");
    img.src = res.dataUrl;
    img.style.display = "block";
    const meta = {
      region: region ?? { mode: "viewport" },
      dpr: devicePixelRatio,
      viewport: { w: innerWidth, h: innerHeight },
      url: location.href,
      title: document.title,
    };
    console.log("[teardown spike C] capture record", meta);
    status(
      `shot after ${hiddenMs} ms hidden — is the toolbar in the thumbnail? (it must not be)`,
    );
  }

  // ---- toolbar -----------------------------------------------------------------------------
  function setActive(act) {
    bar
      .querySelectorAll("button")
      .forEach((b) => b.classList.toggle("on", b.dataset.act === act));
  }
  bar.addEventListener("click", (e) => {
    const act = e.target.closest("button")?.dataset.act;
    if (!act) return;
    if (act === "capture") capture();
    if (act === "freehand") {
      stopPicking();
      mode = "freehand-armed";
      glass.style.display = "block";
      setActive("freehand");
      status("drag a rectangle");
    }
    if (act === "element") {
      glass.style.display = "none";
      startPicking();
      setActive("element");
    }
    if (act === "clear") {
      stopPicking();
      glass.style.display = "none";
      rectEl.style.display = "none";
      region = null;
      status(`cleared · dpr ${devicePixelRatio}`);
    }
  });

  window.__teardownSpikeC = host;
  status(`ready · dpr ${devicePixelRatio} · ${innerWidth}×${innerHeight}`);
})();
