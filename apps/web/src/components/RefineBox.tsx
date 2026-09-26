import { useState } from "react";
import { ApiError } from "../api/client.js";
import { useRefine } from "../api/documents.js";
import styles from "./RefineBox.module.css";

// Ask for an edit in plain words. Free and unlimited (spine §6). An edit that breaks the output
// contract is thrown away and the document stays as it was.
export function RefineBox({
  documentId,
  onRefined,
}: {
  documentId: string;
  onRefined: () => void;
}) {
  const [prompt, setPrompt] = useState("");
  const refine = useRefine(documentId);

  const submit = () => {
    if (prompt.trim().length === 0) return;
    refine.mutate(prompt.trim(), {
      onSuccess: () => {
        setPrompt("");
        onRefined();
      },
    });
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
              Saved as version {refine.data.version.versionNo}.{" "}
              {refine.data.note}
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

// Why nothing was saved. A declined request carries the model's own explanation; a contract
// failure gets the plan's plain wording (spine §12.1).
function refineError(error: Error): string {
  if (error instanceof ApiError && error.status === 422) {
    if (error.code === "refine_declined" || error.code === "refine_no_change")
      return error.message;
    return "That edit didn't take; try rewording.";
  }
  return error.message;
}
