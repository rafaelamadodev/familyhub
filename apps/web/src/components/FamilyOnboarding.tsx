import { useState } from "react";
import { RecordForm } from "./forms/RecordForm";
import { PhotoPicker } from "./forms/PhotoPicker";
export function FamilyOnboarding({
  onCreate,
  onJoin,
  initialCode = "",
  onLogout,
}: {
  onCreate: (data: { name: string; timezone: string; avatarUrl?: string | null }) => Promise<unknown>;
  onJoin: (code: string) => Promise<unknown>;
  initialCode?: string;
  onLogout: () => void;
}) {
  const [mode, setMode] = useState<"choose" | "create" | "join">(initialCode ? "join" : "choose");
  const [photo, setPhoto] = useState<string | null>(null);
  return (
    <div className="modal-backdrop">
      <section className="family-modal" role="dialog" aria-modal="true" aria-labelledby="family-title">
        <p className="eyebrow">BEM-VINDO AO SEU ESPAÇO</p>
        <h2 id="family-title">
          {mode === "choose"
            ? "Tudo começa com a sua família"
            : mode === "create"
              ? "Crie sua família"
              : "Participe de uma família"}
        </h2>
        {mode === "choose" ? (
          <>
            <p>Para continuar, crie uma família ou aceite um convite.</p>
            <div className="family-choice-grid">
              <button onClick={() => setMode("create")}>
                <strong>Criar uma família</strong>
                <small>Um novo espaço compartilhado.</small>
              </button>
              <button onClick={() => setMode("join")}>
                <strong>Participar de uma família</strong>
                <small>Já recebeu um código? Entre aqui.</small>
              </button>
            </div>
          </>
        ) : (
          <>
            <button className="modal-back" onClick={() => setMode("choose")}>
              ← Voltar
            </button>
            {mode === "create" ? (
              <>
                <PhotoPicker value={photo} onChange={setPhoto} />
                <RecordForm
                  fields={[
                    { name: "name", label: "Nome da família", required: true },
                    { name: "timezone", label: "Fuso horário", required: true },
                  ]}
                  initial={{ timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }}
                  submitLabel="Criar família"
                  onSubmit={(values) =>
                    onCreate({
                      name: String(values.name),
                      timezone: String(values.timezone),
                      avatarUrl: photo,
                    })
                  }
                />
                <p className="modal-helper">Após criar, abra Família para convidar outros membros.</p>
              </>
            ) : (
              <RecordForm
                fields={[
                  {
                    name: "code",
                    label: "Código de convite",
                    required: true,
                    hint: "Cole o código completo recebido do administrador.",
                  },
                ]}
                initial={{ code: initialCode }}
                submitLabel="Aceitar convite"
                onSubmit={(values) => onJoin(String(values.code).trim())}
              />
            )}
          </>
        )}
        <button className="text-button section-gap" onClick={onLogout}>
          Sair da conta
        </button>
      </section>
    </div>
  );
}
