import { useState } from "react";
import { domainApi } from "../../api/domain";
import { RecordForm } from "../../components/forms/RecordForm";
import { AsyncState } from "../../components/ui/AsyncState";
import { useFamilyData, useRefresh } from "../useFamilyData";
type Growth = { id: string; measuredOn: string; weightKg: string | null; heightCm: string | null };
export function GrowthPage({ familyId, childId }: { familyId: string; childId: string }) {
  const query = useFamilyData<Growth[]>("growth-records", familyId, "&childId=" + childId);
  const refresh = useRefresh();
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  return (
    <section>
      <div className="page-heading">
        <h2>Crescimento</h2>
        <button className="button button-primary" onClick={() => setAdding(true)}>
          Registrar medição
        </button>
      </div>
      <p className="subtitle">
        Histórico de peso e altura. A interpretação do crescimento deve ser feita por um profissional de
        saúde.
      </p>
      {adding && (
        <section className="panel editor">
          <RecordForm
            fields={[
              { name: "measuredOn", label: "Data da medição", type: "date", required: true },
              { name: "weightKg", label: "Peso (kg)", type: "number", min: 0.01, max: 500, step: "0.01" },
              { name: "heightCm", label: "Altura (cm)", type: "number", min: 0.01, max: 300, step: "0.01" },
            ]}
            onCancel={() => setAdding(false)}
            onSubmit={async (values) => {
              await domainApi.create("growth-records", { ...values, familyId, childId });
              setAdding(false);
              await refresh();
            }}
          />
        </section>
      )}
      {error && <p className="form-error">{error}</p>}
      <AsyncState pending={query.isPending} error={query.error} retry={query.refetch}>
        <div className="record-list">
          {query.data?.map((record) => (
            <article className="record-row" key={record.id}>
              <div>
                <h3>{record.measuredOn.slice(0, 10)}</h3>
                <p>
                  {record.weightKg ? record.weightKg + " kg" : "Peso não informado"} ·{" "}
                  {record.heightCm ? record.heightCm + " cm" : "Altura não informada"}
                </p>
              </div>
              <button
                className="danger-button"
                onClick={async () => {
                  if (!confirm("Excluir esta medição?")) return;
                  try {
                    await domainApi.remove("growth-records", record.id);
                    await refresh();
                  } catch (error) {
                    setError((error as Error).message);
                  }
                }}
              >
                Excluir
              </button>
            </article>
          ))}
          {!query.data?.length && <p className="panel">Nenhuma medição registrada.</p>}
        </div>
      </AsyncState>
    </section>
  );
}
