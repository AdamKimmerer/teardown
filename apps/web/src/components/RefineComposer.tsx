import { useState } from "react";
import styles from "./RevisionsPanel.module.css";

type Props = {
  editingNo: number;
  latestNo: number;
  busy: boolean;
  onSend: (prompt: string) => void;
};

// The always-visible request box. It edits the version being viewed, so from an older version it
// says so: the result becomes a new version branched from it.
export function RefineComposer({ editingNo, latestNo, busy, onSend }: Props) {
  const [text, setText] = useState("");

  const send = () => {
    const prompt = text.trim();
    if (prompt.length === 0 || busy) return;
    onSend(prompt);
    setText("");
  };

  return (
    <div className={styles.composer}>
      <div className={styles.editing}>
        Editing <strong>v{editingNo}</strong>
        {editingNo !== latestNo && (
          <> · your change becomes a new version from v{editingNo}</>
        )}
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send();
        }}
        placeholder="Ask for a change, or ask a question…"
        maxLength={4000}
        aria-label="Refine request"
      />
      <div className={styles.composerRow}>
        <span className={styles.tip}>
          Stuck for a word? Just ask: "what's this pattern called?" If it needs
          to look something up online, it'll ask first. Refining is free.
        </span>
        <button
          className="primary"
          onClick={send}
          disabled={busy || text.trim().length === 0}
        >
          Send
        </button>
      </div>
    </div>
  );
}
