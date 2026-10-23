import { useEffect } from "react";

export function ConfirmDialog({
  title,
  description,
  confirmLabel = "Excluir registro",
  busy = false,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: string;
  confirmLabel?: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, onCancel]);

  return (
    <div
      className="confirm-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
        <span className="confirm-icon" aria-hidden="true">
          !
        </span>
        <h2 id="confirm-title">{title}</h2>
        <p>{description}</p>
        <div className="confirm-actions">
          <button className="button button-secondary" disabled={busy} onClick={onCancel}>
            Manter
          </button>
          <button className="button button-danger" disabled={busy} onClick={onConfirm}>
            {busy ? "Excluindo…" : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
