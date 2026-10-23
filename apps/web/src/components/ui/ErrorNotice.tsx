export function ErrorNotice({
  message,
  title = "Não foi possível concluir",
}: {
  message: string;
  title?: string;
}) {
  return (
    <div className="error-notice" role="alert">
      <span className="error-notice-icon" aria-hidden="true">
        !
      </span>
      <div>
        <strong>{title}</strong>
        <p>{message}</p>
      </div>
    </div>
  );
}
