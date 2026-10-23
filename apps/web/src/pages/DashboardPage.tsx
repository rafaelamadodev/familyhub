import { useMutation, useQueryClient } from "@tanstack/react-query";
import { domainApi, displayDate, type FamilyEvent, type Task } from "../api/domain";
import { useFamilyData } from "../features/useFamilyData";
import { AsyncState } from "../components/ui/AsyncState";
import { ErrorNotice } from "../components/ui/ErrorNotice";

type Dashboard = {
  timezone: string;
  date: string;
  todayCount: number;
  overdueCount: number;
  eventCount: number;
  shoppingCount: number;
  financeTotal: number | null;
  tasks: Task[];
  events: FamilyEvent[];
  lists: { id: string; name: string; _count: { items: number } }[];
};

function Icon({ name }: { name: "tasks" | "calendar" | "shopping" | "finance" | "sun" }) {
  const paths: Record<typeof name, React.ReactNode> = {
    tasks: (
      <>
        <path d="M8 5h12M8 12h12M8 19h12" />
        <path d="m3 5 1 1 2-2M3 12l1 1 2-2M3 19l1 1 2-2" />
      </>
    ),
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M16 3v4M8 3v4M3 10h18" />
      </>
    ),
    shopping: (
      <>
        <path d="M3 4h2l2.2 11.2a2 2 0 0 0 2 1.6h7.9a2 2 0 0 0 1.9-1.4L21 9H7" />
        <circle cx="10" cy="20" r="1" />
        <circle cx="18" cy="20" r="1" />
      </>
    ),
    finance: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M3 10h18M7 15h4" />
      </>
    ),
    sun: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" />
      </>
    ),
  };
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

function eventDateParts(event: FamilyEvent, timezone: string) {
  if (event.allDay && event.dateOnly) {
    const [, , day] = event.dateOnly.split("-");
    return {
      day: Number(day),
      month: new Intl.DateTimeFormat("pt-BR", { month: "short" })
        .format(new Date(`${event.dateOnly}T12:00:00`))
        .replace(".", "")
        .toUpperCase(),
    };
  }
  const date = new Date(event.startsAt);
  return {
    day: Number(new Intl.DateTimeFormat("en", { day: "numeric", timeZone: timezone }).format(date)),
    month: new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: timezone })
      .format(date)
      .replace(".", "")
      .toUpperCase(),
  };
}

export function DashboardPage({
  name,
  familyName,
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
          tasks: previous.tasks.filter((item) => item.id !== id),
          todayCount: Math.max(0, previous.todayCount - (today ? 1 : 0)),
          overdueCount: Math.max(0, previous.overdueCount - (today ? 0 : 1)),
        });
      }
      return { previous };
    },
    onError: (_error, _id, context) => {
      if (context?.previous) client.setQueryData(key, context.previous);
    },
    onSettled: () => client.invalidateQueries({ queryKey: key }),
  });
  const date = query.data?.date ? new Date(`${query.data.date}T12:00:00`) : new Date();
  const weekday = new Intl.DateTimeFormat("pt-BR", { weekday: "long" }).format(date);
  const dateLabel = new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);

  return (
    <div className="dashboard-page">
      <section className="dashboard-hero">
        <div className="dashboard-hero-inner">
          <div className="dashboard-greeting">
            <p className="dashboard-kicker">{familyName} · UM LAR, MUITAS HISTÓRIAS</p>
            <h1>
              {greeting()}, {name.split(" ")[0]}! <span aria-hidden="true">👋</span>
            </h1>
            <p>Aqui está um resumo da sua família hoje.</p>
          </div>
          <div className="dashboard-date">
            <strong>{weekday}</strong>
            <span>{dateLabel}</span>
          </div>
        </div>
      </section>

      <div className="dashboard-content">
        <AsyncState pending={query.isPending} error={query.error} retry={query.refetch}>
          {query.data && (
            <>
              <section className="dashboard-stats" aria-label="Resumo da família">
                <button className="dashboard-stat stat-tasks" onClick={() => onNavigate("Tarefas")}>
                  <span className="stat-icon">
                    <Icon name="tasks" />
                  </span>
                  <span className="stat-copy">
                    <small>Tarefas de hoje</small>
                    <strong>{query.data.todayCount}</strong>
                    <span>
                      {query.data.overdueCount} atrasada{query.data.overdueCount === 1 ? "" : "s"}
                    </span>
                  </span>
                  <span className="stat-progress">
                    <i
                      style={{
                        width: `${Math.min(100, query.data.todayCount ? Math.max(10, ((query.data.todayCount - query.data.overdueCount) / query.data.todayCount) * 100) : 0)}%`,
                      }}
                    />
                  </span>
                </button>
                <button className="dashboard-stat stat-events" onClick={() => onNavigate("Calendário")}>
                  <span className="stat-icon">
                    <Icon name="calendar" />
                  </span>
                  <span className="stat-copy">
                    <small>Próximos eventos</small>
                    <strong>{query.data.eventCount}</strong>
                    <span>na agenda da família</span>
                  </span>
                </button>
                <button className="dashboard-stat stat-shopping" onClick={() => onNavigate("Compras")}>
                  <span className="stat-icon">
                    <Icon name="shopping" />
                  </span>
                  <span className="stat-copy">
                    <small>Compras pendentes</small>
                    <strong>{query.data.shoppingCount}</strong>
                    <span>itens nas listas ativas</span>
                  </span>
                </button>
                {query.data.financeTotal !== null && (
                  <button className="dashboard-stat stat-finance" onClick={() => onNavigate("Financeiro")}>
                    <span className="stat-icon">
                      <Icon name="finance" />
                    </span>
                    <span className="stat-copy">
                      <small>Contas do mês</small>
                      <strong>
                        {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
                          query.data.financeTotal,
                        )}
                      </strong>
                      <span>total previsto</span>
                    </span>
                  </button>
                )}
              </section>

              {complete.error && (
                <ErrorNotice title="Não foi possível concluir a tarefa" message={complete.error.message} />
              )}

              <section className="dashboard-panels">
                <article className="dashboard-card dashboard-tasks">
                  <header className="dashboard-card-heading">
                    <h2>Hoje e próximas tarefas</h2>
                    <button className="dashboard-link" onClick={() => onNavigate("Tarefas")}>
                      Ver todas <span>↗</span>
                    </button>
                  </header>
                  {!query.data.tasks.length ? (
                    <div className="dashboard-empty">
                      <span>✓</span>
                      <p>Tudo em dia por aqui.</p>
                      <button className="dashboard-link" onClick={() => onNavigate("Tarefas")}>
                        Planejar uma tarefa
                      </button>
                    </div>
                  ) : (
                    <div className="dashboard-task-list">
                      {query.data.tasks.slice(0, 5).map((task) => {
                        const overdue = Boolean(
                          task.dueAt && new Date(task.dueAt) < new Date() && !task.status.includes("DONE"),
                        );
                        return (
                          <div className="dashboard-task-row" key={task.id}>
                            <span className={`task-check ${overdue ? "is-overdue" : ""}`} aria-hidden="true">
                              {overdue ? "!" : "✓"}
                            </span>
                            <button className="dashboard-task-main" onClick={() => onNavigate("Tarefas")}>
                              <strong>{task.title}</strong>
                              <small>{displayDate(task.dueAt, query.data!.timezone)}</small>
                            </button>
                            {overdue ? (
                              <span className="task-tag tag-overdue">Atrasada</span>
                            ) : (
                              <span className="task-tag">Na agenda</span>
                            )}
                            {!readOnly && (
                              <button
                                className="task-finish"
                                disabled={complete.isPending}
                                onClick={() => complete.mutate(task.id)}
                                aria-label={`Concluir ${task.title}`}
                              >
                                Concluir
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </article>

                <div className="dashboard-side-column">
                  <article className="dashboard-card dashboard-agenda">
                    <header className="dashboard-card-heading">
                      <h2>Na agenda</h2>
                      <button className="dashboard-link" onClick={() => onNavigate("Calendário")}>
                        Ver calendário <span>↗</span>
                      </button>
                    </header>
                    {!query.data.events.length ? (
                      <div className="dashboard-empty compact">
                        <p>Nenhum compromisso próximo.</p>
                        <button className="dashboard-link" onClick={() => onNavigate("Calendário")}>
                          Adicionar evento
                        </button>
                      </div>
                    ) : (
                      query.data.events.slice(0, 2).map((event: FamilyEvent) => {
                        const eventDate = eventDateParts(event, query.data!.timezone);
                        return (
                          <button
                            className="dashboard-event-row"
                            key={event.id}
                            onClick={() => onNavigate("Calendário")}
                          >
                            <span className="event-date">
                              <strong>{eventDate.day}</strong>
                              <small>{eventDate.month}</small>
                            </span>
                            <span className="event-rule" />
                            <span className="event-copy">
                              <strong>{event.title}</strong>
                              <small>
                                {event.allDay
                                  ? "Dia inteiro"
                                  : displayDate(event.startsAt, query.data!.timezone)}
                              </small>
                            </span>
                            <span className="event-category">Família</span>
                          </button>
                        );
                      })
                    )}
                  </article>
                  <article className="dashboard-note">
                    <span className="note-icon">
                      <Icon name="sun" />
                    </span>
                    <p>
                      “Pequenas atitudes hoje
                      <br />
                      constroem grandes memórias amanhã.”
                    </p>
                    <span className="note-orbit" aria-hidden="true" />
                  </article>
                </div>
              </section>

              <section className="dashboard-shortcuts">
                <h2>Acesso rápido</h2>
                <div className="shortcut-grid">
                  <button onClick={() => onNavigate("Tarefas")}>
                    <span className="shortcut-icon shortcut-green">
                      <Icon name="tasks" />
                    </span>
                    <strong>Nova tarefa</strong>
                    <span className="shortcut-arrow">›</span>
                  </button>
                  <button onClick={() => onNavigate("Compras")}>
                    <span className="shortcut-icon shortcut-slate">
                      <Icon name="shopping" />
                    </span>
                    <strong>Nova compra</strong>
                    <span className="shortcut-arrow">›</span>
                  </button>
                  <button onClick={() => onNavigate("Calendário")}>
                    <span className="shortcut-icon shortcut-purple">
                      <Icon name="calendar" />
                    </span>
                    <strong>Novo evento</strong>
                    <span className="shortcut-arrow">›</span>
                  </button>
                  <button onClick={() => onNavigate("Financeiro")}>
                    <span className="shortcut-icon shortcut-blue">
                      <Icon name="finance" />
                    </span>
                    <strong>Nova conta</strong>
                    <span className="shortcut-arrow">›</span>
                  </button>
                </div>
              </section>
            </>
          )}
        </AsyncState>
      </div>
    </div>
  );
}
