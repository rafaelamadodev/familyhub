import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, apiRequest, send, type User } from "../api/client";
import { RecordForm } from "../components/forms/RecordForm";
import { PhotoPicker } from "../components/forms/PhotoPicker";
import { useRefresh } from "../features/useFamilyData";
import { AsyncState } from "../components/ui/AsyncState";
type Session = { id: string; device: string | null; createdAt: string; expiresAt: string; current: boolean };
export function ProfilePage({
  user,
  onUser,
  onSessionEnded,
}: {
  user: User;
  onUser: (user: User) => void;
  onSessionEnded: () => void;
}) {
  const [photo, setPhoto] = useState(user.photoUrl);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const refresh = useRefresh();
  const [mfaSetup, setMfaSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const sessions = useQuery({
    queryKey: ["sessions"],
    queryFn: () => apiRequest<Session[]>("/api/v1/auth/sessions"),
  });
  const mfa = useQuery({
    queryKey: ["mfa"],
    queryFn: () => apiRequest<{ enabled: boolean }>("/api/v1/auth/mfa"),
  });
  const preferences = useQuery({
    queryKey: ["notification-preferences"],
    queryFn: () => apiRequest<Record<string, boolean>>("/api/v1/notification-preferences"),
  });
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">SUA CONTA</p>
          <h1>Perfil e segurança</h1>
        </div>
      </div>
      {notice && (
        <p className="form-notice" role="status">
          {notice}
        </p>
      )}
      {error && <p className="form-error">{error}</p>}
      <div className="profile-grid">
        <section className="panel">
          <h2>Informações pessoais</h2>
          <PhotoPicker value={photo} onChange={setPhoto} />
          <RecordForm
            fields={[
              { name: "name", label: "Nome", required: true },
              { name: "email", label: "E-mail", type: "email", required: true },
              {
                name: "currentPassword",
                label: "Senha atual (necessária para alterar o e-mail)",
                type: "password",
              },
            ]}
            initial={{ name: user.name, email: user.email }}
            onSubmit={async (values) => {
              const result = await api.updateProfile({
                name: String(values.name),
                email: String(values.email),
                currentPassword: String(values.currentPassword),
                photoUrl: photo,
              });
              onUser(result.user);
              await refresh();
              setNotice("Informações atualizadas.");
            }}
          />
        </section>
        <section className="panel">
          <h2>Trocar senha</h2>
          <RecordForm
            fields={[
              { name: "currentPassword", label: "Senha atual", type: "password", required: true },
              {
                name: "newPassword",
                label: "Nova senha (mínimo 8 caracteres)",
                type: "password",
                required: true,
              },
            ]}
            submitLabel="Alterar senha"
            onSubmit={async (values) => {
              await api.updatePassword({
                currentPassword: String(values.currentPassword),
                newPassword: String(values.newPassword),
              });
              onSessionEnded();
            }}
          />
          <p className="subtitle">A troca de senha encerra todas as sessões.</p>
        </section>
      </div>
      <section className="panel section-gap">
        <h2>Dispositivos e sessões</h2>
        <AsyncState pending={sessions.isPending} error={sessions.error} retry={sessions.refetch}>
          {sessions.data?.map((session) => (
            <div className="record-row" key={session.id}>
              <div>
                <b>{session.current ? "Esta sessão" : "Outra sessão"}</b>
                <p className="device-label">{session.device ?? "Dispositivo não identificado"}</p>
                <small>Iniciada em {new Date(session.createdAt).toLocaleString("pt-BR")}</small>
              </div>
              <button
                className="danger-button"
                onClick={async () => {
                  try {
                    await send("/api/v1/auth/sessions/" + session.id, "DELETE");
                    if (session.current) onSessionEnded();
                    else await refresh();
                  } catch (error) {
                    setError((error as Error).message);
                  }
                }}
              >
                Encerrar
              </button>
            </div>
          ))}
        </AsyncState>
        <button
          className="button button-secondary"
          onClick={async () => {
            try {
              await send("/api/v1/auth/logout-all", "POST");
              onSessionEnded();
            } catch (error) {
              setError((error as Error).message);
            }
          }}
        >
          Sair de todos os dispositivos
        </button>
      </section>
      <section className="panel section-gap">
        <h2>Autenticação em duas etapas</h2>
        <p className="subtitle">Adicione um código TOTP gerado por um app autenticador.</p>
        <AsyncState pending={mfa.isPending} error={mfa.error} retry={mfa.refetch}>
          {mfa.data?.enabled ? (
            <RecordForm
              fields={[
                { name: "password", label: "Senha atual", type: "password", required: true },
                { name: "code", label: "Código do autenticador", required: true, maxLength: 6 },
              ]}
              submitLabel="Desativar MFA"
              onSubmit={async (values) => {
                await send("/api/v1/auth/mfa/disable", "POST", {
                  password: values.password,
                  code: values.code,
                });
                setMfaSetup(null);
                await mfa.refetch();
                setNotice("Autenticação em duas etapas desativada.");
              }}
            />
          ) : mfaSetup ? (
            <>
              <p>
                Cadastre esta chave no seu autenticador: <code>{mfaSetup.secret}</code>
              </p>
              <p className="device-label">{mfaSetup.otpauthUrl}</p>
              <RecordForm
                fields={[
                  { name: "code", label: "Código exibido no autenticador", required: true, maxLength: 6 },
                ]}
                submitLabel="Confirmar e ativar"
                onSubmit={async (values) => {
                  await send("/api/v1/auth/mfa/enable", "POST", {
                    secret: mfaSetup.secret,
                    code: values.code,
                  });
                  setMfaSetup(null);
                  await mfa.refetch();
                  setNotice("MFA ativado. Use um código ao entrar.");
                }}
              />
            </>
          ) : (
            <button
              className="button button-secondary"
              onClick={async () => {
                try {
                  setMfaSetup(await send("/api/v1/auth/mfa/setup", "POST"));
                } catch (error) {
                  setError((error as Error).message);
                }
              }}
            >
              Configurar MFA
            </button>
          )}
        </AsyncState>
      </section>
      <section className="panel section-gap">
        <h2>Minhas notificações</h2>
        <AsyncState pending={preferences.isPending} error={preferences.error} retry={preferences.refetch}>
          {preferences.data && (
            <RecordForm
              fields={["tasks", "events", "shopping", "push"].map((name, index) => ({
                name,
                label: ["Tarefas", "Eventos", "Compras", "Push no celular"][index],
                type: "checkbox" as const,
              }))}
              initial={preferences.data}
              onSubmit={async (values) => {
                await send("/api/v1/notification-preferences", "PUT", values);
                await refresh();
                setNotice("Preferências salvas.");
              }}
            />
          )}
        </AsyncState>
      </section>
    </>
  );
}
