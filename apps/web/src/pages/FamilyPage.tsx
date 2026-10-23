import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { familyApi, type Family } from "../api/families";
import { apiRequest, send } from "../api/client";
import { domainApi } from "../api/domain";
import { useRefresh } from "../features/useFamilyData";
import { RecordForm } from "../components/forms/RecordForm";
import { AsyncState } from "../components/ui/AsyncState";
import { PhotoPicker } from "../components/forms/PhotoPicker";
import { GoogleCalendarSettings } from "../features/family/GoogleCalendarSettings";
type Invite = {
  id: string;
  email: string | null;
  role: string;
  expiresAt: string;
  usedAt: string | null;
  revokedAt: string | null;
};
export function FamilyPage({ family, admin }: { family: Family; admin: boolean }) {
  const [photo, setPhoto] = useState(family.avatarUrl);
  const [created, setCreated] = useState<{ code: string; link: string } | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const refresh = useRefresh();
  const members = useQuery({ queryKey: ["members", family.id], queryFn: () => domainApi.members(family.id) });
  const invites = useQuery({
    queryKey: ["invites", family.id],
    queryFn: () => apiRequest<Invite[]>("/api/v1/families/" + family.id + "/invites"),
    enabled: admin,
  });
  const [inviteOpen, setInviteOpen] = useState(false);
  const prefs = family.notificationPreferences ?? { tasks: true, events: true, shopping: true, push: true };
  async function act(work: () => Promise<unknown>) {
    setError("");
    try {
      await work();
      await refresh();
      setNotice("Configuração atualizada.");
    } catch (error) {
      setError((error as Error).message);
    }
  }
  const roles = [
    { value: "ADMIN", label: "Administrador" },
    { value: "MEMBER", label: "Membro" },
    { value: "VIEWER", label: "Visualizador" },
  ];
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">NOSSO ESPAÇO</p>
          <h1>{family.name}</h1>
          <p className="subtitle">Pessoas, preferências e convites.</p>
        </div>
      </div>
      {notice && (
        <p className="form-notice" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="family-settings-grid">
        <section className="panel">
          <h2>Informações da família</h2>
          {admin ? (
            <>
              <PhotoPicker value={photo} onChange={setPhoto} />
              <RecordForm
                fields={[
                  { name: "name", label: "Nome", required: true },
                  {
                    name: "timezone",
                    label: "Fuso horário IANA",
                    required: true,
                    hint: "Ex.: America/Sao_Paulo, Europe/Lisbon",
                  },
                ]}
                initial={{ name: family.name, timezone: family.timezone }}
                onSubmit={async (values) => {
                  await familyApi.update(family.id, { ...values, avatarUrl: photo });
                  await refresh();
                  setNotice("Família atualizada.");
                }}
              />
            </>
          ) : (
            <>
              <p>{family.name}</p>
              <p>{family.timezone}</p>
              <p className="subtitle">Somente administradores podem editar.</p>
            </>
          )}
        </section>
        <section className="panel">
          <h2>Convidar alguém</h2>
          <p>Convites são de uso único e expiram em 7 dias. Um novo convite é necessário para cada pessoa.</p>
          {admin ? (
            <>
              <button className="button button-primary" onClick={() => setInviteOpen(!inviteOpen)}>
                Criar convite
              </button>
              {inviteOpen && (
                <RecordForm
                  fields={[
                    { name: "email", label: "E-mail do convidado (opcional)", type: "email" },
                    { name: "role", label: "Papel", type: "select", required: true, options: roles },
                  ]}
                  initial={{ role: "MEMBER" }}
                  submitLabel="Gerar link e código"
                  onSubmit={async (values) => {
                    const result = await send<{ code: string; link: string }>(
                      "/api/v1/families/" + family.id + "/invites",
                      "POST",
                      { role: values.role, ...(values.email ? { email: values.email } : {}) },
                    );
                    setCreated(result);
                    setInviteOpen(false);
                    await refresh();
                  }}
                />
              )}
              {created && (
                <div className="invite-result">
                  <code>{created.code}</code>
                  <p>Copie agora. O código não poderá ser consultado novamente.</p>
                  <button
                    className="button button-secondary"
                    onClick={() =>
                      act(async () => {
                        await navigator.clipboard.writeText(created.link);
                        setNotice("Link copiado.");
                      })
                    }
                  >
                    Copiar link
                  </button>
                  <button
                    className="text-button"
                    onClick={() => act(() => navigator.clipboard.writeText(created.code))}
                  >
                    Copiar código
                  </button>
                  <input aria-label="Link do convite" readOnly value={created.link} />
                </div>
              )}
              <AsyncState pending={invites.isPending} error={invites.error} retry={invites.refetch}>
                {invites.data?.map((invite) => (
                  <div className="compact-row" key={invite.id}>
                    <div>
                      <b>{invite.email ?? "Convite por link"}</b>
                      <small>
                        {invite.usedAt
                          ? "Aceito"
                          : invite.revokedAt
                            ? "Revogado"
                            : new Date(invite.expiresAt) < new Date()
                              ? "Expirado"
                              : "Pendente"}
                      </small>
                    </div>
                    {!invite.usedAt && !invite.revokedAt && (
                      <button
                        className="danger-button"
                        onClick={() =>
                          act(() => send("/api/v1/families/" + family.id + "/invites/" + invite.id, "DELETE"))
                        }
                      >
                        Revogar
                      </button>
                    )}
                  </div>
                ))}
              </AsyncState>
            </>
          ) : (
            <p className="subtitle">Peça a um administrador para gerar convites.</p>
          )}
        </section>
      </div>
      <section className="panel section-gap">
        <h2>Membros</h2>
        <AsyncState pending={members.isPending} error={members.error} retry={members.refetch}>
          {members.data?.map((member) => (
            <article className="record-row" key={member.id}>
              <div>
                <h3>{member.user.name}</h3>
                <small>{roles.find((role) => role.value === member.role)?.label}</small>
              </div>
              {admin && <GoogleCalendarSettings familyId={family.id} />}
              {admin && (
                <div className="member-controls">
                  <label>
                    Papel
                    <select
                      value={member.role}
                      onChange={(event) =>
                        act(() =>
                          send("/api/v1/families/" + family.id + "/members/" + member.id, "PATCH", {
                            role: event.target.value,
                          }),
                        )
                      }
                    >
                      {roles.map((role) => (
                        <option key={role.value} value={role.value}>
                          {role.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {member.role === "MEMBER" && (
                    <fieldset>
                      <legend>Acesso a dados restritos</legend>
                      {[
                        ["children", "Crianças"],
                        ["health", "Saúde"],
                        ["documents", "Documentos"],
                        ["finance", "Financeiro"],
                      ].map(([key, label]) => (
                        <label className="check-row" key={key}>
                          <input
                            type="checkbox"
                            checked={member.sensitivePermissions.includes(key)}
                            onChange={(event) =>
                              act(() =>
                                send("/api/v1/families/" + family.id + "/members/" + member.id, "PATCH", {
                                  sensitivePermissions: event.target.checked
                                    ? [...member.sensitivePermissions, key]
                                    : member.sensitivePermissions.filter((item) => item !== key),
                                }),
                              )
                            }
                          />
                          {label}
                        </label>
                      ))}
                    </fieldset>
                  )}
                  <button
                    className="danger-button"
                    onClick={() => {
                      if (confirm("Remover este membro da família?"))
                        void act(() =>
                          send("/api/v1/families/" + family.id + "/members/" + member.id, "PATCH", {
                            status: "REVOKED",
                          }),
                        );
                    }}
                  >
                    Remover
                  </button>
                </div>
              )}
            </article>
          ))}
        </AsyncState>
      </section>
      {admin && (
        <section className="panel section-gap">
          <h2>Notificações da família</h2>
          <RecordForm
            fields={["tasks", "events", "shopping"].map((name, index) => ({
              name,
              label: ["Tarefas", "Eventos", "Compras"][index],
              type: "checkbox" as const,
            }))}
            initial={prefs}
            onSubmit={async (values) => {
              await familyApi.update(family.id, {
                notificationPreferences: { ...prefs, ...values, push: true },
              });
              await refresh();
              setNotice("Preferências salvas.");
            }}
          />
        </section>
      )}
    </>
  );
}
