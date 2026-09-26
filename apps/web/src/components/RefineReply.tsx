import styles from "./RevisionsPanel.module.css";

// A refine that did not produce a version: the model declined, nothing changed, it wants to
// search the web first, or the request failed. Kept in the panel for this visit only.
export type LocalReply = {
  id: string;
  at: number;
  prompt: string;
  fromVersionId: string;
  kind: "declined" | "no_change" | "needs_web_search" | "error";
  note: string;
  searchQuery?: string;
  resolved?: boolean;
};

type Props = {
  reply: LocalReply;
  onApproveSearch: (reply: LocalReply) => void;
  onDismissSearch: (reply: LocalReply) => void;
};

export function RefineReply({
  reply,
  onApproveSearch,
  onDismissSearch,
}: Props) {
  const asking = reply.kind === "needs_web_search" && !reply.resolved;
  return (
    <div className={styles.entry}>
      <div className={styles.request}>{reply.prompt}</div>
      <div
        className={`${styles.reply} ${reply.kind === "error" ? styles.error : styles.quiet}`}
      >
        <div className={styles.note}>{reply.note}</div>
        {asking && (
          <div className={styles.search}>
            Search the web for <q>{reply.searchQuery}</q>? Sources will be
            linked in the document.
            <div className={styles.searchActions}>
              <button
                className="primary"
                onClick={() => onApproveSearch(reply)}
              >
                Search and apply
              </button>
              <button onClick={() => onDismissSearch(reply)}>Not now</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
