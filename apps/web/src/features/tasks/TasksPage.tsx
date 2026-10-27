import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { domainApi, displayDate, localDateTime, type Task } from "../../api/domain";
import { RecordForm, type Field, type Values } from "../../components/forms/RecordForm";
import { AsyncState } from "../../components/ui/AsyncState";
import { useFamilyData, useRefresh } from "../useFamilyData";
import { daysFromRule, weekdayOptions } from "../recurrence";

export function TasksPage({
  familyId,
  timezone,
  readOnly,
  focusedId,
}: {
  familyId: string;
  timezone: string;
  readOnly: boolean;
  focusedId?: string;
}) {
  const [status, setStatus] = useState("OPEN");
  const [assignee, setAssignee] = useState("");
  const [deadline, setDeadline] = useState("");
  const [editing, setEditing] = useState<Task | "new" | null>(null);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<
    { action: string; createdAt: string; actor: { name: string } | null }[] | null
  >(null);
  const refresh = useRefresh();
  const query = useFamilyData<Task[]>(
    "tasks",
    familyId,
    "&status=" +
      status +
      (assignee ? "&assigneeId=" + assignee : "") +
      (deadline ? "&deadline=" + deadline : ""),
  );
  useEffect(() => {
    if (focusedId && query.data?.some((item) => item.id === focusedId))
      document.getElementById("task-" + focusedId)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusedId, query.data]);
  const members = useQuery({ queryKey: ["members", familyId], queryFn: () => domainApi.members(familyId) });
  const legacyRule =
    editing && editing !== "new" && editing.recurrence && !daysFromRule(editing.recurrence).length
      ? editing.recurrence
      : null;
  const fields: Field[] = [
    { name: "title", label: "Título", required: true },
    { name: "description", label: "Descrição", type: "textarea" },
    { name: "dueAt", label: "Vencimento", type: "datetime-local", hint: "Fuso: " + timezone },
    {
      name: "assigneeId",
      label: "Responsável",
      type: "select",
      options: members.data?.map((item) => ({ value: item.userId, label: item.user.name })),
    },
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
    {
      name: "recurrenceDays",
      label: "Repetir toda semana",
      type: "weekdays",
      options: weekdayOptions,
      hint: "Escolha os dias; deixe todos desmarcados para uma tarefa única. Informe um vencimento no primeiro dia escolhido.",
    },
    ...(legacyRule
      ? [
          {
            name: "keepPreviousRecurrence",
            label: `Manter repetição anterior (${legacyRule})`,
            type: "checkbox" as const,
            hint: "Desmarque para remover a repetição anterior. Para trocar por dias da semana, selecione os dias acima.",
          },
        ]
      : []),
  ];
  const save = async (values: Values) => {
    const { recurrenceDays, keepPreviousRecurrence, ...otherValues } = values;
    const days = Array.isArray(recurrenceDays) ? recurrenceDays : [];
    const previous = editing !== "new" && editing ? editing.recurrence : null;
    const previousDays = daysFromRule(previous);
    const unchanged = [...days].sort().join(",") === [...previousDays].sort().join(",");
    const recurrence =
      previous && unchanged && (!legacyRule || keepPreviousRecurrence)
        ? previous
        : days.length
          ? `WEEKLY;BYDAY=${weekdayOptions
              .filter((day) => days.includes(day.value))
              .map((day) => day.value)
              .join(",")}`
          : null;
    if (days.length && !values.dueAt) throw new Error("Informe o vencimento da primeira ocorrência.");
    if (days.length && values.dueAt) {
      const weekday = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"][
        new Date(`${String(values.dueAt).slice(0, 10)}T12:00:00`).getDay()
      ];
      if (!days.includes(weekday)) throw new Error("O vencimento deve cair em um dos dias selecionados.");
    }
    const body = {
      ...otherValues,
      dueAt: values.dueAt || null,
      assigneeId: values.assigneeId || null,
      recurrence,
    };
    if (editing === "new") await domainApi.create("tasks", { ...body, familyId });
    else await domainApi.update("tasks", editing!.id, body);
    setEditing(null);
    await refresh();
  };
  const act = async (work: () => Promise<unknown>) => {
    setError("");
    try {
      await work();
      await refresh();
    } catch (error) {
      setError((error as Error).message);
    }
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">ROTINA COMPARTILHADA</p>
          <h1>Tarefas</h1>
          <p className="subtitle">Cada cuidado, no seu tempo.</p>
        </div>
        {!readOnly && (
          <button className="button button-primary" onClick={() => setEditing("new")}>
            ＋ Nova tarefa
          </button>
        )}
      </div>
      <div className="filters">
        <label>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="OPEN">Pendentes</option>
            <option value="DONE">Concluídas</option>
            <option value="ARCHIVED">Arquivadas</option>
          </select>
        </label>
        <label>
          Responsável
          <select value={assignee} onChange={(e) => setAssignee(e.target.value)}>
            <option value="">Todos</option>
            {members.data?.map((member) => (
              <option key={member.id} value={member.userId}>
                {member.user.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Prazo
          <select value={deadline} onChange={(e) => setDeadline(e.target.value)}>
            <option value="">Todos</option>
            <option value="overdue">Atrasadas</option>
            <option value="today">Hoje</option>
            <option value="upcoming">Próximas</option>
          </select>
        </label>
      </div>
      {editing && (
        <section className="panel editor">
          <h2>{editing === "new" ? "Nova tarefa" : "Editar tarefa"}</h2>
          <RecordForm
            key={editing === "new" ? "new" : editing.id}
            fields={fields}
            initial={
              editing === "new"
                ? { priority: "NORMAL" }
                : {
                    title: editing.title,
                    description: editing.description,
                    dueAt: localDateTime(editing.dueAt, timezone),
                    assigneeId: editing.assigneeId,
                    priority: editing.priority,
                    recurrenceDays: daysFromRule(editing.recurrence),
                    ...(legacyRule ? { keepPreviousRecurrence: true } : {}),
                  }
            }
            onSubmit={save}
            onCancel={() => setEditing(null)}
          />
        </section>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {focusedId && query.data && !query.data.some((item) => item.id === focusedId) && (
        <p className="form-notice" role="status">
          Este lembrete pode estar concluído ou não pertencer à família selecionada.
        </p>
      )}
      <AsyncState pending={query.isPending} error={query.error} retry={query.refetch}>
        <div className="record-list">
          {query.data?.length === 0 && (
            <div className="empty-state">
              <h2>Nenhuma tarefa neste filtro</h2>
              <p>Crie uma tarefa para dividir a rotina com sua família.</p>
            </div>
          )}
          {query.data?.map((task) => (
            <article
              id={"task-" + task.id}
              className={task.id === focusedId ? "record-row focused-record" : "record-row"}
              key={task.id}
            >
              <div>
                <h3>{task.title}</h3>
                <p>
                  {displayDate(task.dueAt, timezone)} · {task.assignee?.name ?? "Sem responsável"}
                </p>
                <small>
                  {task.priority === "HIGH"
                    ? "Prioridade alta"
                    : task.priority === "LOW"
                      ? "Prioridade baixa"
                      : "Prioridade normal"}
                  {task.recurrence ? " · Recorrente" : ""}
                </small>
              </div>
              <div className="actions">
                {!readOnly && (
                  <>
                    <button
                      className="button button-secondary"
                      onClick={() =>
                        act(() =>
                          domainApi.update("tasks", task.id, {
                            status: task.status === "DONE" ? "OPEN" : "DONE",
                          }),
                        )
                      }
                    >
                      {task.status === "DONE" ? "Reabrir" : "Concluir"}
                    </button>
                    <button className="text-button" onClick={() => setEditing(task)}>
                      Editar
                    </button>
                    <button
                      className="danger-button"
                      onClick={() => {
                        if (confirm("Excluir esta tarefa?"))
                          void act(() => domainApi.remove("tasks", task.id));
                      }}
                    >
                      Excluir
                    </button>
                  </>
                )}
                <button
                  className="text-button"
                  onClick={() =>
                    act(async () =>
                      setHistory(await domainApi.list("tasks/" + task.id + "/history", familyId)),
                    )
                  }
                >
                  Histórico
                </button>
              </div>
            </article>
          ))}
        </div>
      </AsyncState>
      {history && (
        <section className="panel">
          <h2>Histórico</h2>
          {history.map((item, index) => (
            <p key={index}>
              {item.action} · {item.actor?.name ?? "Usuário removido"} ·{" "}
              {displayDate(item.createdAt, timezone)}
            </p>
          ))}
          <button className="text-button" onClick={() => setHistory(null)}>
            Fechar histórico
          </button>
        </section>
      )}
    </>
  );
}
