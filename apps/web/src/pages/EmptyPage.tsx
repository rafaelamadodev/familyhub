import { EmptyState } from "../components/EmptyState";
export function EmptyPage({ title }: { title: string }) {
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">FAMILYHUB</p>
          <h1>{title}</h1>
          <p className="subtitle">Este espaço ficará conectado aos dados da sua família.</p>
        </div>
      </div>
      <EmptyState
        title={`Nenhum dado em ${title.toLowerCase()}`}
        description="Quando sua família começar a usar este módulo, os dados aparecerão aqui."
        action="Adicionar"
      />
    </>
  );
}
