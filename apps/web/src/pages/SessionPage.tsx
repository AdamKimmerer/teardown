import { useState, type ReactNode } from "react";
import { Link, useParams } from "react-router";
import { ApiError } from "../api/client.js";
import {
  useDocument,
  useDocumentVersion,
  useSetCurrentVersion,
} from "../api/documents.js";
import { useSession } from "../api/sessions.js";
import { DocumentView } from "../components/DocumentView.js";
import { PendingSession } from "../components/PendingSession.js";
import { RevisionsPanel } from "../components/RevisionsPanel.js";
import { StatusBadge } from "../components/StatusBadge.js";
import styles from "./SessionPage.module.css";

// One session: the document and its Revisions panel once it is ready, otherwise where generation
// stands. The extension opens this page right after Generate.
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

  const top = (
    <div className={styles.top}>
      <Link to="/" className={styles.back}>
        ← Sessions
      </Link>
      <span className={styles.spacer} />
      <StatusBadge status={s.status} />
    </div>
  );

  return (
    <div className={styles.page}>
      {s.status === "ready" && documentId ? (
        <ReadyDocument documentId={documentId} top={top} />
      ) : (
        <>
          {top}
          <PendingSession session={s} captureCount={captures.length} />
        </>
      )}
    </div>
  );
}

// The version being viewed and the Revisions panel. Viewing a version makes it current on the
// server (it opens next time); until the server answers, that version is fetched on its own.
// `top` (back link and status) sits in the document column, so the panel can start right under
// the site header and fit the window.
function ReadyDocument({
  documentId,
  top,
}: {
  documentId: string;
  top: ReactNode;
}) {
  const document = useDocument(documentId);
  const setCurrent = useSetCurrentVersion(documentId);
  const [viewingId, setViewingId] = useState<string | null>(null);

  const current = document.data?.currentVersion;
  const versions = document.data?.versions ?? [];
  const viewing = versions.find((v) => v.id === (viewingId ?? current?.id));
  const needsFetch = viewing !== undefined && viewing.id !== current?.id;
  const fetched = useDocumentVersion(
    documentId,
    needsFetch ? viewing.versionNo : null,
  );

  if (document.isLoading) return <p className="muted">Loading the document…</p>;
  if (document.isError)
    return <p className="error">{document.error.message}</p>;
  const { images } = document.data!;
  const markdown = needsFetch
    ? fetched.data?.version.markdown
    : current?.markdown;

  const view = (versionId: string) => {
    setViewingId(versionId);
    if (versionId !== current?.id) setCurrent.mutate(versionId);
  };

  return (
    <div className={styles.layout}>
      <div className={markdown === undefined ? styles.loading : undefined}>
        {top}
        {markdown !== undefined && (
          <DocumentView markdown={markdown} images={images} />
        )}
      </div>
      <RevisionsPanel
        documentId={documentId}
        versions={versions}
        viewingId={viewing?.id ?? current!.id}
        onView={view}
        onCreated={setViewingId}
      />
    </div>
  );
}
