import { useState } from "react";
import { useNavigate } from "react-router";
import { useDeleteAccount, useMe } from "../api/me.js";
import { ConfirmDialog } from "../components/ConfirmDialog.js";
import styles from "./AccountPage.module.css";

const CONFIRM_TEXT = "delete my account";

// Who you are, your credits, and deleting everything (spine §14 item 6). Billing and connected
// services arrive in Phases 6 and 7.
export function AccountPage() {
  const me = useMe();
  const deleteAccount = useDeleteAccount();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);

  return (
    <div className={styles.page}>
      <h1>Account</h1>

      <section className={styles.section}>
        <h2>Profile</h2>
        {me.isLoading && <p className="muted">Loading…</p>}
        {me.isError && <p className="error">{me.error.message}</p>}
        {me.data && (
          <>
            <div className={styles.row}>
              <span className="muted">Signed in as</span>
              <span>{me.data.email}</span>
            </div>
            <div className={styles.row}>
              <span className="muted">Credits</span>
              <span>
                {me.data.creditBalance} generation
                {me.data.creditBalance === 1 ? "" : "s"}
              </span>
            </div>
          </>
        )}
      </section>

      <section className={`${styles.section} ${styles.danger}`}>
        <h2>Delete account</h2>
        <p className="muted">
          Permanently deletes your account, every session, recording,
          screenshot, transcript and document, and your remaining credits. It
          signs you out everywhere, including the extension. Documents you
          exported elsewhere are not affected.
        </p>
        <button className="danger" onClick={() => setConfirming(true)}>
          Delete my account
        </button>
        {deleteAccount.isError && (
          <p className="error">{deleteAccount.error.message}</p>
        )}
      </section>

      <ConfirmDialog
        open={confirming}
        title="Delete your account?"
        confirmLabel="Delete everything"
        requireText={CONFIRM_TEXT}
        busy={deleteAccount.isPending}
        onCancel={() => setConfirming(false)}
        onConfirm={() =>
          deleteAccount.mutate(undefined, {
            onSuccess: () => navigate("/login?deleted=1", { replace: true }),
            onError: () => setConfirming(false),
          })
        }
      >
        This cannot be undone. Type “{CONFIRM_TEXT}” to confirm.
      </ConfirmDialog>
    </div>
  );
}
