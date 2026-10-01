import { useQuery } from "@tanstack/react-query";
import { apiRequest, send } from "../../api/client";
import { downloadData } from "../../api/domain";
import { RecordForm } from "../../components/forms/RecordForm";
import { AsyncState } from "../../components/ui/AsyncState";
import { useRefresh } from "../useFamilyData";
type Privacy = {
  contact: string | null;
  categories: string[];
  consentPreferences: { optionalCommunications: boolean };
  requests: { id: string; kind: string; status: string; createdAt: string; resolutionNote: string | null }[];
};
export function PrivacyPage({ familyId }: { familyId?: string }) {
  const query = useQuery({ queryKey: ["privacy"], queryFn: () => apiRequest<Privacy>("/api/v1/privacy") });
  const refresh = useRefresh();
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">SEUS DADOS</p>
          <h1>Privacidade</h1>
          <p className="subtitle">Veja o que é tratado e acompanhe suas solicitações.</p>
        </div>
      </div>
      <AsyncState pending={query.isPending} error={query.error} retry={query.refetch}>
        {query.data && (
          <>
            <section className="panel">
              <h2>Categorias de dados</h2>
              <p>{query.data.categories.join(" · ")}</p>
              <p>
                Dados familiares são compartilhados conforme o papel de cada membro. Saúde, crianças,
                documentos e finanças têm permissões específicas.
              </p>
              <p>
                Arquivos removidos deixam de estar disponíveis no aplicativo; o descarte do objeto é
                processado em segundo plano. Backups seguem o ciclo da instalação.
              </p>
              {query.data.contact ? (
                <p>Contato de privacidade: {query.data.contact}</p>
              ) : (
                <p>O responsável por esta instalação ainda não definiu o contato de privacidade.</p>
              )}
            </section>
            <section className="panel section-gap">
              <h2>Solicitar exportação, correção ou exclusão</h2>
              <p>
                Exportações são geradas imediatamente. Pedidos de correção e exclusão passam por revisão
                manual auditada; concluir uma solicitação não apaga automaticamente dados compartilhados.
              </p>
              <RecordForm
                fields={[
                  {
                    name: "kind",
                    label: "Solicitação",
                    type: "select",
                    required: true,
                    options: [
                      { value: "EXPORT", label: "Exportar dados" },
                      { value: "CORRECTION", label: "Solicitar correção" },
                      { value: "DELETE", label: "Solicitar exclusão" },
                    ],
                  },
                  {
                    name: "scope",
                    label: "Dados solicitados",
                    type: "multiselect",
                    options: [
                      { value: "account", label: "Minha conta" },
                      { value: "routine", label: "Rotina da família" },
                      { value: "children", label: "Crianças (restrito)" },
                      { value: "health", label: "Saúde (restrito)" },
                      { value: "documents", label: "Metadados dos documentos (restrito)" },
                      { value: "finance", label: "Financeiro (restrito)" },
                    ],
                  },
                  { name: "note", label: "Observação", type: "textarea" },
                  { name: "password", label: "Confirme sua senha", type: "password", required: true },
                ]}
                initial={{ kind: "EXPORT", scope: ["account"] }}
                submitLabel="Enviar solicitação"
                onSubmit={async (values) => {
                  const result = await send<{ data?: unknown }>("/api/v1/privacy/requests", "POST", {
                    ...values,
                    ...(familyId ? { familyId } : {}),
                  });
                  if (result.data) downloadData(result.data, "familyhub-dados.json");
                  await refresh();
                }}
              />
            </section>
            <section className="panel section-gap">
              <h2>Comunicações opcionais</h2>
              <RecordForm
                key={String(query.data.consentPreferences.optionalCommunications)}
                fields={[
                  {
                    name: "optionalCommunications",
                    label: "Permitir comunicações opcionais",
                    type: "checkbox",
                  },
                ]}
                initial={query.data.consentPreferences}
                onSubmit={async (values) => {
                  await send("/api/v1/privacy/consents", "PUT", values);
                  await refresh();
                }}
              />
            </section>
            <section className="panel section-gap">
              <h2>Histórico de solicitações</h2>
              {query.data.requests.length === 0 && <p>Nenhuma solicitação registrada.</p>}
              {query.data.requests.map((item) => (
                <div className="compact-row" key={item.id}>
                  <b>
                    {item.kind === "EXPORT" ? "Exportação" : item.kind === "DELETE" ? "Exclusão" : "Correção"}
                  </b>
                  <small>
                    {{
                      REQUESTED: "Solicitada",
                      IN_REVIEW: "Em análise",
                      COMPLETED: "Concluída",
                      REJECTED: "Não aprovada",
                    }[item.status] ?? item.status}{" "}
                    · {new Date(item.createdAt).toLocaleString("pt-BR")}
                  </small>
                  {item.resolutionNote && <p>{item.resolutionNote}</p>}
                </div>
              ))}
            </section>
          </>
        )}
      </AsyncState>
    </>
  );
}
