import { useEffect, useRef, useState, type ReactNode } from "react";
import styles from "./ConfirmDialog.module.css";

type Props = {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  // When set, the confirm button stays disabled until this exact text is typed.
  requireText?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

// A modal "are you sure" for destructive actions, on the native <dialog> element.
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  requireText,
  busy,
  onConfirm,
  onCancel,
}: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [typed, setTyped] = useState("");

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
    if (!open) setTyped("");
  }, [open]);

  const confirmable =
    !busy && (requireText === undefined || typed.trim() === requireText);

  return (
    <dialog ref={ref} className={styles.dialog} onCancel={onCancel}>
      <h2>{title}</h2>
      <p>{children}</p>
      {requireText !== undefined && (
        <input
          autoFocus
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={requireText}
          aria-label={`Type "${requireText}" to confirm`}
        />
      )}
      <div className={styles.actions}>
        <button onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button className="danger" onClick={onConfirm} disabled={!confirmable}>
          {busy ? "Working…" : confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
