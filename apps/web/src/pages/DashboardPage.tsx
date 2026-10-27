import { useMutation, useQueryClient } from "@tanstack/react-query";
import { domainApi, displayDate, type FamilyEvent, type Task } from "../api/domain";
import { useFamilyData } from "../features/useFamilyData";
import { AsyncState } from "../components/ui/AsyncState";
import { ErrorNotice } from "../components/ui/ErrorNotice";

type Dashboard = {
  timezone: string;
  date: string;
  tasks: Task[];
  events: FamilyEvent[];
  shoppingCount: number;
};

export function DashboardPage({
  familyId,
  readOnly,
  onNavigate,
}: {
  name: string;
  familyName: string;
  familyId: string;
  readOnly: boolean;
  onNavigate: (route: string) => void;
}) {
  const query = useFamilyData<Dashboard>("dashboard", familyId);
  const client = useQueryClient();
  const complete = useMutation({
    mutationFn: (id: string) => domainApi.update("tasks", id, { status: "DONE" }),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["dashboard", familyId] }),
        client.invalidateQueries({ queryKey: ["tasks", familyId] }),
      ]);
    },
  });
  const date = query.data?.date ? new Date(`${query.data.date}T12:00:00`) : new Date();
  const dateLabel = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
  return (
    <div className="today-page">
      <header className="today-heading">
        <p className="home-eyebrow">{dateLabel}</p>
        <h1>Hoje, em casa.</h1>
        <p>O que precisa da sua atenção.</p>
      </header>
      <AsyncState pending={query.isPending} error={query.error} retry={query.refetch}>
        {query.data && (
          <>
            {complete.error && (
              <ErrorNotice title="Não foi possível concluir a tarefa" message={complete.error.message} />
            )}
            <div className="today-columns">
              <section className="today-agenda">
                <header className="today-section-title">
                  <h2>Na agenda</h2>
                  <button onClick={() => onNavigate("Calendário")}>
                    Ver agenda <span aria-hidden="true">→</span>
                  </button>
                </header>
                {query.data.events.length ? (
                  query.data.events.slice(0, 5).map((event) => {
                    const day =
                      event.allDay && event.dateOnly
                        ? new Date(`${event.dateOnly}T12:00:00`)
                        : new Date(event.startsAt);
                    return (
                      <button className="today-event" key={event.id} onClick={() => onNavigate("Calendário")}>
                        <time dateTime={event.startsAt}>
                          {new Intl.DateTimeFormat("pt-BR", {
                            day: "2-digit",
                            month: "short",
                            ...(event.allDay ? {} : { timeZone: query.data!.timezone }),
                          }).format(day)}
                        </time>
                        <span>
                          <strong>{event.title}</strong>
                          <small>
                            {event.allDay
                              ? "Dia inteiro"
                              : new Intl.DateTimeFormat("pt-BR", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                  timeZone: query.data!.timezone,
                                }).format(day)}
                          </small>
                        </span>
                        <span aria-hidden="true">›</span>
                      </button>
                    );
                  })
                ) : (
                  <div className="today-empty">
                    <p>Nenhum compromisso próximo.</p>
                    <button onClick={() => onNavigate("Calendário")}>Abrir agenda</button>
                  </div>
                )}
              </section>
              <section>
                <header className="today-section-title">
                  <h2>Para fazer</h2>
                  <button onClick={() => onNavigate("Tarefas")}>
                    Ver tarefas <span aria-hidden="true">→</span>
                  </button>
                </header>
                {query.data.tasks.length ? (
                  query.data.tasks.slice(0, 5).map((task) => (
                    <div className="today-task" key={task.id}>
                      {!readOnly && (
                        <input
                          type="checkbox"
                          checked={false}
                          disabled={complete.isPending}
                          aria-label={`Concluir ${task.title}`}
                          onChange={() => complete.mutate(task.id)}
                        />
                      )}
                      <button onClick={() => onNavigate("Tarefas")}>
                        <strong>{task.title}</strong>
                        <small>{displayDate(task.dueAt, query.data!.timezone)}</small>
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="today-empty">
                    <p>Tudo em dia por aqui.</p>
                    <button onClick={() => onNavigate("Tarefas")}>Abrir tarefas</button>
                  </div>
                )}
                <button className="today-shopping" onClick={() => onNavigate("Compras")}>
                  <span>
                    <strong>Passar no mercado</strong>
                    <small>
                      {query.data.shoppingCount
                        ? `${query.data.shoppingCount} ${query.data.shoppingCount === 1 ? "item pendente" : "itens pendentes"}`
                        : "Abrir listas de compras"}
                    </small>
                  </span>
                  <span aria-hidden="true">→</span>
                </button>
              </section>
            </div>
          </>
        )}
      </AsyncState>
    </div>
  );
}
