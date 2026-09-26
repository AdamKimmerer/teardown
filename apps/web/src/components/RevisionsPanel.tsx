import { useEffect, useRef, useState } from "react";
import type {
  DocumentVersionSummary,
  RefineResponse,
} from "@teardown/core/api-contract";
import { ApiError } from "../api/client.js";
import { useRefine } from "../api/documents.js";
import { RefineComposer } from "./RefineComposer.js";
import { RefineReply, type LocalReply } from "./RefineReply.js";
import { VersionEntry } from "./VersionEntry.js";
import styles from "./RevisionsPanel.module.css";

type Props = {
  documentId: string;
  versions: DocumentVersionSummary[];
  viewingId: string;
  // The user picked a version to look at.
  onView: (versionId: string) => void;
  // A refine made a new version (the server has already made it current).
  onCreated: (versionId: string) => void;
};

// The document's history and the request box, together (the spine's refine/chat). Every version
// is an entry, oldest first; replies that made no version sit between them. Refining edits the
// version being viewed, so refining an older one branches the history.
export function RevisionsPanel({
  documentId,
  versions,
  viewingId,
  onView,
  onCreated,
}: Props) {
  const refine = useRefine(documentId);
  const [replies, setReplies] = useState<LocalReply[]>([]);
  const [pending, setPending] = useState<{
    prompt: string;
    searching: boolean;
  } | null>(null);
  const [open, setOpen] = useState(false);
  const historyRef = useRef<HTMLDivElement>(null);

  const byId = new Map(versions.map((v) => [v.id, v]));
  const viewing = byId.get(viewingId) ?? versions[versions.length - 1]!;
  const latestNo = versions[versions.length - 1]!.versionNo;

  useEffect(() => {
    historyRef.current?.scrollTo({
      top: historyRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [versions.length, replies.length, pending]);

  function send(prompt: string, fromVersionId: string, allowWebSearch = false) {
    setPending({ prompt, searching: allowWebSearch });
    refine.mutate(
      { prompt, fromVersionId, allowWebSearch },
      {
        onSuccess: (answer) =>
          answer.outcome === "edited"
            ? onCreated(answer.version.id)
            : addReply(prompt, fromVersionId, answer),
        onError: (error) => addReply(prompt, fromVersionId, null, error),
        onSettled: () => setPending(null),
      },
    );
  }

  function addReply(
    prompt: string,
    fromVersionId: string,
    answer: Exclude<RefineResponse, { outcome: "edited" }> | null,
    error?: Error,
  ) {
    const reply: LocalReply = answer
      ? {
          id: crypto.randomUUID(),
          at: Date.now(),
          prompt,
          fromVersionId,
          kind: answer.outcome,
          note: answer.note,
          searchQuery: "searchQuery" in answer ? answer.searchQuery : undefined,
        }
      : {
          id: crypto.randomUUID(),
          at: Date.now(),
          prompt,
          fromVersionId,
          kind: "error",
          note: errorText(error!),
        };
    setReplies((all) => [...all, reply]);
  }

  function resolve(reply: LocalReply) {
    setReplies((all) =>
      all.map((r) => (r.id === reply.id ? { ...r, resolved: true } : r)),
    );
  }

  const timeline = [
    ...versions.map((v) => ({
      at: Date.parse(v.createdAt),
      key: v.id,
      node: (
        <VersionEntry
          key={v.id}
          version={v}
          parentNo={
            v.parentVersionId
              ? (byId.get(v.parentVersionId)?.versionNo ?? null)
              : null
          }
          viewing={v.id === viewing.id}
          onView={onView}
        />
      ),
    })),
    ...replies.map((r) => ({
      at: r.at,
      key: r.id,
      node: (
        <RefineReply
          key={r.id}
          reply={r}
          onApproveSearch={(x) => {
            resolve(x);
            send(x.prompt, x.fromVersionId, true);
          }}
          onDismissSearch={resolve}
        />
      ),
    })),
  ].sort((a, b) => a.at - b.at);

  return (
    <aside
      className={`${styles.panel} ${open ? styles.open : ""}`}
      aria-label="Revisions"
    >
      <div className={styles.header}>
        Revisions{" "}
        <span className={styles.count}>
          v{viewing.versionNo} of {versions.length}
        </span>
        <button
          className={`quiet ${styles.toggle}`}
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
        >
          {open ? "Close" : "Open"}
        </button>
      </div>
      <div className={styles.history} ref={historyRef}>
        {timeline.map((item) => item.node)}
        {pending && (
          <div className={styles.entry}>
            <div className={styles.request}>{pending.prompt}</div>
            <div className={styles.pending}>
              <span className={styles.dot} />{" "}
              {pending.searching
                ? "Searching the web and editing…"
                : "Working on it…"}
            </div>
          </div>
        )}
      </div>
      <RefineComposer
        editingNo={viewing.versionNo}
        latestNo={latestNo}
        busy={refine.isPending}
        onSend={(prompt) => send(prompt, viewing.id)}
      />
    </aside>
  );
}

function errorText(error: Error): string {
  if (error instanceof ApiError && error.status === 422)
    return "That edit didn't take; try rewording.";
  return error.message;
}
