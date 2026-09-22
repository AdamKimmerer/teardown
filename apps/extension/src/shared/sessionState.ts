// What the extension remembers about the current session, and where.
//   chrome.storage.session: the clock epoch (spine §8.4). Cleared when the browser closes, which
//     is right: a recording cannot survive that.
//   chrome.storage.local: the session record, so a stopped session can still be generated after
//     a restart and so a restarted service worker knows what it was doing.

export type LocalSessionStatus = "recording" | "review" | "generating";

export type LocalSession = {
  id: string;
  status: LocalSessionStatus;
  startedAt: number;
  pausedMs: number;
  stoppedAt: number | null;
  deviceId: string | undefined;
  skippedChunksInARow: number;
};

export type Clock = { startedAt: number; pausedMs: number };

export async function getLocalSession(): Promise<LocalSession | null> {
  const { session } = await chrome.storage.local.get("session");
  return (session as LocalSession | undefined) ?? null;
}

export async function setLocalSession(session: LocalSession): Promise<void> {
  await chrome.storage.local.set({ session });
}

export async function updateLocalSession(
  patch: Partial<LocalSession>,
): Promise<LocalSession> {
  const current = await getLocalSession();
  if (current === null) throw new Error("no session to update");
  const next = { ...current, ...patch };
  await setLocalSession(next);
  return next;
}

export async function clearLocalSession(): Promise<void> {
  await chrome.storage.local.remove("session");
}

export async function getClock(): Promise<Clock | null> {
  const { startedAt, pausedMs } = await chrome.storage.session.get([
    "startedAt",
    "pausedMs",
  ]);
  if (typeof startedAt !== "number") return null;
  return { startedAt, pausedMs: typeof pausedMs === "number" ? pausedMs : 0 };
}

export async function setClock(clock: Clock): Promise<void> {
  await chrome.storage.session.set(clock);
}

export async function clearClock(): Promise<void> {
  await chrome.storage.session.remove(["startedAt", "pausedMs"]);
}
