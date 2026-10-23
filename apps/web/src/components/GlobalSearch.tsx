import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { apiRequest } from "../api/client";

const resultSchema = z.object({
  results: z.array(z.object({
    type: z.string(),
    id: z.string(),
    title: z.string(),
    subtitle: z.string(),
    route: z.string(),
  })),
});

export function GlobalSearch({ familyId, onNavigate }: { familyId: string; onNavigate: (route: string) => void }) {
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const query = value.trim();
  const results = useQuery({
    queryKey: ["global-search", familyId, query],
    queryFn: () => apiRequest(`/api/v1/search?familyId=${encodeURIComponent(familyId)}&q=${encodeURIComponent(query)}`, {}, resultSchema),
    enabled: open && query.length >= 2,
    staleTime: 15_000,
  });

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        input.current?.focus();
        setOpen(true);
      }
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);

  return (
    <div className="global-search" ref={root}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.5 4.5"/></svg>
      <input
        ref={input}
        value={value}
        placeholder="Pesquisar..."
        aria-label="Pesquisar tarefas, eventos e listas"
        aria-expanded={open}
        onFocus={() => setOpen(true)}
        onChange={(event) => { setValue(event.target.value); setOpen(true); }}
        onKeyDown={(event) => { if (event.key === "Enter" && results.data?.results[0]) { onNavigate(results.data.results[0].route); setOpen(false); setValue(""); } }}
      />
      {value ? <button className="search-clear" aria-label="Limpar busca" onClick={() => setValue("")}>×</button> : <kbd>⌘ K</kbd>}
      {open && (query.length >= 2 || query.length === 0) && (
        <div className="search-popover" role="listbox" aria-label="Resultados da pesquisa">
          {query.length < 2 ? <p>Pesquise tarefas, eventos e listas da família</p>
            : results.isPending ? <p>Buscando…</p>
              : results.isError ? <p>Não foi possível pesquisar agora.</p>
                : results.data.results.length === 0 ? <p>Nenhum resultado encontrado.</p>
                  : results.data.results.map((item) => (
                    <button key={`${item.type}-${item.id}`} role="option" onClick={() => { onNavigate(item.route); setOpen(false); setValue(""); }}>
                      <span className="search-result-type">{item.type === "task" ? "Tarefa" : item.type === "event" ? "Evento" : "Lista"}</span>
                      <strong>{item.title}</strong>
                      {item.subtitle && <small>{item.subtitle}</small>}
                    </button>
                  ))}
        </div>
      )}
    </div>
  );
}
