import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { API_URL, apiRequest, send } from "../../api/client";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { ToastMessage } from "../../components/ui/ToastMessage";

type Integration = {
  configured: boolean;
  connected: boolean;
  calendarId: string | null;
  calendarSummary: string | null;
  connectedAt: string | null;
};
type Calendar = { id: string; summary: string; primary: boolean };

export function GoogleCalendarSettings({ familyId }: { familyId: string }) {
  const client = useQueryClient();
  const [feedback, setFeedback] = useState<{
    kind: "success" | "error";
    title: string;
    message: string;
  } | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [busy, setBusy] = useState(false);
  const integration = useQuery({
    queryKey: ["google-calendar", familyId],
    queryFn: () => apiRequest<Integration>(`/api/v1/integrations/google-calendar?familyId=${familyId}`),
  });
  const calendars = useQuery({
    queryKey: ["google-calendars", familyId],
    queryFn: () =>
      apiRequest<Calendar[]>(`/api/v1/integrations/google-calendar/calendars?familyId=${familyId}`),
    enabled: Boolean(integration.data?.connected),
  });
  const connectUrl = `${API_URL}/api/v1/integrations/google-calendar/connect?familyId=${encodeURIComponent(familyId)}`;

  useEffect(() => {
    if (!feedback) return;
    const timeout = window.setTimeout(() => setFeedback(null), 5500);
    return () => window.clearTimeout(timeout);
  }, [feedback]);

  return (
    <section className="panel section-gap google-calendar-panel">
      <div className="google-calendar-heading">
        <div>
          <h2>Google Agenda</h2>
          <p>Os compromissos criados no FamilyHub podem ser enviados para um calendário Google da família.</p>
        </div>
        <span className={`integration-status ${integration.data?.connected ? "is-connected" : ""}`}>
          {integration.isPending
            ? "Verificando…"
            : integration.data?.connected
              ? "Conectado"
              : "Desconectado"}
        </span>
      </div>
      {integration.isError && <p className="form-error">{integration.error.message}</p>}
      {integration.data?.connected ? (
        <>
          <label className="google-calendar-select">
            Calendário de destino
            <select
              value={integration.data.calendarId ?? ""}
              disabled={calendars.isPending}
              onChange={async (event) => {
                try {
                  await send("/api/v1/integrations/google-calendar/calendar", "PUT", {
                    familyId,
                    calendarId: event.target.value,
                  });
                  await client.invalidateQueries({ queryKey: ["google-calendar", familyId] });
                  await client.invalidateQueries({ queryKey: ["events", familyId] });
                  setFeedback({
                    kind: "success",
                    title: "Calendário atualizado",
                    message: "Os próximos compromissos serão enviados para este calendário.",
                  });
                } catch (error) {
                  setFeedback({
                    kind: "error",
                    title: "Não foi possível alterar o calendário",
                    message: (error as Error).message,
                  });
                }
              }}
            >
              {calendars.data?.map((calendar) => (
                <option key={calendar.id} value={calendar.id}>
                  {calendar.summary}
                  {calendar.primary ? " · principal" : ""}
                </option>
              ))}
            </select>
          </label>
          {calendars.isError && <p className="form-error">{calendars.error.message}</p>}
          <p className="subtitle">
            A sincronização é em uma direção. Alterações feitas diretamente no Google ainda não retornam ao
            FamilyHub.
          </p>
          <div className="actions">
            <button
              className="button button-secondary"
              onClick={async () => {
                try {
                  setBusy(true);
                  const result = await send<{ processed: number; synced: number; failed: number }>(
                    "/api/v1/integrations/google-calendar/sync",
                    "POST",
                    { familyId },
                  );
                  setFeedback({
                    kind: result.failed ? "error" : "success",
                    title: result.failed ? "Sincronização parcial" : "Agenda atualizada",
                    message: result.failed
                      ? `${result.synced} de ${result.processed} compromissos sincronizados; ${result.failed} não puderam ser enviados.`
                      : result.synced
                        ? `${result.synced} compromisso${result.synced === 1 ? "" : "s"} sincronizado${result.synced === 1 ? "" : "s"} com o Google Agenda.`
                        : "Seus compromissos já estão sincronizados.",
                  });
                  await client.invalidateQueries({ queryKey: ["events", familyId] });
                } catch (error) {
                  setFeedback({
                    kind: "error",
                    title: "Falha ao sincronizar",
                    message: (error as Error).message,
                  });
                } finally {
                  setBusy(false);
                }
              }}
              disabled={busy}
            >
              {busy ? "Sincronizando…" : "Sincronizar agora"}
            </button>
            <button className="danger-button" onClick={() => setConfirmDisconnect(true)}>
              Desconectar
            </button>
          </div>
        </>
      ) : integration.data?.configured ? (
        <>
          <p>Conecte a conta Google que receberá os compromissos desta família.</p>
          <a className="button button-primary" href={connectUrl}>
            Conectar Google Agenda
          </a>
        </>
      ) : (
        <p>
          Integração ainda não configurada neste servidor. Siga o guia de configuração do Google Cloud para
          habilitá-la.
        </p>
      )}
      <p className="integration-privacy">
        Títulos, horários, descrições e locais dos eventos agendados serão enviados ao Google. Dados de saúde
        e perfis de crianças não são sincronizados.
      </p>
      {feedback && <ToastMessage {...feedback} onDismiss={() => setFeedback(null)} />}
      {confirmDisconnect && (
        <ConfirmDialog
          title="Desconectar o Google Agenda?"
          description="Os eventos já copiados continuarão no Google Agenda. Novos compromissos deixarão de ser sincronizados até você conectar novamente."
          confirmLabel="Desconectar"
          busy={busy}
          onCancel={() => setConfirmDisconnect(false)}
          onConfirm={async () => {
            setBusy(true);
            try {
              await send(`/api/v1/integrations/google-calendar?familyId=${familyId}`, "DELETE");
              await client.invalidateQueries({ queryKey: ["google-calendar", familyId] });
              await client.invalidateQueries({ queryKey: ["events", familyId] });
              setConfirmDisconnect(false);
              setFeedback({
                kind: "success",
                title: "Agenda desconectada",
                message: "Os eventos existentes permanecem no Google Agenda.",
              });
            } catch (error) {
              setConfirmDisconnect(false);
              setFeedback({
                kind: "error",
                title: "Não foi possível desconectar",
                message: (error as Error).message,
              });
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
    </section>
  );
}
