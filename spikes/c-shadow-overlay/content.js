// Spike C content script: the in-page control surface from spine §8.3, reduced to what needs
// proving on hostile pages. v1 has two capture modes, viewport and freehand (element pick was
// dropped after the first run of this spike; see docs/decisions.md).
//   - host at max z-index with a CLOSED shadow root; page CSS must not reach in, ours must not leak
//   - freehand: drag a rect; it persists, is viewport-relative (fixed), and clamps to the viewport
//   - capture: hide the UI (display: none), wait two frames plus a chosen delay, ask the worker
//     for a screenshot, then show the shot — cropped to the freehand rect × dpr when one is set —
//     as a thumbnail, so you can see whether the overlay leaked into the shot and whether the
//     crop math lands where you drew
// Running it again removes the overlay (toggle), so the action button is enough to test with.

(() => {
  if (window.__teardownSpikeC) {
    window.__teardownSpikeC.remove();
    delete window.__teardownSpikeC;
    return;
  }

  const MAX_Z = 2147483647;

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
      select { font: inherit; color: inherit; background: #333; border: 0; border-radius: 6px; padding: 5px 6px; }
      .status { width: 300px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; opacity: .85; }
      .thumb { height: 56px; border: 1px solid #666; display: none; }
      .glass { position: fixed; inset: 0; cursor: crosshair; pointer-events: auto; user-select: none; display: none; }
      .rect { position: fixed; border: 2px dashed #2a7; background: rgba(34,170,119,.08); pointer-events: none; display: none; }
    </style>
    <div class="glass"></div>
    <div class="rect"></div>
    <div class="bar">
      <button data-act="capture">Capture</button>
      <button data-act="freehand">Freehand</button>
      <button data-act="clear">Clear</button>
      <select class="delay" title="extra wait after hiding, before the shot">
        <option value="0">+0 ms</option>
        <option value="50" selected>+50 ms</option>
        <option value="150">+150 ms</option>
        <option value="300">+300 ms</option>
      </select>
      <span class="status">dpr ${devicePixelRatio} · ${innerWidth}×${innerHeight}</span>
      <img class="thumb" alt="last capture" />
    </div>
  `;
  document.documentElement.appendChild(host);

  const $ = (sel) => shadow.querySelector(sel);
  const status = (text) => ($(".status").textContent = text);
  const glass = $(".glass");
  const rectEl = $(".rect");
  const bar = $(".bar");

  let mode = "idle"; // idle | freehand-armed | dragging
  let region = null; // { mode: "freehand", rect, tPickStart } or null for viewport
  let dragStart = null;

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
  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Escape" && mode !== "idle") {
        e.preventDefault();
        e.stopPropagation();
        glass.style.display = "none";
        mode = "idle";
        setActive(null);
        status("cancelled");
      }
    },
    true,
  );

  // ---- capture: hide, wait, shoot, show (cropped if a region is set) -----------------------
  const twoFrames = () =>
    new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Same arithmetic as core/crop.ts: CSS rect × dpr, rounded outward, clamped to the image.
  function cropRectInPixels(rect, dpr, bounds) {
    const left = Math.max(0, Math.floor(rect.x * dpr));
    const top = Math.max(0, Math.floor(rect.y * dpr));
    const right = Math.min(bounds.w, Math.ceil((rect.x + rect.w) * dpr));
    const bottom = Math.min(bounds.h, Math.ceil((rect.y + rect.h) * dpr));
    return { x: left, y: top, w: right - left, h: bottom - top };
  }
  async function cropDataUrl(dataUrl, rect, dpr) {
    const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob());
    const px = cropRectInPixels(rect, dpr, {
      w: bitmap.width,
      h: bitmap.height,
    });
    const canvas = document.createElement("canvas");
    canvas.width = px.w;
    canvas.height = px.h;
    canvas
      .getContext("2d")
      .drawImage(bitmap, px.x, px.y, px.w, px.h, 0, 0, px.w, px.h);
    const original = { w: bitmap.width, h: bitmap.height };
    bitmap.close();
    return { dataUrl: canvas.toDataURL("image/png"), px, original };
  }

  async function capture() {
    const extraMs = Number($(".delay").value);
    const dpr = devicePixelRatio;
    const t0 = performance.now();
    host.style.display = "none"; // out of layout and paint entirely, not just invisible
    await twoFrames();
    await sleep(extraMs);
    const hiddenMs = Math.round(performance.now() - t0);
    const res = await chrome.runtime.sendMessage({ type: "CAPTURE_TEST" });
    host.style.display = "";
    if (!res.ok) return status(`capture failed: ${res.error}`);

    const img = $(".thumb");
    let note = `full ${hiddenMs} ms hidden`;
    if (region?.mode === "freehand") {
      const crop = await cropDataUrl(res.dataUrl, region.rect, dpr);
      img.src = crop.dataUrl;
      note = `crop ${crop.px.w}×${crop.px.h}px @ ${crop.px.x},${crop.px.y} of ${crop.original.w}×${crop.original.h} · ${hiddenMs} ms hidden`;
    } else {
      img.src = res.dataUrl;
    }
    img.style.display = "block";
    console.log("[teardown spike C] capture", {
      region: region ?? { mode: "viewport" },
      dpr,
      viewport: { w: innerWidth, h: innerHeight },
      url: location.href,
      hiddenMs,
      extraMs,
    });
    status(`${note} — toolbar in the thumbnail? it must not be`);
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
      mode = "freehand-armed";
      glass.style.display = "block";
      setActive("freehand");
      status("drag a rectangle");
    }
    if (act === "clear") {
      glass.style.display = "none";
      rectEl.style.display = "none";
      region = null;
      mode = "idle";
      setActive(null);
      status(`cleared · dpr ${devicePixelRatio}`);
    }
  });

  window.__teardownSpikeC = host;
  status(`ready · dpr ${devicePixelRatio} · ${innerWidth}×${innerHeight}`);
})();
