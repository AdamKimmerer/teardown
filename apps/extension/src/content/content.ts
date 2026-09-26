import { sessionElapsedMs } from "@teardown/core/clock";
import type { Rect, Region } from "@teardown/core/schemas/capture";
import type { Message } from "../shared/messages.js";

// The in-page controls (spine §4, §8.3): a small toolbar in a closed shadow root at max
// z-index, a persistent freehand region, and the capture gesture. Injected on demand by the
// service worker. Shows itself only while a session is recording, by watching the session in
// chrome.storage (see "visibility" below). Hides itself and waits two frames before every
// capture so it is never in the shot (spike C).
//
// This is the one runtime that does not parse messages with Zod: Zod alone is 450 KB minified,
// and this script is injected into pages the user is recording. It receives exactly two message
// shapes from the service worker, checked by hand below; everything it sends is parsed with Zod
// on the worker's side.

type InboundMessage = Extract<Message, { type: "PING" | "TRIGGER_CAPTURE" }>;

function inboundMessage(raw: unknown): InboundMessage | null {
  if (typeof raw !== "object" || raw === null || !("type" in raw)) return null;
  const type = (raw as { type: unknown }).type;
  if (type === "PING" || type === "TRIGGER_CAPTURE") return { type };
  return null;
}

async function sendMessage(message: Message): Promise<unknown> {
  try {
    return await chrome.runtime.sendMessage(message);
  } catch {
    return undefined;
  }
}

(() => {
  if (window.__teardownControls) return; // already injected; the listeners below are live
  window.__teardownControls = true;

  const MAX_Z = 2147483647;

  // ---- shadow host and markup ---------------------------------------------------------------
  const host = document.createElement("teardown-controls");
  host.style.cssText = `all: initial; position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: ${MAX_Z}; display: none;`;
  const shadow = host.attachShadow({ mode: "closed" });
  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; }
      .bar {
        position: fixed; left: 50%; bottom: 16px; transform: translateX(-50%);
        display: flex; gap: 6px; align-items: center; padding: 8px 10px;
        background: #111; color: #fff; border-radius: 12px;
        font: 13px/1.2 system-ui, sans-serif; box-shadow: 0 4px 16px rgba(0,0,0,.4);
        pointer-events: auto; user-select: none;
      }
      .dot { width: 8px; height: 8px; border-radius: 50%; background: #e33; animation: pulse 1.6s infinite; }
      @keyframes pulse { 50% { opacity: .35; } }
      button { all: initial; font: inherit; color: inherit; background: #333; padding: 7px 11px; border-radius: 8px; cursor: pointer; }
      button:hover { background: #555; }
      button.primary { background: #2a7; font-weight: 600; }
      button.primary:hover { background: #3b8; }
      button.on { background: #2a7; }
      .hint { opacity: .7; min-width: 120px; }
      .glass { position: fixed; inset: 0; cursor: crosshair; pointer-events: auto; user-select: none; display: none; }
      .rect { position: fixed; border: 2px dashed #2a7; background: rgba(34,170,119,.08); pointer-events: none; display: none; }
    </style>
    <div class="glass"></div>
    <div class="rect"></div>
    <div class="bar">
      <span class="dot" title="Teardown is recording"></span>
      <button class="primary" data-act="capture">Capture</button>
      <button data-act="freehand">Region</button>
      <button data-act="clear" hidden>Clear</button>
      <span class="hint">⌘⇧S captures</span>
    </div>
  `;
  document.documentElement.appendChild(host);

  const $ = <T extends Element>(sel: string) => shadow.querySelector(sel) as T;
  const glass = $<HTMLDivElement>(".glass");
  const rectEl = $<HTMLDivElement>(".rect");
  const hint = $<HTMLSpanElement>(".hint");
  const clearButton = $<HTMLButtonElement>('[data-act="clear"]');
  const freehandButton = $<HTMLButtonElement>('[data-act="freehand"]');

  // ---- state --------------------------------------------------------------------------------
  let recording = false;
  let capturing = false;
  let mode: "idle" | "armed" | "dragging" = "idle";
  let region: Rect | null = null;
  let regionDrawnAtMs: number | null = null; // session clock; becomes tPickStart for the next capture
  let dragStart: { x: number; y: number } | null = null;

  // ---- session clock (spine §8.4): same epoch as every other runtime -------------------------
  async function sessionNowMs(): Promise<number> {
    const { startedAt, pausedMs } = await chrome.storage.session.get([
      "startedAt",
      "pausedMs",
    ]);
    if (typeof startedAt !== "number") throw new Error("no session clock");
    return sessionElapsedMs(
      startedAt,
      typeof pausedMs === "number" ? pausedMs : 0,
    );
  }

  // ---- freehand region ----------------------------------------------------------------------
  const clamp = (v: number, lo: number, hi: number) =>
    Math.min(hi, Math.max(lo, v));
  function rectFromPoints(
    a: { x: number; y: number },
    b: { x: number; y: number },
  ): Rect {
    const x1 = clamp(Math.min(a.x, b.x), 0, innerWidth);
    const y1 = clamp(Math.min(a.y, b.y), 0, innerHeight);
    const x2 = clamp(Math.max(a.x, b.x), 0, innerWidth);
    const y2 = clamp(Math.max(a.y, b.y), 0, innerHeight);
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }
  function drawRect(r: Rect): void {
    Object.assign(rectEl.style, {
      left: `${r.x}px`,
      top: `${r.y}px`,
      width: `${r.w}px`,
      height: `${r.h}px`,
      display: "block",
    });
  }
  function armFreehand(): void {
    mode = "armed";
    glass.style.display = "block";
    freehandButton.classList.add("on");
    hint.textContent = "drag a region";
  }
  function disarm(): void {
    mode = "idle";
    glass.style.display = "none";
    freehandButton.classList.remove("on");
    hint.textContent = region ? "region set · ⌘⇧S" : "⌘⇧S captures";
  }
  function clearRegion(): void {
    region = null;
    regionDrawnAtMs = null;
    rectEl.style.display = "none";
    clearButton.hidden = true;
    disarm();
  }

  glass.addEventListener("mousedown", (e) => {
    if (mode !== "armed") return;
    e.preventDefault();
    dragStart = { x: e.clientX, y: e.clientY };
    mode = "dragging";
    void sessionNowMs().then((t) => (regionDrawnAtMs = t));
  });
  glass.addEventListener("mousemove", (e) => {
    if (mode !== "dragging" || !dragStart) return;
    drawRect(rectFromPoints(dragStart, { x: e.clientX, y: e.clientY }));
  });
  glass.addEventListener("mouseup", (e) => {
    if (mode !== "dragging" || !dragStart) return;
    const r = rectFromPoints(dragStart, { x: e.clientX, y: e.clientY });
    if (r.w < 8 || r.h < 8) return clearRegion(); // a click, not a drag
    region = r;
    drawRect(r);
    clearButton.hidden = false;
    disarm();
  });
  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Escape" && mode !== "idle") {
        e.preventDefault();
        e.stopPropagation();
        disarm();
      }
    },
    true,
  );

  // ---- capture: hide, wait two frames, ask the worker, show ---------------------------------
  const twoFrames = () =>
    new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  async function capture(): Promise<void> {
    if (capturing || !recording) return;
    capturing = true;
    try {
      const tCapture = await sessionNowMs();
      const currentRegion: Region = region
        ? { mode: "freehand", rect: region, selectors: [], padding: 0 }
        : { mode: "viewport", selectors: [], padding: 0 };
      const tPickStart = regionDrawnAtMs ?? tCapture;
      regionDrawnAtMs = null;

      host.style.display = "none";
      await twoFrames();
      await sendMessage({
        type: "CAPTURE_REQUEST",
        region: currentRegion,
        viewport: { w: innerWidth, h: innerHeight, dpr: devicePixelRatio },
        tPickStart,
        tCapture,
        url: location.href,
        pageTitle: document.title,
      });
    } finally {
      host.style.display = recording ? "" : "none";
      capturing = false;
      flash();
    }
  }

  function flash(): void {
    hint.textContent = "captured";
    setTimeout(
      () => (hint.textContent = region ? "region set · ⌘⇧S" : "⌘⇧S captures"),
      1200,
    );
  }

  $<HTMLDivElement>(".bar").addEventListener("click", (e) => {
    const act = (e.target as HTMLElement).closest("button")?.dataset.act;
    if (act === "capture") void capture();
    if (act === "freehand") {
      if (mode === "armed") disarm();
      else armFreehand();
    }
    if (act === "clear") clearRegion();
  });

  // ---- visibility follows the session in storage ---------------------------------------------
  // Nobody messages tabs to hide the controls: Chrome freezes background tabs and a frozen tab
  // may never answer, which once left Stop and Discard waiting forever. A storage change reaches
  // a frozen tab when it wakes, and the tab also re-checks whenever it becomes visible.
  async function syncVisibility(): Promise<void> {
    const { session } = await chrome.storage.local.get("session");
    recording =
      (session as { status?: string } | undefined)?.status === "recording";
    if (!capturing) host.style.display = recording ? "" : "none";
    if (!recording) clearRegion();
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && "session" in changes) void syncVisibility();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void syncVisibility();
  });
  void syncVisibility();

  // PING: "are the controls in this tab?" (the worker injects them if not). TRIGGER_CAPTURE: ⌘⇧S.
  chrome.runtime.onMessage.addListener((raw, _sender, sendResponse) => {
    const message = inboundMessage(raw);
    if (message === null) return false;
    if (message.type === "TRIGGER_CAPTURE") void capture();
    sendResponse({ ok: true });
    return false;
  });
})();

declare global {
  interface Window {
    __teardownControls?: boolean;
  }
}
