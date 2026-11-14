import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { Button } from "./Button";
import { showDialogWithoutActionFocus } from "../shared/show-dialog";

type AccountConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  busy?: boolean;
  error?: string;
  destructive?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function AccountConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  busy = false,
  error = "",
  destructive = true,
  onCancel,
  onConfirm,
}: AccountConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const id = useId();
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) showDialogWithoutActionFocus(dialog);
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <dialog
      className="game-dialog account-confirm-dialog"
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <div className="dialog-content account-confirm-content">
        <div className="online-dialog-header">
          <h2 id={titleId}>{title}</h2>
          <button
            className="dialog-close"
            type="button"
            aria-label={cancelLabel}
            disabled={busy}
            onClick={onCancel}
          >
            <svg aria-hidden="true" viewBox="0 0 20 20">
              <path d="m5 5 10 10M15 5 5 15" />
            </svg>
          </button>
        </div>
        <p id={descriptionId}>{description}</p>
        {error && (
          <p className="account-confirm-error" role="alert">
            {error}
          </p>
        )}
        <div className="account-confirm-actions">
          <Button variant="secondary" type="button" disabled={busy} onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            variant="secondary"
            type="button"
            className={destructive ? "is-destructive" : ""}
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? "Working…" : confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>,
    document.body,
  );
}
