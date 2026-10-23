import { Brand } from "../components/Brand";
import { googleAuthUrl } from "../api/client";
import { ThemeToggle } from "../components/ThemeToggle";
export function AuthPage({
  onLogin,
  notice,
  tokenAction: _tokenAction,
  dark,
  onToggleTheme,
}: {
  onLogin: (data: { email: string; password: string; otp?: string }) => Promise<{ mfaRequired?: true }>;
  notice?: string;
  tokenAction?: { kind: string; token: string } | null;
  dark: boolean;
  onToggleTheme: () => void;
}) {
  void onLogin;
  void _tokenAction;
  const message = notice ?? "";
  const noticeIsError = /indisponível|expirou|não foi possível|inválid|falha|erro/i.test(message);
  return (
    <main className="auth-shell">
      <section className="auth-intro">
        <Brand />
        <div className="auth-message">
          <p className="eyebrow">SUA FAMÍLIA EM UM SÓ LUGAR</p>
          <h1>Organize o que importa, juntos.</h1>
          <p>Uma central simples para tarefas, compras e compromissos da família.</p>
          <div className="auth-feature-list" aria-label="Recursos do FamilyHub">
            <span>
              <i aria-hidden="true" />
              Agenda compartilhada
            </span>
            <span>
              <i aria-hidden="true" />
              Listas de compras
            </span>
            <span>
              <i aria-hidden="true" />
              Rotina da família
            </span>
          </div>
        </div>
        <small className="auth-photo-credit">A rotina fica mais leve quando é compartilhada.</small>
      </section>
      <section className="auth-card">
        <ThemeToggle dark={dark} onToggle={onToggleTheme} />
        <div className="auth-card-brand">
          <Brand />
        </div>
        <p className="eyebrow">SEU ESPAÇO EM FAMÍLIA</p>
        <h2>Entre na sua conta</h2>
        {message && (
          <p className={`form-notice ${noticeIsError ? "auth-notice-error" : ""}`} role="status">
            {message}
          </p>
        )}
        <>
          <div className="auth-divider">
            <span>ou</span>
          </div>
          <a className="google-auth-button" href={googleAuthUrl}>
            <span aria-hidden="true">G</span>
            Continuar com Google
          </a>
        </>
        <p className="subtitle">
          Seus dados de conta e rotina são usados para organizar sua família. Preferências e solicitações
          ficam na área Privacidade.
        </p>
      </section>
    </main>
  );
}
