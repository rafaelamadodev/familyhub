import { useQuery } from "@tanstack/react-query";
import { apiRequest, send } from "../../api/client";
import { AsyncState } from "../../components/ui/AsyncState";
import { useRefresh } from "../useFamilyData";
import { useState } from "react";
type Notification = {
  id: string;
  familyId: string;
  title: string;
  route: string;
  readAt: string | null;
  scheduledAt: string;
};
export function NotificationsPage({ onOpen }: { onOpen: (familyId: string, route: string) => void }) {
  const query = useQuery({
    queryKey: ["notifications"],
    queryFn: () => apiRequest<Notification[]>("/api/v1/notifications"),
    refetchInterval: 5000,
  });
  const refresh = useRefresh();
  const [error, setError] = useState("");
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">FIQUE POR DENTRO</p>
          <h1>Notificações</h1>
        </div>
      </div>
      {error && <p className="form-error">{error}</p>}
      <AsyncState pending={query.isPending} error={query.error} retry={query.refetch}>
        <div className="record-list">
          {query.data?.map((item) => (
            <article className="record-row" key={item.id}>
              <div>
                <h3>{item.title}</h3>
                <p>{new Date(item.scheduledAt).toLocaleString("pt-BR")}</p>
                <small>{item.readAt ? "Lida" : "Nova"}</small>
              </div>
              <button
                className="button button-secondary"
                onClick={async () => {
                  try {
                    await send("/api/v1/notifications/" + item.id + "/read", "PATCH");
                    await refresh();
                    onOpen(item.familyId, item.route);
                  } catch (error) {
                    setError((error as Error).message);
                  }
                }}
              >
                Abrir →
              </button>
            </article>
          ))}
          {!query.data?.length && (
            <div className="empty-state">
              <h2>Tudo tranquilo por aqui</h2>
              <p>Os próximos lembretes aparecerão nesta caixa.</p>
            </div>
          )}
        </div>
      </AsyncState>
    </>
  );
}
