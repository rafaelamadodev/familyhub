import { useState } from "react";
export type Field = {
  name: string;
  label: string;
  type?:
    | "text"
    | "textarea"
    | "number"
    | "date"
    | "datetime-local"
    | "month"
    | "email"
    | "password"
    | "select"
    | "checkbox"
    | "multiselect";
  required?: boolean;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  maxLength?: number;
  step?: string;
  hint?: string;
};
export type Values = Record<string, string | number | boolean | string[] | null>;
export function RecordForm({
  fields,
  initial = {},
  onSubmit,
  submitLabel = "Salvar",
  onCancel,
}: {
  fields: Field[];
  initial?: Values;
  onSubmit: (values: Values) => Promise<unknown>;
  submitLabel?: string;
  onCancel?: () => void;
}) {
  const [values, setValues] = useState<Values>(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const change = (name: string, value: Values[string]) =>
    setValues((previous) => ({ ...previous, [name]: value }));
  return (
    <form
      className="form-stack"
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        setError("");
        try {
          const data: Values = {};
          for (const field of fields)
            data[field.name] =
              values[field.name] ??
              (field.type === "checkbox"
                ? false
                : field.type === "multiselect"
                  ? []
                  : field.type === "number"
                    ? null
                    : "");
          await onSubmit(data);
        } catch (error) {
          setError(error instanceof Error ? error.message : "Não foi possível salvar");
        } finally {
          setPending(false);
        }
      }}
    >
      {fields.map((field) => (
        <label key={field.name}>
          {field.label}
          {field.type === "textarea" ? (
            <textarea
              maxLength={2000}
              value={String(values[field.name] ?? "")}
              required={field.required}
              onChange={(event) => change(field.name, event.target.value)}
            />
          ) : field.type === "multiselect" ? (
            <select
              multiple
              value={(values[field.name] ?? []) as string[]}
              onChange={(event) =>
                change(
                  field.name,
                  Array.from(event.target.selectedOptions).map((option) => option.value),
                )
              }
            >
              {field.options?.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : field.type === "select" ? (
            <select
              required={field.required}
              value={String(values[field.name] ?? "")}
              onChange={(event) => change(field.name, event.target.value)}
            >
              <option value="">Selecione</option>
              {field.options?.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : field.type === "checkbox" ? (
            <input
              type="checkbox"
              checked={Boolean(values[field.name])}
              onChange={(event) => change(field.name, event.target.checked)}
            />
          ) : (
            <input
              type={field.type ?? "text"}
              value={String(values[field.name] ?? "")}
              required={field.required}
              min={field.min}
              max={field.max}
              step={field.step}
              maxLength={field.maxLength ?? (field.type === "password" ? 128 : 2000)}
              autoComplete={field.type === "password" ? "current-password" : undefined}
              onChange={(event) =>
                change(
                  field.name,
                  field.type === "number"
                    ? event.target.value === ""
                      ? null
                      : Number(event.target.value)
                    : event.target.value,
                )
              }
            />
          )}
          {field.hint && <small>{field.hint}</small>}
        </label>
      ))}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="actions">
        <button className="button button-primary" disabled={pending}>
          {pending ? "Salvando…" : submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="button button-secondary" onClick={onCancel}>
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}
