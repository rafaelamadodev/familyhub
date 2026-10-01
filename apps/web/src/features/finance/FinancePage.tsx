import { useState } from "react";
import { send } from "../../api/client";
import { domainApi, downloadData } from "../../api/domain";
import { RecordForm, type Field } from "../../components/forms/RecordForm";
import { AsyncState } from "../../components/ui/AsyncState";
import { useFamilyData, useRefresh } from "../useFamilyData";
type Entry = {
  id: string;
  description: string;
  amount: string;
  category: string;
  competence: string;
  status: string;
  recurrence: string | null;
};
const currency = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export function FinancePage({ familyId }: { familyId: string }) {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const query = useFamilyData<{ entries: Entry[]; total: number }>("finance", familyId, "&month=" + month);
  const refresh = useRefresh();
  const [editing, setEditing] = useState<Entry | "new" | null>(null);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const fields: Field[] = [
    { name: "description", label: "Descrição", required: true },
    { name: "amount", label: "Valor (R$)", type: "number", required: true, min: 0.01, step: "0.01" },
    { name: "category", label: "Categoria", required: true },
    { name: "competence", label: "Competência", type: "month", required: true },
    {
      name: "status",
      label: "Situação",
      type: "select",
      required: true,
      options: [
        { value: "PLANNED", label: "Prevista" },
        { value: "PAID", label: "Paga" },
        { value: "CANCELLED", label: "Cancelada" },
      ],
    },
    {
      name: "recurrence",
      label: "Recorrência",
      type: "select",
      options: [{ value: "MONTHLY", label: "Mensal (próxima após pagamento)" }],
    },
  ];
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">ORGANIZAÇÃO FINANCEIRA</p>
          <h1>Contas da família</h1>
          <p className="subtitle">Registre valores e categorias. Não informe números de cartão ou CVV.</p>
        </div>
        <button className="button button-primary" onClick={() => setEditing("new")}>
          ＋ Nova conta
        </button>
      </div>
      <div className="filters">
        <label>
          Competência
          <input
            type="month"
            value={month}
            onChange={(e) => {
              if (e.target.value) setMonth(e.target.value);
            }}
          />
        </label>
        <button className="text-button" onClick={() => setExporting(!exporting)}>
          Exportar dados
        </button>
      </div>
      {editing && (
        <section className="panel editor">
          <RecordForm
            fields={fields}
            key={editing === "new" ? "new" : editing.id}
            initial={
              editing === "new"
                ? { competence: month, status: "PLANNED" }
                : {
                    description: editing.description,
                    amount: Number(editing.amount),
                    category: editing.category,
                    competence: editing.competence.slice(0, 7),
                    status: editing.status,
                    recurrence: editing.recurrence,
                  }
            }
            onCancel={() => setEditing(null)}
            onSubmit={async (values) => {
              const body = { ...values, recurrence: values.recurrence || null };
              if (editing === "new") await domainApi.create("finance", { ...body, familyId });
              else await domainApi.update("finance", editing.id, body);
              setEditing(null);
              await refresh();
            }}
          />
        </section>
      )}
      {exporting && (
        <section className="panel editor">
          <RecordForm
            fields={[
              { name: "password", label: "Confirme sua senha", type: "password", required: true },
              {
                name: "format",
                label: "Formato",
                type: "select",
                required: true,
                options: [
                  { value: "json", label: "JSON" },
                  { value: "csv", label: "CSV" },
                ],
              },
            ]}
            initial={{ format: "csv" }}
            submitLabel="Exportar"
            onCancel={() => setExporting(false)}
            onSubmit={async (values) => {
              const result = await send("/api/v1/finance/export", "POST", { ...values, familyId });
              downloadData(result, "financeiro." + values.format, values.format === "csv");
              setExporting(false);
            }}
          />
        </section>
      )}
      {error && <p className="form-error">{error}</p>}
      <AsyncState pending={query.isPending} error={query.error} retry={query.refetch}>
        <section className="summary mint">
          <span>Total previsto no mês</span>
          <strong>{currency(query.data?.total ?? 0)}</strong>
          <small>Contas previstas e pagas, sem canceladas.</small>
        </section>
        <div className="record-list">
          {query.data?.entries.map((entry) => (
            <article className="record-row" key={entry.id}>
              <div>
                <h3>{entry.description}</h3>
                <p>
                  {entry.category} ·{" "}
                  {entry.status === "PAID" ? "Paga" : entry.status === "CANCELLED" ? "Cancelada" : "Prevista"}
                </p>
                <b>{currency(Number(entry.amount))}</b>
              </div>
              <div className="actions">
                <button className="text-button" onClick={() => setEditing(entry)}>
                  Editar / pagar
                </button>
                <button
                  className="danger-button"
                  onClick={async () => {
                    if (!confirm("Excluir esta conta?")) return;
                    try {
                      await domainApi.remove("finance", entry.id);
                      await refresh();
                    } catch (error) {
                      setError((error as Error).message);
                    }
                  }}
                >
                  Excluir
                </button>
              </div>
            </article>
          ))}
          {!query.data?.entries.length && (
            <div className="empty-state">
              <h2>Nenhuma conta neste mês</h2>
              <p>Registre a primeira despesa para acompanhar o total previsto.</p>
            </div>
          )}
        </div>
      </AsyncState>
    </>
  );
}
