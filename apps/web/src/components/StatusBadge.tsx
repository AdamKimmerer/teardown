import type { SessionStatus } from "@teardown/core/schemas/session";
import styles from "./StatusBadge.module.css";

const LABELS: Record<SessionStatus, string> = {
  recording: "Recording",
  review: "Not generated",
  syncing: "Generating",
  processing: "Generating",
  ready: "Ready",
  failed: "Failed",
};

const TONES: Partial<Record<SessionStatus, string>> = {
  ready: styles.ready,
  syncing: styles.working,
  processing: styles.working,
  failed: styles.failed,
};

// A session's state in one word, coloured by whether it needs attention.
export function StatusBadge({ status }: { status: SessionStatus }) {
  return (
    <span className={`${styles.badge} ${TONES[status] ?? ""}`}>
      {LABELS[status]}
    </span>
  );
}
