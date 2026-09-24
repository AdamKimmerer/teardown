import type { DocumentVersionSummary } from "@teardown/core/api-contract";

type Props = {
  versions: DocumentVersionSummary[];
  viewing: number;
  onChange: (versionNo: number) => void;
};

// Picks which version of the document to read. Every version is kept (spine §12.1); the newest
// is the current one, and refining always edits the current one.
export function VersionSwitcher({ versions, viewing, onChange }: Props) {
  if (versions.length < 2) return null;
  const latest = versions[versions.length - 1]!.versionNo;
  return (
    <label className="muted">
      Version{" "}
      <select
        value={viewing}
        onChange={(e) => onChange(Number(e.target.value))}
      >
        {[...versions].reverse().map((v) => (
          <option key={v.id} value={v.versionNo}>
            v{v.versionNo} · {v.source === "generate" ? "generated" : "refined"}
            {v.versionNo === latest ? " (current)" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
