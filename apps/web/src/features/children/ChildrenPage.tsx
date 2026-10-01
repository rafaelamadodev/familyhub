import { useState } from "react";
import { domainApi } from "../../api/domain";
import { RecordForm } from "../../components/forms/RecordForm";
import { AsyncState } from "../../components/ui/AsyncState";
import { useFamilyData, useRefresh } from "../useFamilyData";
import { HealthPage } from "../health/HealthPage";
import { GrowthPage } from "./GrowthPage";
import { DocumentsPage } from "../documents/DocumentsPage";
type Child = {
  id: string;
  name: string;
  birthDate: string | null;
  relationship: string | null;
  note: string | null;
  blockedModules: string[];
};
export function ChildrenPage({
  familyId,
  timezone,
  admin,
}: {
  familyId: string;
  timezone: string;
  admin: boolean;
}) {
  const query = useFamilyData<Child[]>("children", familyId);
  const refresh = useRefresh();
  const [editing, setEditing] = useState<Child | "new" | null>(null);
  const [selected, setSelected] = useState<Child | null>(null);
  const [tab, setTab] = useState("summary");
  const active = query.data?.find((child) => child.id === selected?.id);
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">CUIDADOS DA FAMÍLIA</p>
          <h1>{active?.name ?? "Crianças"}</h1>
          <p className="subtitle">Perfis privados, acessíveis apenas a pessoas autorizadas.</p>
        </div>
        <button className="button button-primary" onClick={() => setEditing("new")}>
          ＋ Novo perfil
        </button>
      </div>
      {editing && (
        <section className="panel editor">
          <RecordForm
            key={editing === "new" ? "new" : editing.id}
            fields={[
              { name: "name", label: "Nome", required: true },
              { name: "birthDate", label: "Nascimento", type: "date" },
              { name: "relationship", label: "Relação com o responsável" },
              { name: "note", label: "Observação não sensível", type: "textarea" },
              ...(admin
                ? [
                    {
                      name: "blockedModules",
                      label: "Bloquear módulos neste perfil",
                      type: "multiselect" as const,
                      options: [
                        { value: "health", label: "Saúde" },
                        { value: "documents", label: "Documentos" },
                      ],
                    },
                  ]
                : []),
            ]}
            initial={
              editing === "new"
                ? {}
                : {
                    name: editing.name,
                    birthDate: editing.birthDate?.slice(0, 10) ?? "",
                    relationship: editing.relationship,
                    note: editing.note,
                    blockedModules: editing.blockedModules,
                  }
            }
            onCancel={() => setEditing(null)}
            onSubmit={async (values) => {
              const body = { ...values, birthDate: values.birthDate || null };
              if (editing === "new") await domainApi.create("children", { ...body, familyId });
              else await domainApi.update("children", editing.id, body);
              setEditing(null);
              await refresh();
            }}
          />
        </section>
      )}
      <AsyncState pending={query.isPending} error={query.error} retry={query.refetch}>
        {!active ? (
          <div className="record-list">
            {query.data?.map((child) => (
              <article className="record-row" key={child.id}>
                <div>
                  <h3>{child.name}</h3>
                  <p>
                    {child.birthDate?.slice(0, 10)} · {child.relationship}
                  </p>
                </div>
                <button
                  className="button button-secondary"
                  onClick={() => {
                    setSelected(child);
                    setTab("summary");
                  }}
                >
                  Abrir perfil
                </button>
              </article>
            ))}
            {!query.data?.length && (
              <div className="empty-state">
                <h2>Nenhum perfil cadastrado</h2>
                <p>Crie um perfil para organizar os registros da criança.</p>
              </div>
            )}
          </div>
        ) : (
          <>
            <button className="text-button" onClick={() => setSelected(null)}>
              ← Todos os perfis
            </button>
            <div className="tabs">
              {[
                ["summary", "Perfil"],
                ["growth", "Crescimento"],
                ["VACCINE", "Vacinas"],
                ["APPOINTMENT", "Consultas"],
                ["MEDICATION", "Medicamentos"],
                ["documents", "Documentos"],
              ].map(([key, label]) => (
                <button aria-pressed={tab === key} key={key} onClick={() => setTab(key)}>
                  {label}
                </button>
              ))}
            </div>
            {tab === "summary" ? (
              <section className="panel">
                <h2>{active.name}</h2>
                <p>Nascimento: {active.birthDate?.slice(0, 10) ?? "Não informado"}</p>
                <p>{active.relationship}</p>
                <p>{active.note}</p>
                <button className="text-button" onClick={() => setEditing(active)}>
                  Editar perfil
                </button>
              </section>
            ) : active.blockedModules.includes(tab === "documents" ? "documents" : "health") ? (
              <p className="form-notice">
                Este módulo está bloqueado no perfil. Um administrador pode alterar a configuração.
              </p>
            ) : tab === "growth" ? (
              <GrowthPage familyId={familyId} childId={active.id} />
            ) : tab === "documents" ? (
              <DocumentsPage familyId={familyId} childId={active.id} />
            ) : (
              <HealthPage
                key={tab}
                familyId={familyId}
                timezone={timezone}
                childId={active.id}
                category={tab}
              />
            )}
          </>
        )}
      </AsyncState>
    </>
  );
}
