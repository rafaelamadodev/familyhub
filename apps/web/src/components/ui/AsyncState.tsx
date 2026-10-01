import type { ReactNode } from "react";
export function AsyncState({
  pending,
  error,
  retry,
  children,
}: {
  pending: boolean;
  error?: Error | null;
  retry: () => unknown;
  children: ReactNode;
}) {
  if (pending)
    return (
      <div className="panel" role="status">
        Carregando seus dados…
      </div>
    );
  if (error)
    return (
      <div className="panel" role="alert">
        <p>{error.message}</p>
        <button className="button button-secondary" onClick={retry}>
          Tentar novamente
        </button>
      </div>
    );
  return <>{children}</>;
}
export function Notice({ children }: { children: ReactNode }) {
  return (
    <p className="form-notice" role="status">
      {children}
    </p>
  );
}
