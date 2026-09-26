import { useState } from "react";
import { Link } from "react-router";
import type { SessionListItem } from "@teardown/core/api-contract";
import { useDeleteSession, useSessions } from "../api/sessions.js";
import { ConfirmDialog } from "../components/ConfirmDialog.js";
import { StatusBadge } from "../components/StatusBadge.js";
import { formatDateTime } from "../formatDateTime.js";
import styles from "./LibraryPage.module.css";

// Every session, newest first, with delete. Recording happens in the extension.
export function LibraryPage() {
  const sessions = useSessions();
  const deleteSession = useDeleteSession();
  const [toDelete, setToDelete] = useState<SessionListItem | null>(null);

  return (
    <div className={styles.page}>
      <div className={styles.heading}>
        <h1>Sessions</h1>
        <span className="muted">
          Record new sessions with the Teardown extension.
        </span>
      </div>

      {sessions.isLoading && <p className="muted">Loading…</p>}
      {sessions.isError && <p className="error">{sessions.error.message}</p>}
      {sessions.data?.sessions.length === 0 && (
        <div className={styles.empty}>
          <strong>No sessions yet.</strong>
          <br />
          Open the Teardown side panel in Chrome, press Start, and narrate a
          walkthrough.
        </div>
      )}

      {sessions.data && sessions.data.sessions.length > 0 && (
        <ul className={styles.list}>
          {sessions.data.sessions.map((s) => (
            <li key={s.id} className={styles.item}>
              <div className={styles.title}>
                <Link to={`/sessions/${s.id}`}>
                  {s.title ?? "Untitled session"}
                </Link>
                <span className={styles.meta}>
                  {formatDateTime(s.createdAt)} · {s.captureCount} capture
                  {s.captureCount === 1 ? "" : "s"}
                </span>
              </div>
              <StatusBadge status={s.status} />
              <button
                className="quiet"
                onClick={() => setToDelete(s)}
                aria-label={`Delete ${s.title ?? "session"}`}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={toDelete !== null}
        title="Delete this session?"
        confirmLabel="Delete"
        busy={deleteSession.isPending}
        onCancel={() => setToDelete(null)}
        onConfirm={() =>
          toDelete &&
          deleteSession.mutate(toDelete.id, {
            onSuccess: () => setToDelete(null),
          })
        }
      >
        “{toDelete?.title ?? "Untitled session"}” — its recording, screenshots,
        transcript and every version of its document are deleted for good.
        Copies you exported elsewhere are not affected.
      </ConfirmDialog>
    </div>
  );
}
