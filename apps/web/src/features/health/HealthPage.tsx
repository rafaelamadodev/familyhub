import { useState } from "react";
import { domainApi, displayDate, localDateTime } from "../../api/domain";
import { RecordForm, type Field } from "../../components/forms/RecordForm";
import { AsyncState } from "../../components/ui/AsyncState";
import { useFamilyData, useRefresh } from "../useFamilyData";
type HealthRecord = {
  id: string;
  title: string;
  category: string;
  recordDate: string | null;
  notes: string | null;
  professional: string | null;
  specialty: string | null;
  completedAt: string | null;
};
export function HealthPage({
  familyId,
  timezone,
  childId,
  category,
}: {
  familyId: string;
  timezone: string;
  childId?: string;
  category?: string;
}) {
  const query = useFamilyData<HealthRecord[]>(
    "health-records",
    familyId,
    childId ? "&childId=" + childId : "",
  );
  const refresh = useRefresh();
  const [editing, setEditing] = useState<HealthRecord | "new" | null>(null);
  const [error, setError] = useState("");
  const labels: Record<string, string> = {
    VACCINE: "Vacina",
    APPOINTMENT: "Consulta",
    MEDICATION: "Medicamento",
    NOTE: "Anotação",
  };
  const fields: Field[] = [
    {
      name: "category",
      label: "Categoria",
      type: "select",
      required: true,
      options: Object.entries(labels).map(([value, label]) => ({ value, label })),
    },
    { name: "title", label: "Nome ou título", required: true },
    {
      name: "recordDate",
      label: "Data e horário planejado",
      type: "datetime-local",
      hint: "Fuso: " + timezone,
    },
    { name: "professional", label: "Profissional (consulta)" },
    { name: "specialty", label: "Especialidade (consulta)" },
    { name: "notes", label: "Observações", type: "textarea" },
  ];
  async function act(work: () => Promise<unknown>) {
    setError("");
    try {
      await work();
      await refresh();
    } catch (error) {
      setError((error as Error).message);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">ORGANIZADOR PESSOAL</p>
          <h1>Saúde</h1>
        </div>
        <button className="button button-primary" onClick={() => setEditing("new")}>
          ＋ Novo registro
        </button>
      </div>
      <p className="form-notice">
        O FamilyHub organiza registros e horários. Não substitui orientação de um profissional de saúde.
      </p>
      {editing && (
        <section className="panel editor">
          <RecordForm
            fields={fields}
            key={editing === "new" ? "new" : editing.id}
            initial={
              editing === "new"
                ? { category: category ?? "VACCINE" }
                : {
                    category: editing.category,
                    title: editing.title,
                    recordDate: localDateTime(editing.recordDate, timezone),
                    professional: editing.professional,
                    specialty: editing.specialty,
                    notes: editing.notes,
                  }
            }
            onCancel={() => setEditing(null)}
            onSubmit={async (values) => {
              const body = { ...values, recordDate: values.recordDate || null };
              if (editing === "new")
                await domainApi.create("health-records", { ...body, familyId, childId: childId ?? null });
              else await domainApi.update("health-records", editing.id, body);
              setEditing(null);
              await refresh();
            }}
          />
        </section>
      )}
      {error && <p className="form-error">{error}</p>}
      <AsyncState pending={query.isPending} error={query.error} retry={query.refetch}>
        <div className="record-list">
          {query.data
            ?.filter((record) => !category || record.category === category)
            .map((record) => (
              <article className="record-row" key={record.id}>
                <div>
                  <h3>{record.title}</h3>
                  <p>
                    {labels[record.category]} · {displayDate(record.recordDate, timezone)}
                  </p>
                  {record.professional && (
                    <small>
                      {record.professional} · {record.specialty}
                    </small>
                  )}
                  {record.notes && <p>{record.notes}</p>}
                  {record.completedAt && (
                    <small>Concluído em {displayDate(record.completedAt, timezone)}</small>
                  )}
                </div>
                <div className="actions">
                  {record.category === "MEDICATION" && !record.completedAt && (
                    <button
                      className="button button-secondary"
                      onClick={() =>
                        act(() => domainApi.update("health-records", record.id, { completed: true }))
                      }
                    >
                      Registrar dose
                    </button>
                  )}
                  <button className="text-button" onClick={() => setEditing(record)}>
                    Editar
                  </button>
                  <button
                    className="danger-button"
                    onClick={() => {
                      if (confirm("Excluir este registro de saúde?"))
                        void act(() => domainApi.remove("health-records", record.id));
                    }}
                  >
                    Excluir
                  </button>
                </div>
              </article>
            ))}
          {!query.data?.length && (
            <div className="empty-state">
              <h2>Nenhum registro</h2>
              <p>Adicione somente as informações necessárias para sua organização.</p>
            </div>
          )}
        </div>
      </AsyncState>
    </>
  );
}
