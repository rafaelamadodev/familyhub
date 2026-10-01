import { useState } from "react";
import { Brand } from "../components/Brand";
import { RecordForm } from "../components/forms/RecordForm";
import { api, send } from "../api/client";
export function AuthPage({
  onLogin,
  notice,
  tokenAction,
}: {
  onLogin: (data: { email: string; password: string; otp?: string }) => Promise<{ mfaRequired?: true }>;
  notice?: string;
  tokenAction?: { kind: string; token: string } | null;
}) {
  const [mode, setMode] = useState(tokenAction?.kind ?? "login");
  const [message, setMessage] = useState(notice ?? "");
  const [mailpitHelp, setMailpitHelp] = useState(false);
  const [loginCredentials, setLoginCredentials] = useState<{ email: string; password: string } | null>(null);
  return (
    <main className="auth-shell">
      <section className="auth-intro">
        <Brand />
        <div className="auth-message">
          <p className="eyebrow">SUA FAMÍLIA EM UM SÓ LUGAR</p>
          <h1>Organize o que importa, juntos.</h1>
          <p>Uma central simples para tarefas, compras e compromissos da família.</p>
          <span className="auth-points">Rotina compartilhada · Privacidade por padrão</span>
        </div>
        <small>Mais tempo para estar junto.</small>
      </section>
      <section className="auth-card">
        <p className="eyebrow">BEM-VINDO AO FAMILYHUB</p>
        <h2>
          {mode === "register"
            ? "Crie sua conta"
            : mode === "forgot"
              ? "Recupere sua senha"
              : mode === "reset"
                ? "Escolha uma nova senha"
                : mode === "mfa"
                  ? "Confirme sua identidade"
                  : mode === "verify"
                    ? "Confirme seu e-mail"
                    : "Entre na sua conta"}
        </h2>
        {message && (
          <p className="form-notice" role="status">
            {message}
          </p>
        )}
        <RecordForm
          key={mode}
          fields={
            mode === "verify"
              ? []
              : mode === "mfa"
                ? [{ name: "otp", label: "Código do autenticador", maxLength: 6, required: true }]
                : mode === "reset"
                  ? [{ name: "password", label: "Nova senha", type: "password", required: true }]
                  : [
                      { name: "email", label: "E-mail", type: "email", required: true },
                      ...(mode === "forgot"
                        ? []
                        : [{ name: "password", label: "Senha", type: "password" as const, required: true }]),
                      ...(mode === "register"
                        ? [{ name: "name", label: "Nome completo", required: true }]
                        : []),
                    ]
          }
          submitLabel={
            mode === "login"
              ? "Entrar"
              : mode === "mfa"
                ? "Confirmar código"
                : mode === "register"
                  ? "Criar conta"
                  : mode === "verify"
                    ? "Confirmar e-mail"
                    : "Continuar"
          }
          onSubmit={async (values) => {
            if (mode === "login") {
              const credentials = { email: String(values.email), password: String(values.password) };
              const result = await onLogin(credentials);
              if (result.mfaRequired) {
                setLoginCredentials(credentials);
                setMode("mfa");
                setMessage("Sua conta usa autenticação em duas etapas. Informe o código do autenticador.");
              }
            }
            if (mode === "mfa" && loginCredentials)
              await onLogin({ ...loginCredentials, otp: String(values.otp) });
            if (mode === "register") {
              await api.register({
                name: String(values.name),
                email: String(values.email),
                password: String(values.password),
              });
              setMode("login");
              setMessage("Confira seu e-mail para confirmar o cadastro. Depois, entre na sua conta.");
              setMailpitHelp(true);
            }
            if (mode === "forgot") {
              await send("/api/v1/auth/forgot-password", "POST", { email: values.email });
              setMessage("Se a conta existir, enviaremos instruções de recuperação.");
            }
            if (mode === "reset") {
              await send("/api/v1/auth/reset-password", "POST", {
                token: tokenAction?.token,
                password: values.password,
              });
              history.replaceState(null, "", location.pathname);
              setMode("login");
              setMessage("Senha atualizada. Entre novamente.");
            }
            if (mode === "verify") {
              await send("/api/v1/auth/verify-email", "POST", { token: tokenAction?.token });
              history.replaceState(null, "", location.pathname);
              setMode("login");
              setMessage("E-mail confirmado. Entre para continuar.");
            }
          }}
        />
        <div className="auth-links">
          {mode === "login" ? (
            <>
              <button className="text-button" onClick={() => setMode("register")}>
                Primeira vez aqui? Criar conta
              </button>
              <button className="text-button" onClick={() => setMode("forgot")}>
                Esqueci minha senha
              </button>
            </>
          ) : (
            <button
              className="text-button"
              onClick={() => {
                setMode("login");
                setMessage("");
              }}
            >
              Voltar ao login
            </button>
          )}
        </div>
        {mailpitHelp && mode === "login" && (
          <p className="subtitle" role="status">
            Em desenvolvimento, abra o{" "}
            <a href="http://localhost:8025" target="_blank" rel="noreferrer">
              Mailpit
            </a>
            , procure “Verifique seu e-mail no FamilyHub” e clique no link da mensagem. O link abre esta
            página; confirme e depois entre normalmente. O worker de e-mail é iniciado junto com{" "}
            <code>npm run dev</code>.
          </p>
        )}
        {mode === "verify" && (
          <p className="subtitle">
            O link do e-mail abriu esta tela. Clique em “Confirmar e-mail” para validar sua conta e depois
            entre normalmente.
          </p>
        )}
        <p className="subtitle">
          Seus dados de conta e rotina são usados para organizar sua família. Preferências e solicitações
          ficam na área Privacidade.
        </p>
      </section>
    </main>
  );
}
