export function ToastMessage({
  kind,
  title,
  message,
  onDismiss,
}: {
  kind: "success" | "error";
  title: string;
  message: string;
  onDismiss: () => void;
}) {
  return (
    <div className={`app-toast app-toast-${kind}`} role={kind === "error" ? "alert" : "status"}>
      <span className="app-toast-mark" aria-hidden="true">
        {kind === "success" ? "✓" : "!"}
      </span>
      <span className="app-toast-copy">
        <strong>{title}</strong>
        <small>{message}</small>
      </span>
      <button type="button" className="app-toast-close" onClick={onDismiss} aria-label="Dispensar mensagem">
        ×
      </button>
    </div>
  );
}
