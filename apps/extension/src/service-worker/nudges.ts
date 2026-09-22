import {
  FORGOT_TO_STOP_MINUTES,
  SILENCE_NUDGE_AFTER_SKIPPED_CHUNKS,
} from "../shared/constants.js";
import { sendMessage } from "../shared/messages.js";
import { getLocalSession, updateLocalSession } from "../shared/sessionState.js";

// The two non-alarming interruptions a session may get (spine §7): forgot-to-stop at ~25 min,
// repeated until the session ends, and a soft silence hint after a run of VAD-gated chunks.
// Alarms, because the service worker cannot keep a timer alive.

const FORGOT_TO_STOP_ALARM = "forgot-to-stop";

export function scheduleForgotToStopNudge(): void {
  chrome.alarms.create(FORGOT_TO_STOP_ALARM, {
    delayInMinutes: FORGOT_TO_STOP_MINUTES,
  });
}

export function clearNudges(): void {
  void chrome.alarms.clear(FORGOT_TO_STOP_ALARM);
}

export function listenForNudgeAlarms(): void {
  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name !== FORGOT_TO_STOP_ALARM) return;
    const session = await getLocalSession();
    if (session?.status !== "recording") return;
    await sendMessage({ type: "NUDGE", kind: "forgot-to-stop" });
    scheduleForgotToStopNudge();
  });
}

// Called for every chunk the recorder skipped as silent. The nudge fires once per quiet stretch.
export async function noteChunkSkipped(): Promise<void> {
  const session = await getLocalSession();
  if (session === null) return;
  const skipped = session.skippedChunksInARow + 1;
  await updateLocalSession({ skippedChunksInARow: skipped });
  if (skipped === SILENCE_NUDGE_AFTER_SKIPPED_CHUNKS) {
    await sendMessage({ type: "NUDGE", kind: "silence" });
  }
}

export async function noteChunkStored(): Promise<void> {
  const session = await getLocalSession();
  if (session !== null && session.skippedChunksInARow > 0) {
    await updateLocalSession({ skippedChunksInARow: 0 });
  }
}
