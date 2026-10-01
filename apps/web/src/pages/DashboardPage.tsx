import { useMutation, useQueryClient } from "@tanstack/react-query";
import { domainApi, displayDate, type FamilyEvent, type Task } from "../api/domain";
import { useFamilyData } from "../features/useFamilyData";
import { AsyncState } from "../components/ui/AsyncState";
type Dashboard = {
  timezone: string;
  date: string;
  todayCount: number;
  overdueCount: number;
  eventCount: number;
  shoppingCount: number;
  tasks: Task[];
  events: FamilyEvent[];
  lists: { id: string; name: string; _count: { items: number } }[];
};
export function DashboardPage({
  name,
  familyId,
  readOnly,
  onNavigate,
}: {
  name: string;
  familyId: string;
  readOnly: boolean;
  onNavigate: (route: string) => void;
}) {
  const query = useFamilyData<Dashboard>("dashboard", familyId);
  const client = useQueryClient();
  const key = ["dashboard", familyId, ""];
  const complete = useMutation({
    mutationFn: (id: string) => domainApi.update("tasks", id, { status: "DONE" }),
    onMutate: async (id) => {
      await client.cancelQueries({ queryKey: key });
      const previous = client.getQueryData<Dashboard>(key);
      if (previous) {
        const task = previous.tasks.find((item) => item.id === id);
        const today = task?.dueAt
          ? new Intl.DateTimeFormat("sv-SE", { timeZone: previous.timezone }).format(new Date(task.dueAt)) ===
            previous.date
          : false;
        client.setQueryData(key, {
          ...previous,
          tasks: previous.tasks.filter((task) => task.id !== id),
          todayCount: previous.todayCount - (today ? 1 : 0),
          overdueCount: previous.overdueCount - (today ? 0 : 1),
        });
      }
      return { previous };
    },
    onError: (_error, _id, context) => {
      if (context?.previous) client.setQueryData(key, context.previous);
    },
    onSettled: () => client.invalidateQueries(),
  });
  return (
    <>
      <div className="welcome">
        <div>
          <p className="eyebrow">SEU DIA, EM FAMÍLIA</p>
          <h1>Olá, {name.split(" ")[0]}.</h1>
          <p className="subtitle">Um pouco de organização. Mais tempo juntos.</p>
        </div>
        <button className="button button-primary" onClick={() => onNavigate("Tarefas")}>
          Ver tarefas →
        </button>
      </div>
      <AsyncState pending={query.isPending} error={query.error} retry={query.refetch}>
        {query.data && (
          <>
            <div className="summary-grid">
              <button className="summary peach" onClick={() => onNavigate("Tarefas")}>
                <span>Tarefas de hoje</span>
                <strong>{query.data.todayCount}</strong>
                <small>{query.data.overdueCount} atrasadas</small>
              </button>
              <button className="summary lilac" onClick={() => onNavigate("Calendário")}>
                <span>Próximos eventos</span>
                <strong>{query.data.eventCount}</strong>
                <small>na agenda da família</small>
              </button>
              <button className="summary mint" onClick={() => onNavigate("Compras")}>
                <span>Falta comprar</span>
                <strong>{query.data.shoppingCount}</strong>
                <small>itens nas listas ativas</small>
              </button>
            </div>
            {complete.error && (
              <p className="form-error" role="alert">
                {complete.error.message}
              </p>
            )}
            <div className="dashboard-grid">
              <section className="panel">
                <h2>Hoje e pendências</h2>
                {!query.data.tasks.length && (
                  <p className="subtitle">
                    Tudo em dia.{" "}
                    <button className="text-button" onClick={() => onNavigate("Tarefas")}>
                      Planejar uma tarefa
                    </button>
                  </p>
                )}
                {query.data.tasks.map((task) => (
                  <div className="compact-row" key={task.id}>
                    <div>
                      <b>{task.title}</b>
                      <small>{displayDate(task.dueAt, query.data!.timezone)}</small>
                    </div>
                    {!readOnly && (
                      <button
                        className="button button-secondary"
                        disabled={complete.isPending}
                        onClick={() => complete.mutate(task.id)}
                      >
                        Concluir
                      </button>
                    )}
                  </div>
                ))}
              </section>
              <section className="panel">
                <h2>Na agenda</h2>
                {!query.data.events.length && (
                  <p className="subtitle">
                    Nenhum compromisso agendado.{" "}
                    <button className="text-button" onClick={() => onNavigate("Calendário")}>
                      Adicionar evento
                    </button>
                  </p>
                )}
                {query.data.events.map((event) => (
                  <button
                    className="compact-row full"
                    key={event.id}
                    onClick={() => onNavigate("Calendário")}
                  >
                    <b>{event.title}</b>
                    <small>
                      {event.allDay
                        ? event.dateOnly + " · Dia inteiro"
                        : displayDate(event.startsAt, query.data!.timezone)}
                    </small>
                  </button>
                ))}
              </section>
              <section className="panel">
                <h2>Listas ativas</h2>
                {!query.data.lists.length && (
                  <p className="subtitle">
                    Sua primeira lista começa com um item.{" "}
                    <button className="text-button" onClick={() => onNavigate("Compras")}>
                      Criar lista
                    </button>
                  </p>
                )}
                {query.data.lists.map((list) => (
                  <button className="compact-row full" key={list.id} onClick={() => onNavigate("Compras")}>
                    <b>{list.name}</b>
                    <small>{list._count.items} itens pendentes →</small>
                  </button>
                ))}
              </section>
            </div>
          </>
        )}
      </AsyncState>
    </>
  );
}
