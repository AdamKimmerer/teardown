import { sessionElapsedMs } from "@teardown/core/clock";
import { getClock } from "./sessionState.js";

// The session clock, readable from any runtime: ms since the session started, minus pauses.
// Every timestamp the extension records (captures, chunk offsets) comes from here.
export async function sessionNowMs(): Promise<number> {
  const clock = await getClock();
  if (clock === null) throw new Error("no session clock");
  return sessionElapsedMs(clock.startedAt, clock.pausedMs);
}
