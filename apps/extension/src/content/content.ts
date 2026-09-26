import { sessionElapsedMs } from "@teardown/core/clock";
import type { Region } from "@teardown/core/schemas/capture";
import type { Message } from "../shared/messages.js";
import { CONTROLS_HTML } from "./markup.js";
import { createRegionEditor } from "./regionEditor.js";

// The in-page controls (spine §4, §8.3): a toolbar in a closed shadow root at max z-index, the
// persistent freehand region (regionEditor.ts), and the capture gesture. Injected on demand by
// the service worker. Shows itself only while a session is recording, by watching the session in
// chrome.storage. Hides itself and waits two frames before every capture so it is never in the
// shot (spike C).
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

// The session clock (spine §8.4): the same epoch every other runtime reads.
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

(() => {
  if (window.__teardownControls) return; // already injected; the listeners below are live
  window.__teardownControls = true;

  const host = document.createElement("teardown-controls");
  host.style.cssText =
    "all: initial; position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: 2147483647; display: none;";
  const shadow = host.attachShadow({ mode: "closed" });
  shadow.innerHTML = CONTROLS_HTML;
  document.documentElement.appendChild(host);

  const hint = shadow.querySelector(".hint") as HTMLSpanElement;
  const clearButton = shadow.querySelector(
    '[data-act="clear"]',
  ) as HTMLButtonElement;
  const regionButton = shadow.querySelector(
    '[data-act="freehand"]',
  ) as HTMLButtonElement;
  const restingHint = () =>
    editor.region() ? "region set · ⌘⇧S" : "⌘⇧S captures";

  const editor = createRegionEditor(
    shadow,
    sessionNowMs,
    ({ hasRegion, armed }) => {
      clearButton.hidden = !hasRegion;
      regionButton.classList.toggle("on", armed);
      hint.textContent = armed ? "drag a region" : restingHint();
    },
  );

  let recording = false;
  let capturing = false;

  // ---- capture: hide, wait two frames, ask the worker, show ---------------------------------
  const twoFrames = () =>
    new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  async function capture(): Promise<void> {
    if (capturing || !recording) return;
    capturing = true;
    try {
      const tCapture = await sessionNowMs();
      const rect = editor.region();
      const region: Region = rect
        ? { mode: "freehand", rect, selectors: [], padding: 0 }
        : { mode: "viewport", selectors: [], padding: 0 };
      const tPickStart = editor.takePickStart() ?? tCapture;

      host.style.display = "none";
      await twoFrames();
      await sendMessage({
        type: "CAPTURE_REQUEST",
        region,
        viewport: { w: innerWidth, h: innerHeight, dpr: devicePixelRatio },
        tPickStart,
        tCapture,
        url: location.href,
        pageTitle: document.title,
      });
    } finally {
      host.style.display = recording ? "" : "none";
      capturing = false;
      hint.textContent = "captured";
      setTimeout(() => (hint.textContent = restingHint()), 1200);
    }
  }

  (shadow.querySelector(".bar") as HTMLDivElement).addEventListener(
    "click",
    (e) => {
      const act = (e.target as HTMLElement).closest("button")?.dataset.act;
      if (act === "capture") void capture();
      if (act === "freehand") {
        if (editor.isArmed()) editor.disarm();
        else editor.arm();
      }
      if (act === "clear") editor.clear();
    },
  );

  // ---- visibility follows the session in storage ---------------------------------------------
  // Nobody messages tabs to hide the controls: Chrome freezes background tabs and a frozen tab
  // may never answer. A storage change reaches a frozen tab when it wakes, and the tab also
  // re-checks whenever it becomes visible (docs/decisions.md #50).
  async function syncVisibility(): Promise<void> {
    const { session } = await chrome.storage.local.get("session");
    recording =
      (session as { status?: string } | undefined)?.status === "recording";
    if (!capturing) host.style.display = recording ? "" : "none";
    if (!recording) editor.clear();
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
