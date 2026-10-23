import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { domainApi, displayDate, localDateTime, type FamilyEvent } from "../../api/domain";
import { RecordForm, type Field } from "../../components/forms/RecordForm";
import { AsyncState } from "../../components/ui/AsyncState";
import { useFamilyData, useRefresh } from "../useFamilyData";
export function CalendarPage({
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
  const query = useFamilyData<FamilyEvent[]>("events", familyId);
  const refresh = useRefresh();
  const members = useQuery({ queryKey: ["members", familyId], queryFn: () => domainApi.members(familyId) });
  const [editing, setEditing] = useState<FamilyEvent | "new" | null>(null);
  const [view, setView] = useState("month");
  const [month, setMonth] = useState(localDateTime(new Date().toISOString(), timezone).slice(0, 7));
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const event = query.data?.find((item) => item.id === focusedId);
    if (event) {
      const date = event.dateOnly ?? localDateTime(event.startsAt, timezone);
      setMonth(date.slice(0, 7));
      setSelectedDay(date.slice(0, 10));
      setView("agenda");
      setTimeout(
        () =>
          document
            .getElementById("event-" + focusedId)
            ?.scrollIntoView({ behavior: "smooth", block: "center" }),
        50,
      );
    }
  }, [focusedId, query.data, timezone]);
  const fields: Field[] = [
    { name: "title", label: "Título", required: true },
    {
      name: "startsAt",
      label: "Data e hora",
      type: "datetime-local",
      required: true,
      hint: "Fuso: " + timezone + ". Para dia inteiro, a hora será ignorada.",
    },
    { name: "allDay", label: "Dia inteiro", type: "checkbox" },
    { name: "description", label: "Descrição", type: "textarea" },
    { name: "location", label: "Local" },
    {
      name: "participantIds",
      label: "Participantes",
      type: "multiselect",
      options: members.data?.map((member) => ({ value: member.userId, label: member.user.name })),
    },
    {
      name: "reminderMinutes",
      label: "Lembrar quantos minutos antes?",
      type: "number",
      min: 0,
      max: 10080,
      step: "1",
    },
  ];
  const events =
    query.data?.filter((item) =>
      (item.dateOnly ?? localDateTime(item.startsAt, timezone)).startsWith(month),
    ) ?? [];
  const year = Number(month.slice(0, 4));
  const monthIndex = Number(month.slice(5, 7)) - 1;
  const firstWeekday = new Date(year, monthIndex, 1).getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const cellCount = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
  const today = localDateTime(new Date().toISOString(), timezone).slice(0, 10);
  const calendarCells = Array.from({ length: cellCount }, (_, index) => {
    const date = new Date(year, monthIndex, index - firstWeekday + 1);
    const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    return { date: day, number: date.getDate(), inMonth: date.getMonth() === monthIndex };
  });
  const eventsByDay = new Map<string, FamilyEvent[]>();
  for (const event of query.data ?? []) {
    const date = event.dateOnly ?? localDateTime(event.startsAt, timezone).slice(0, 10);
    eventsByDay.set(date, [...(eventsByDay.get(date) ?? []), event]);
  }
  const agendaEvents = events.filter((event) => {
    const date = event.dateOnly ?? localDateTime(event.startsAt, timezone).slice(0, 10);
    return selectedDay ? date === selectedDay : true;
  });
  const moveMonth = (offset: number) => {
    const date = new Date(year, monthIndex + offset, 1);
    setMonth(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`);
    setSelectedDay(null);
  };
  async function status(event: FamilyEvent) {
    setError("");
    try {
      await domainApi.update("events", event.id, {
        status: event.status === "CANCELLED" ? "SCHEDULED" : "CANCELLED",
      });
      await refresh();
    } catch (error) {
      setError((error as Error).message);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">TEMPO PARA O QUE IMPORTA</p>
          <h1>Calendário</h1>
          <p className="subtitle">Compromissos no fuso {timezone}.</p>
        </div>
        {!readOnly && (
          <button className="button button-primary" onClick={() => setEditing("new")}>
            ＋ Novo evento
          </button>
        )}
      </div>
      <div className="calendar-toolbar">
        <div className="calendar-month-controls">
          <button className="calendar-step" aria-label="Mês anterior" onClick={() => moveMonth(-1)}>
            ‹
          </button>
          <button
            className="button button-secondary calendar-today"
            onClick={() => {
              setMonth(today.slice(0, 7));
              setSelectedDay(today);
            }}
          >
            Hoje
          </button>
          <button className="calendar-step" aria-label="Próximo mês" onClick={() => moveMonth(1)}>
            ›
          </button>
          <label>
            <span className="visually-hidden">Mês</span>
            <input
              type="month"
              value={month}
              onChange={(e) => {
                if (e.target.value) {
                  setMonth(e.target.value);
                  setSelectedDay(null);
                }
              }}
            />
          </label>
        </div>
        <div className="calendar-view-switch" role="group" aria-label="Visualização do calendário">
          <button aria-pressed={view === "month"} onClick={() => setView("month")}>
            Mês
          </button>
          <button
            aria-pressed={view === "agenda"}
            onClick={() => {
              setSelectedDay(null);
              setView("agenda");
            }}
          >
            Agenda
          </button>
        </div>
      </div>
      {editing && (
        <section className="panel editor">
          <RecordForm
            key={editing === "new" ? "new" : editing.id}
            fields={fields}
            initial={
              editing === "new"
                ? { reminderMinutes: 30, ...(selectedDay ? { startsAt: `${selectedDay}T09:00` } : {}) }
                : {
                    title: editing.title,
                    startsAt: localDateTime(editing.startsAt, timezone),
                    allDay: editing.allDay,
                    description: editing.description,
                    location: editing.location,
                    participantIds: editing.participants.map((item) => item.userId),
                    reminderMinutes: editing.reminderMinutes,
                  }
            }
            onCancel={() => setEditing(null)}
            onSubmit={async (values) => {
              const body = { ...values, reminderMinutes: values.reminderMinutes ?? null };
              if (editing === "new") await domainApi.create("events", { ...body, familyId });
              else await domainApi.update("events", editing.id, body);
              setEditing(null);
              await refresh();
            }}
          />
        </section>
      )}
      {error && <p className="form-error">{error}</p>}
      <AsyncState pending={query.isPending} error={query.error} retry={query.refetch}>
        {view === "month" ? (
          <div className="calendar-grid">
            {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((day) => (
              <b className="calendar-weekday" key={day}>
                {day}
              </b>
            ))}
            {calendarCells.map(({ date, number, inMonth }) => {
              const dayEvents = eventsByDay.get(date) ?? [];
              return (
                <div
                  className={`calendar-day ${inMonth ? "" : "outside-month"} ${date === today ? "today" : ""} ${selectedDay === date ? "selected" : ""}`}
                  key={date}
                >
                  <button
                    className="calendar-date"
                    aria-label={`${date}, ${dayEvents.length} compromissos`}
                    onClick={() => {
                      setSelectedDay(date);
                      if (!inMonth) setMonth(date.slice(0, 7));
                    }}
                  >
                    {number}
                  </button>
                  <div className="calendar-day-events">
                    {dayEvents.slice(0, 3).map((event) => (
                      <button
                        className={`calendar-event ${event.status === "CANCELLED" ? "cancelled" : ""}`}
                        key={event.id}
                        title={`${event.allDay ? "Dia inteiro" : displayDate(event.startsAt, timezone)} — ${event.title}`}
                        onClick={() => {
                          setSelectedDay(date);
                          setView("agenda");
                        }}
                      >
                        {!event.allDay && (
                          <time>{localDateTime(event.startsAt, timezone).slice(11, 16)}</time>
                        )}
                        <span>{event.title}</span>
                      </button>
                    ))}
                    {dayEvents.length > 3 && (
                      <button
                        className="calendar-more"
                        onClick={() => {
                          setSelectedDay(date);
                          setView("agenda");
                        }}
                      >
                        +{dayEvents.length - 3} mais
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="record-list">
            {selectedDay && (
              <div className="calendar-agenda-heading">
                <h2>
                  {new Date(`${selectedDay}T12:00:00`).toLocaleDateString("pt-BR", { dateStyle: "full" })}
                </h2>
                <button className="text-button" onClick={() => setSelectedDay(null)}>
                  Ver o mês todo
                </button>
              </div>
            )}
            {!agendaEvents.length && (
              <div className="empty-state">
                <h2>{selectedDay ? "Nenhum compromisso neste dia" : "Seu mês está livre"}</h2>
                <p>
                  {selectedDay
                    ? "Esse dia está livre na agenda da família."
                    : "Adicione o próximo compromisso da família."}
                </p>
              </div>
            )}
            {agendaEvents.map((event) => (
              <article
                id={"event-" + event.id}
                className={event.id === focusedId ? "record-row focused-record" : "record-row"}
                key={event.id}
              >
                <div>
                  <h3>{event.title}</h3>
                  <p>
                    {event.allDay ? event.dateOnly + " · Dia inteiro" : displayDate(event.startsAt, timezone)}
                    {event.location ? " · " + event.location : ""}
                  </p>
                  <small>
                    {event.status === "CANCELLED" ? "Cancelado" : "Agendado"} · {event.participants.length}{" "}
                    participantes
                  </small>
                </div>
                {!readOnly && (
                  <div className="actions">
                    <button className="text-button" onClick={() => setEditing(event)}>
                      Editar
                    </button>
                    <button className="text-button" onClick={() => status(event)}>
                      {event.status === "CANCELLED" ? "Restaurar" : "Cancelar evento"}
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </AsyncState>
    </>
  );
}
