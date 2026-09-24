import { useState } from "react";
import { Link, useParams } from "react-router";
import { ApiError } from "../api/client.js";
import { useDocument, useDocumentVersion } from "../api/documents.js";
import { useSession } from "../api/sessions.js";
import { DocumentView } from "../components/DocumentView.js";
import { PendingSession } from "../components/PendingSession.js";
import { RefineBox } from "../components/RefineBox.js";
import { StatusBadge } from "../components/StatusBadge.js";
import { VersionSwitcher } from "../components/VersionSwitcher.js";
import styles from "./SessionPage.module.css";

// One session: the document once it is ready, otherwise where generation stands. The extension
// opens this page right after Generate.
export function SessionPage() {
  const { id = "" } = useParams();
  const session = useSession(id);

  if (session.isLoading) return <p className="muted">Loading…</p>;
  if (session.error instanceof ApiError && session.error.status === 404) {
    return (
      <p>
        This session doesn't exist or isn't yours.{" "}
        <Link to="/">Back to sessions</Link>
      </p>
    );
  }
  if (session.isError) return <p className="error">{session.error.message}</p>;
  const { session: s, captures, documentId } = session.data!;

  return (
    <>
      <div className={styles.top}>
        <Link to="/" className={styles.back}>
          ← Sessions
        </Link>
        <span className={styles.spacer} />
        <StatusBadge status={s.status} />
      </div>
      {s.status === "ready" && documentId ? (
        <ReadyDocument documentId={documentId} />
      ) : (
        <PendingSession session={s} captureCount={captures.length} />
      )}
    </>
  );
}

// The document with its version switcher and the refine box. Earlier versions are read-only.
function ReadyDocument({ documentId }: { documentId: string }) {
  const document = useDocument(documentId);
  const [viewing, setViewing] = useState<number | null>(null);
  const current = document.data?.currentVersion.versionNo ?? null;
  const showingEarlier = viewing !== null && viewing !== current;
  const earlier = useDocumentVersion(
    documentId,
    showingEarlier ? viewing : null,
  );

  if (document.isLoading) return <p className="muted">Loading the document…</p>;
  if (document.isError)
    return <p className="error">{document.error.message}</p>;
  const { currentVersion, versions, images } = document.data!;
  const markdown = showingEarlier
    ? earlier.data?.version.markdown
    : currentVersion.markdown;

  return (
    <>
      <div className={styles.top}>
        <VersionSwitcher
          versions={versions}
          viewing={viewing ?? currentVersion.versionNo}
          onChange={setViewing}
        />
      </div>
      {showingEarlier && (
        <div className={styles.notice}>
          You're viewing version {viewing}. Refining edits the current version
          (v{currentVersion.versionNo}).
          <button onClick={() => setViewing(null)}>Back to current</button>
        </div>
      )}
      {markdown === undefined ? (
        <p className="muted">Loading version…</p>
      ) : (
        <DocumentView markdown={markdown} images={images} />
      )}
      {!showingEarlier && <RefineBox documentId={documentId} />}
    </>
  );
}
