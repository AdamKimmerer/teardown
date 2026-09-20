import type { Context } from "hono";
import type { Session, SessionStatus } from "@teardown/core/schemas/session";
import type { AppEnv } from "../appEnv.js";
import { AppError } from "../appError.js";
import { findOwnedSession } from "../db/queries/sessions.js";

// Loads the :id session for the signed-in user. Someone else's session is a 404, not a 403,
// so the API never confirms that an id exists.
export async function ownedSession(c: Context<AppEnv>): Promise<Session> {
  const session = await findOwnedSession(c.get("userId"), c.req.param("id")!);
  if (session === null) {
    throw new AppError("session_not_found", 404, "No such session");
  }
  return session;
}

// Guards a state transition: a capture cannot be added to a stopped session, and so on.
export function assertSessionStatus(
  session: Session,
  allowed: SessionStatus[],
): void {
  if (!allowed.includes(session.status)) {
    throw new AppError(
      "session_wrong_state",
      409,
      `Session is ${session.status}; expected ${allowed.join(" or ")}`,
    );
  }
}
