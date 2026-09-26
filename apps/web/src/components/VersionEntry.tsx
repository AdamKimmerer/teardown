import type { DocumentVersionSummary } from "@teardown/core/api-contract";
import styles from "./RevisionsPanel.module.css";

type Props = {
  version: DocumentVersionSummary;
  parentNo: number | null;
  viewing: boolean;
  onView: (versionId: string) => void;
};

// One version in the history: the request that made it, and the model's note as the reply.
// Clicking the reply shows that version. A version made from something other than the version
// just before it is a branch, and says where it came from.
export function VersionEntry({ version, parentNo, viewing, onView }: Props) {
  const branched = parentNo !== null && parentNo !== version.versionNo - 1;
  return (
    <div className={styles.entry}>
      {version.refinePrompt && (
        <div className={styles.request}>{version.refinePrompt}</div>
      )}
      <button
        className={`${styles.reply} ${viewing ? styles.viewing : ""}`}
        onClick={() => onView(version.id)}
        aria-pressed={viewing}
        title={
          viewing
            ? "You're viewing this version"
            : `View version ${version.versionNo}`
        }
      >
        <div className={styles.chip}>
          <strong>v{version.versionNo}</strong>
          {branched && <span className={styles.branch}>from v{parentNo}</span>}
          {viewing && <span className={styles.viewingLabel}>Viewing</span>}
        </div>
        <div className={styles.note}>
          {version.source === "generate"
            ? "Generated from your walkthrough."
            : (version.note ?? "Refined.")}
        </div>
      </button>
    </div>
  );
}
