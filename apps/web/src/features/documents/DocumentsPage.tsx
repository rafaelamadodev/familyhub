import { useState } from "react";
import { apiRequest, send } from "../../api/client";
import { domainApi } from "../../api/domain";
import { RecordForm } from "../../components/forms/RecordForm";
import { AsyncState } from "../../components/ui/AsyncState";
import { useFamilyData, useRefresh } from "../useFamilyData";
type Document = {
  id: string;
  name: string;
  category: string;
  holder: string | null;
  description: string | null;
  mimeType: string;
  sizeBytes: number;
  versions: { id: string; createdAt: string }[];
};
async function encode(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo"));
    reader.readAsDataURL(file);
  });
}
export function DocumentsPage({ familyId, childId }: { familyId: string; childId?: string }) {
  const query = useFamilyData<Document[]>("documents", familyId, childId ? "&childId=" + childId : "");
  const refresh = useRefresh();
  const [uploading, setUploading] = useState<Document | "new" | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  async function open(id: string, versionId?: string) {
    setError("");
    try {
      const result = await apiRequest<{ url: string }>(
        "/api/v1/documents/" + id + "/download" + (versionId ? "?versionId=" + versionId : ""),
      );
      window.open(result.url, "_blank", "noopener,noreferrer");
    } catch (error) {
      setError((error as Error).message);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">ARQUIVOS PRIVADOS</p>
          <h1>Documentos</h1>
          <p className="subtitle">O download só é liberado para membros autorizados.</p>
        </div>
        <button
          className="button button-primary"
          onClick={() => {
            setUploading("new");
            setFile(null);
          }}
        >
          ＋ Enviar documento
        </button>
      </div>
      <label className="search-field">
        Buscar por nome ou categoria
        <input value={search} onChange={(e) => setSearch(e.target.value)} />
      </label>
      {uploading && (
        <section className="panel editor">
          <h2>{uploading === "new" ? "Novo documento" : "Substituir arquivo — " + uploading.name}</h2>
          <label>
            PDF, JPG ou PNG, até 10 MB
            <input
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <RecordForm
            fields={
              uploading === "new"
                ? [
                    { name: "name", label: "Nome", required: true },
                    { name: "category", label: "Categoria", required: true },
                    { name: "holder", label: "Titular" },
                    { name: "documentDate", label: "Data do documento", type: "date" },
                    { name: "description", label: "Descrição", type: "textarea" },
                  ]
                : []
            }
            onCancel={() => setUploading(null)}
            onSubmit={async (values) => {
              if (!file) throw new Error("Escolha um arquivo");
              if (file.size > 10 * 1024 * 1024) throw new Error("Limite de 10 MB");
              const encoded = { filename: file.name, mime: file.type, base64: await encode(file) };
              if (uploading === "new")
                await domainApi.create("documents", {
                  ...values,
                  documentDate: values.documentDate || null,
                  familyId,
                  childId: childId ?? null,
                  file: encoded,
                });
              else await send("/api/v1/documents/" + uploading.id + "/versions", "POST", encoded);
              setUploading(null);
              setFile(null);
              await refresh();
            }}
          />
        </section>
      )}
      {error && <p className="form-error">{error}</p>}
      <AsyncState pending={query.isPending} error={query.error} retry={query.refetch}>
        <div className="record-list">
          {query.data
            ?.filter((doc) => (doc.name + " " + doc.category).toLowerCase().includes(search.toLowerCase()))
            .map((doc) => (
              <article className="record-row" key={doc.id}>
                <div>
                  <h3>{doc.name}</h3>
                  <p>
                    {doc.category} · {doc.holder ?? "Sem titular"} · {Math.ceil(doc.sizeBytes / 1024)} KB
                  </p>
                  {doc.description && <small>{doc.description}</small>}
                  <details>
                    <summary>Histórico de versões ({doc.versions.length})</summary>
                    {doc.versions.map((version) => (
                      <button
                        className="text-button"
                        key={version.id}
                        onClick={() => open(doc.id, version.id)}
                      >
                        {new Date(version.createdAt).toLocaleString("pt-BR")} — baixar
                      </button>
                    ))}
                  </details>
                </div>
                <div className="actions">
                  <button className="button button-secondary" onClick={() => open(doc.id)}>
                    Baixar
                  </button>
                  <button
                    className="text-button"
                    onClick={() => {
                      setUploading(doc);
                      setFile(null);
                    }}
                  >
                    Nova versão
                  </button>
                  <button
                    className="danger-button"
                    onClick={async () => {
                      if (!confirm("Excluir o documento e suas versões?")) return;
                      try {
                        await domainApi.remove("documents", doc.id);
                        await refresh();
                      } catch (error) {
                        setError((error as Error).message);
                      }
                    }}
                  >
                    Excluir
                  </button>
                </div>
              </article>
            ))}
          {!query.data?.length && (
            <div className="empty-state">
              <h2>Seus documentos, organizados</h2>
              <p>Envie o primeiro arquivo para esta família.</p>
            </div>
          )}
        </div>
      </AsyncState>
    </>
  );
}
