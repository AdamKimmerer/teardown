import type { Session } from "@teardown/core/schemas/session";
import { ApiError } from "../api/client.js";
import { useGenerate } from "../api/sessions.js";
import styles from "./PendingSession.module.css";

// Plain-language names for the step a generation failed at (sessions.failed_step).
const FAILED_STEPS: Record<string, string> = {
  transcribe: "finishing the transcript",
  crop: "preparing the screenshots",
  analyze: "writing the document",
  save: "saving the document",
  credits: "spending the credit (the balance no longer covered it)",
};

// Everything a session page shows before there is a document: still recording, stopped but not
// generated, generating (with a step label, while the page polls), or failed with a retry.
export function PendingSession({
  session,
  captureCount,
}: {
  session: Session;
  captureCount: number;
}) {
  const generate = useGenerate(session.id);
  const outOfCredits =
    generate.error instanceof ApiError && generate.error.status === 402;

  if (session.status === "syncing" || session.status === "processing") {
    return (
      <div className={styles.card}>
        <h2>
          <span className={styles.spinner} aria-hidden />
          {session.status === "syncing"
            ? "Finishing the transcript…"
            : "Writing your document…"}
        </h2>
        <p className="muted">
          This usually takes under a minute. You can leave this page; the
          document will be in your library.
        </p>
      </div>
    );
  }

  if (session.status === "recording") {
    return (
      <div className={styles.card}>
        <h2>Still recording</h2>
        <p className="muted">
          This session is recording in the extension. Press Stop in the Teardown
          side panel when you're done.
        </p>
      </div>
    );
  }

  const failed = session.status === "failed";
  return (
    <div className={styles.card}>
      <h2>{failed ? "Generation didn't finish" : "Ready to generate"}</h2>
      <p className="muted">
        {failed
          ? `Something went wrong while ${FAILED_STEPS[session.failedStep ?? ""] ?? "generating"}. No credit was spent. Anything already done will be reused when you try again.`
          : `${captureCount} capture${captureCount === 1 ? "" : "s"} recorded. Generating spends one credit; refining the document afterwards is free.`}
      </p>
      <button
        className="primary"
        onClick={() => generate.mutate()}
        disabled={generate.isPending}
      >
        {generate.isPending
          ? "Starting…"
          : failed
            ? "Try again"
            : "Generate document"}
      </button>
      {outOfCredits && (
        <p className="error">
          You're out of credits. Buying packs arrives in the next phase.
        </p>
      )}
      {generate.isError && !outOfCredits && (
        <p className="error">{generate.error.message}</p>
      )}
    </div>
  );
}
