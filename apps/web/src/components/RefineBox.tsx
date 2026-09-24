import { useState } from "react";
import { ApiError } from "../api/client.js";
import { useRefine } from "../api/documents.js";
import styles from "./RefineBox.module.css";

// Ask for an edit in plain words. Free and unlimited (spine §6). An edit that breaks the output
// contract is thrown away and the document stays as it was.
export function RefineBox({ documentId }: { documentId: string }) {
  const [prompt, setPrompt] = useState("");
  const refine = useRefine(documentId);

  const submit = () => {
    if (prompt.trim().length === 0) return;
    refine.mutate(prompt.trim(), { onSuccess: () => setPrompt("") });
  };

  return (
    <section className={styles.box}>
      <h2>Refine</h2>
      <p className="muted">
        Ask for a change: "shorten the takeaways", "add a section comparing
        their pricing to ours", "less formal". Refining is free.
      </p>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
        }}
        placeholder="What should change?"
        disabled={refine.isPending}
        maxLength={4000}
      />
      <div className={styles.row}>
        <button
          className="primary"
          onClick={submit}
          disabled={refine.isPending || prompt.trim().length === 0}
        >
          {refine.isPending ? "Refining…" : "Refine"}
        </button>
        <span className={styles.message}>
          {refine.isPending && (
            <span className="muted">Usually 10–30 seconds.</span>
          )}
          {refine.isSuccess && !refine.isPending && (
            <span className="muted">
              Saved as version {refine.data.version.versionNo}.
            </span>
          )}
          {refine.isError && (
            <span className="error">{refineError(refine.error)}</span>
          )}
        </span>
      </div>
    </section>
  );
}

function refineError(error: Error): string {
  if (error instanceof ApiError && error.status === 422)
    return "That edit didn't take; try rewording.";
  return error.message;
}
