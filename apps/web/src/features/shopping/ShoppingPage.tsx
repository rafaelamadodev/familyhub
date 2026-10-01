import { useState } from "react";
import { domainApi, type ShoppingList, type ShoppingItem } from "../../api/domain";
import { RecordForm, type Field } from "../../components/forms/RecordForm";
import { AsyncState } from "../../components/ui/AsyncState";
import { useFamilyData, useRefresh } from "../useFamilyData";
const itemFields: Field[] = [
  { name: "name", label: "Item", required: true },
  { name: "quantity", label: "Quantidade", type: "number", min: 0.01, step: "0.01" },
  { name: "unit", label: "Unidade (kg, un, L…)" },
  { name: "note", label: "Observação", type: "textarea" },
  {
    name: "priority",
    label: "Prioridade",
    type: "select",
    required: true,
    options: [
      { value: "LOW", label: "Baixa" },
      { value: "NORMAL", label: "Normal" },
      { value: "HIGH", label: "Alta" },
    ],
  },
];
export function ShoppingPage({ familyId, readOnly }: { familyId: string; readOnly: boolean }) {
  const query = useFamilyData<ShoppingList[]>("shopping-lists", familyId);
  const refresh = useRefresh();
  const [newList, setNewList] = useState(false);
  const [selected, setSelected] = useState("");
  const [editing, setEditing] = useState<ShoppingItem | "new" | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [error, setError] = useState("");
  const list = query.data?.find((item) => item.id === selected) ?? query.data?.[0];
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
          <p className="eyebrow">COMPRAS EM FAMÍLIA</p>
          <h1>Uma lista, todo mundo junto</h1>
          <p className="subtitle">Atualização automática a cada 5 segundos.</p>
        </div>
        {!readOnly && (
          <button className="button button-primary" onClick={() => setNewList(true)}>
            ＋ Nova lista
          </button>
        )}
      </div>
      {newList && (
        <section className="panel editor">
          <RecordForm
            fields={[{ name: "name", label: "Nome da lista", required: true }]}
            onCancel={() => setNewList(false)}
            onSubmit={async (values) => {
              const result = await domainApi.create<ShoppingList>("shopping-lists", { ...values, familyId });
              setSelected(result.id);
              setNewList(false);
              await refresh();
            }}
          />
        </section>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <AsyncState pending={query.isPending} error={query.error} retry={query.refetch}>
        {!query.data?.length ? (
          <div className="empty-state">
            <h2>O que está faltando em casa?</h2>
            <p>Crie sua primeira lista para começar.</p>
          </div>
        ) : (
          <>
            <div className="filters">
              <label>
                Lista
                <select
                  value={list?.id}
                  onChange={(e) => {
                    setSelected(e.target.value);
                    setEditing(null);
                    setRenaming(false);
                  }}
                >
                  {query.data.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                      {item.status === "ARCHIVED" ? " (arquivada)" : ""}
                    </option>
                  ))}
                </select>
              </label>
              {!readOnly && list && (
                <>
                  <button className="text-button" onClick={() => setRenaming(true)}>
                    Renomear
                  </button>
                  <button
                    className="text-button"
                    onClick={() =>
                      act(() =>
                        domainApi.update("shopping-lists", list.id, {
                          status: list.status === "ACTIVE" ? "ARCHIVED" : "ACTIVE",
                        }),
                      )
                    }
                  >
                    {list.status === "ACTIVE" ? "Arquivar" : "Reativar"}
                  </button>
                </>
              )}
            </div>
            {renaming && list && (
              <section className="panel editor">
                <RecordForm
                  fields={[{ name: "name", label: "Nome da lista", required: true }]}
                  initial={{ name: list.name }}
                  onCancel={() => setRenaming(false)}
                  onSubmit={async (values) => {
                    await domainApi.update("shopping-lists", list.id, values);
                    setRenaming(false);
                    await refresh();
                  }}
                />
              </section>
            )}
            {list && !readOnly && list.status === "ACTIVE" && (
              <button className="button button-secondary" onClick={() => setEditing("new")}>
                ＋ Adicionar item
              </button>
            )}
            {editing && list && (
              <section className="panel editor">
                <RecordForm
                  key={editing === "new" ? "new" : editing.id}
                  fields={itemFields}
                  initial={
                    editing === "new"
                      ? { priority: "NORMAL", quantity: 1 }
                      : {
                          name: editing.name,
                          quantity: editing.quantity,
                          unit: editing.unit,
                          note: editing.note,
                          priority: editing.priority,
                        }
                  }
                  onCancel={() => setEditing(null)}
                  onSubmit={async (values) => {
                    const body = { ...values, quantity: values.quantity || null };
                    if (editing === "new")
                      await domainApi.create("shopping-items", { ...body, listId: list.id });
                    else await domainApi.update("shopping-items", editing.id, body);
                    setEditing(null);
                    await refresh();
                  }}
                />
              </section>
            )}
            <div className="record-list">
              {list?.items.length === 0 && <p className="panel">Adicione o primeiro item desta lista.</p>}
              {list?.items.map((item) => (
                <article className={"record-row " + (item.checked ? "completed" : "")} key={item.id}>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={item.checked}
                      disabled={readOnly}
                      onChange={(e) =>
                        act(() => domainApi.update("shopping-items", item.id, { checked: e.target.checked }))
                      }
                    />
                    <span>
                      <b>{item.name}</b>
                      <small>
                        {item.quantity ?? ""} {item.unit ?? ""} ·{" "}
                        {item.priority === "HIGH"
                          ? "Prioridade alta"
                          : item.priority === "LOW"
                            ? "Prioridade baixa"
                            : "Normal"}
                      </small>
                      {item.note && <small>{item.note}</small>}
                    </span>
                  </label>
                  {!readOnly && (
                    <div className="actions">
                      <button className="text-button" onClick={() => setEditing(item)}>
                        Editar
                      </button>
                      <button
                        className="danger-button"
                        onClick={() => {
                          if (confirm("Remover este item?"))
                            void act(() => domainApi.remove("shopping-items", item.id));
                        }}
                      >
                        Remover
                      </button>
                    </div>
                  )}
                </article>
              ))}
            </div>
          </>
        )}
      </AsyncState>
    </>
  );
}
