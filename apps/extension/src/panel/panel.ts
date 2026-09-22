import type { SessionSummaryResponse } from "@teardown/core/api-contract";
import {
  WORDS_FOR_FULL_TEARDOWN,
  WORDS_FOR_SOLID_DOCUMENT,
} from "../shared/constants.js";
import { parseMessage, sendMessage, type Message } from "../shared/messages.js";
import type { PanelState } from "../shared/panelState.js";
import { forgetThumbnail, renderFilmstrip } from "./filmstrip.js";

// The side panel: a view of the session, nothing more (spine §4). It holds no state of its own;
// it asks the service worker for PanelState on open and after every STATE_CHANGED, and reads
// the filmstrip straight from IndexedDB.

const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const button = (id: string) => $<HTMLButtonElement>(id);

type WorkerReply<T> = { ok: true; result: T } | { ok: false; error: string };

// Sends a message the worker answers and unwraps its { ok, result | error } reply.
async function ask<T = void>(message: Message): Promise<T> {
  const reply = (await sendMessage(message)) as WorkerReply<T> | undefined;
  if (reply === undefined)
    throw new Error("The extension's background worker did not answer");
  if (!reply.ok) throw new Error(reply.error);
  return reply.result;
}

// ---- rendering ----------------------------------------------------------------------------------

const views = [
  "view-signed-out",
  "view-idle",
  "view-recording",
  "view-review",
] as const;

function show(view: (typeof views)[number]): void {
  for (const id of views) $(id).hidden = id !== view;
}

async function render(): Promise<void> {
  const state = await ask<PanelState>({ type: "GET_STATE" });
  $("account").innerHTML = state.signedIn
    ? `${state.email ?? ""} <button id="sign-out">sign out</button>`
    : "";
  document
    .getElementById("sign-out")
    ?.addEventListener("click", () => run(() => ask({ type: "SIGN_OUT" })));

  if (!state.signedIn) return show("view-signed-out");
  if (state.session === null) {
    show("view-idle");
    await renderIdle();
  } else if (state.session.status === "recording") {
    show("view-recording");
    await renderFilmstrip($("strip-recording"), deleteCapture);
  } else {
    show("view-review");
    await renderFilmstrip($("strip-review"), deleteCapture);
    void pollSummary();
  }
}

async function renderIdle(): Promise<void> {
  const granted = await micGranted();
  $("mic-setup").hidden = granted;
  $<HTMLButtonElement>("start").disabled = !granted;
  await listMicrophones();
}

async function micGranted(): Promise<boolean> {
  try {
    const status = await navigator.permissions.query({
      name: "microphone" as PermissionName,
    });
    return status.state === "granted";
  } catch {
    return false;
  }
}

async function listMicrophones(): Promise<void> {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const mics = devices.filter(
    (d) => d.kind === "audioinput" && d.deviceId !== "default",
  );
  const select = $<HTMLSelectElement>("device");
  const current = select.value;
  select.innerHTML = `<option value="">System default</option>`;
  for (const mic of mics) {
    const option = document.createElement("option");
    option.value = mic.deviceId;
    option.textContent = mic.label || "Microphone";
    select.appendChild(option);
  }
  select.value = current;
}

// The quality read (spine §7): the one place a length signal changes a decision. Polls for a
// while because the last chunk may still be transcribing.
let summaryPoll: ReturnType<typeof setInterval> | null = null;

function pollSummary(): void {
  if (summaryPoll !== null) clearInterval(summaryPoll);
  let previous = -1;
  let stable = 0;
  const tick = async () => {
    if ($("view-review").hidden) return stopPoll();
    try {
      const summary = await ask<SessionSummaryResponse>({
        type: "GET_SUMMARY",
      });
      $("read").textContent = qualityRead(summary);
      stable = summary.wordCount === previous ? stable + 1 : 0;
      previous = summary.wordCount;
      if (stable >= 3) stopPoll();
    } catch (err) {
      $("read").textContent = (err as Error).message;
    }
  };
  const stopPoll = () => {
    if (summaryPoll !== null) clearInterval(summaryPoll);
    summaryPoll = null;
  };
  void tick();
  summaryPoll = setInterval(tick, 3000);
}

function qualityRead({
  captureCount,
  wordCount,
}: SessionSummaryResponse): string {
  const captures = `${captureCount} capture${captureCount === 1 ? "" : "s"}`;
  const words = `about ${Math.max(50, Math.round(wordCount / 50) * 50).toLocaleString()} words`;
  if (wordCount >= WORDS_FOR_FULL_TEARDOWN)
    return `${captures}, ${words} — plenty for a full teardown.`;
  if (wordCount >= WORDS_FOR_SOLID_DOCUMENT)
    return `${captures}, ${words} — enough for a solid document.`;
  return `${captures}, ${words} — a short session; the document will be brief. Keep going, or generate anyway.`;
}

// ---- banners --------------------------------------------------------------------------------------

function banner(text: string, kind: "warn" | "error" = "warn"): void {
  const el = $("banner");
  el.textContent = text;
  el.className = `banner${kind === "error" ? " error" : ""}`;
  el.hidden = false;
  setTimeout(() => (el.hidden = true), 8000);
}

function nudge(kind: "forgot-to-stop" | "silence"): void {
  const el = $("nudge");
  el.innerHTML =
    kind === "forgot-to-stop"
      ? `Still going? That's fine. <button id="nudge-stop">Stop</button>`
      : `It's been quiet for a while — say what you're looking at.`;
  el.hidden = false;
  document
    .getElementById("nudge-stop")
    ?.addEventListener("click", () => run(() => ask({ type: "STOP_SESSION" })));
  setTimeout(() => (el.hidden = true), kind === "silence" ? 10000 : 60000);
}

// Runs an action and shows its failure as a banner instead of a console error.
async function run(
  action: () => Promise<unknown>,
  busy?: HTMLButtonElement,
): Promise<void> {
  if (busy) busy.disabled = true;
  try {
    await action();
  } catch (err) {
    const message = (err as Error).message;
    if (message === "out_of_credits")
      banner(
        "Out of credits — buy a pack in the web app, then generate.",
        "error",
      );
    else banner(message, "error");
  } finally {
    if (busy) busy.disabled = false;
  }
}

async function deleteCapture(id: string): Promise<void> {
  await run(() => ask({ type: "DELETE_CAPTURE", captureId: id }));
  forgetThumbnail(id);
}

// ---- wiring --------------------------------------------------------------------------------------

button("sign-in").addEventListener("click", () =>
  run(() => ask({ type: "SIGN_IN" }), button("sign-in")),
);
$("grant-mic").addEventListener("click", () =>
  chrome.tabs.create({ url: chrome.runtime.getURL("permission.html") }),
);
button("start").addEventListener("click", () =>
  run(
    () =>
      ask({
        type: "START_SESSION",
        deviceId: $<HTMLSelectElement>("device").value || undefined,
      }),
    button("start"),
  ),
);
$("capture").addEventListener("click", () =>
  run(() => ask({ type: "CAPTURE_FROM_PANEL" })),
);
button("stop").addEventListener("click", () =>
  run(() => ask({ type: "STOP_SESSION" }), button("stop")),
);
button("generate").addEventListener("click", () =>
  run(() => ask({ type: "GENERATE" }), button("generate")),
);
button("resume").addEventListener("click", () =>
  run(() => ask({ type: "RESUME_SESSION" }), button("resume")),
);
$("discard").addEventListener("click", () => {
  if (
    confirm(
      "Discard this session's local copy? The recording stays in your library in the web app.",
    )
  ) {
    void run(() => ask({ type: "DISMISS_SESSION" }));
  }
});

chrome.runtime.onMessage.addListener((raw) => {
  const message = parseMessage(raw);
  if (message === null) return false;
  switch (message.type) {
    case "STATE_CHANGED":
      void render();
      break;
    case "CAPTURE_STORED":
    case "CAPTURE_DELETED":
      void renderFilmstrip(
        $("view-recording").hidden ? $("strip-review") : $("strip-recording"),
        deleteCapture,
      );
      break;
    case "LEVEL":
      $("level").style.width = `${Math.min(100, message.rms * 400)}%`;
      break;
    case "DEAD_MIC":
      $("dead-mic").hidden = !message.silent;
      break;
    case "NUDGE":
      nudge(message.kind);
      break;
    case "PROBLEM":
      banner(message.message, "error");
      break;
  }
  return false;
});

// Device labels appear only after the permission is granted, possibly in another tab.
navigator.mediaDevices.addEventListener(
  "devicechange",
  () => void listMicrophones(),
);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") void render();
});

void render();
