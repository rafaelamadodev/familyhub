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
  const [view, setView] = useState("agenda");
  const [month, setMonth] = useState(localDateTime(new Date().toISOString(), timezone).slice(0, 7));
  const [error, setError] = useState("");
  useEffect(() => {
    const event = query.data?.find((item) => item.id === focusedId);
    if (event) {
      const date = event.dateOnly ?? localDateTime(event.startsAt, timezone);
      setMonth(date.slice(0, 7));
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
  const days = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
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
      <div className="filters">
        <label>
          Mês
          <input
            type="month"
            value={month}
            onChange={(e) => {
              if (e.target.value) setMonth(e.target.value);
            }}
          />
        </label>
        <button
          className="button button-secondary"
          aria-pressed={view === "agenda"}
          onClick={() => setView("agenda")}
        >
          Agenda
        </button>
        <button
          className="button button-secondary"
          aria-pressed={view === "month"}
          onClick={() => setView("month")}
        >
          Mês
        </button>
      </div>
      {editing && (
        <section className="panel editor">
          <RecordForm
            key={editing === "new" ? "new" : editing.id}
            fields={fields}
            initial={
              editing === "new"
                ? { reminderMinutes: 30 }
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
              <b key={day}>{day}</b>
            ))}
            {Array.from(
              { length: new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1).getDay() },
              (_, i) => (
                <div key={"empty" + i} />
              ),
            )}
            {Array.from({ length: days }, (_, index) => {
              const day = month + "-" + String(index + 1).padStart(2, "0");
              return (
                <div className="calendar-day" key={day}>
                  <b>{index + 1}</b>
                  {events
                    .filter(
                      (event) =>
                        (event.dateOnly ?? localDateTime(event.startsAt, timezone).slice(0, 10)) === day,
                    )
                    .map((event) => (
                      <button
                        key={event.id}
                        onClick={() => {
                          setView("agenda");
                        }}
                      >
                        {event.status === "CANCELLED" ? "Cancelado: " : ""}
                        {event.title}
                      </button>
                    ))}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="record-list">
            {!events.length && (
              <div className="empty-state">
                <h2>Seu mês está livre</h2>
                <p>Adicione o próximo compromisso da família.</p>
              </div>
            )}
            {events.map((event) => (
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
