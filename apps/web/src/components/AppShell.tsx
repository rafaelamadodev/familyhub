import { useState, type ReactNode } from "react";
import type { User } from "../api/client";
import { Avatar } from "./Avatar";
import { Brand } from "./Brand";
const items = [
  "Início",
  "Tarefas",
  "Compras",
  "Calendário",
  "Família",
  "Crianças",
  "Saúde",
  "Documentos",
  "Financeiro",
  "Notificações",
  "Privacidade",
  "Perfil",
];
export function AppShell({
  user,
  familyName,
  route,
  onNavigate,
  onLogout,
  children,
}: {
  user: User;
  familyName?: string;
  route: string;
  onNavigate: (route: string) => void;
  onLogout: () => void;
  children: ReactNode;
}) {
  const [menu, setMenu] = useState(false);
  const go = (route: string) => {
    onNavigate(route);
    setMenu(false);
  };
  return (
    <>
      <aside className={"sidebar " + (menu ? "mobile-open" : "")}>
        <Brand />
        <button className="family-switch" onClick={() => go("Família")}>
          <span>⌂</span>
          <div>
            <b>{familyName ?? "Minha família"}</b>
          </div>
          <strong>›</strong>
        </button>
        <nav aria-label="Navegação principal">
          {items.map((item) => (
            <button
              className={"nav-link " + (route === item ? "active" : "")}
              aria-current={route === item ? "page" : undefined}
              key={item}
              onClick={() => go(item)}
            >
              {item}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button className="logout-link" onClick={onLogout}>
            ↪ Sair da conta
          </button>
          <button className="user-button" onClick={() => go("Perfil")}>
            <Avatar user={user} />
            <span>
              <b>{user.name}</b>
              <small>{user.email}</small>
            </span>
          </button>
        </div>
      </aside>
      {menu && <button className="mobile-scrim" aria-label="Fechar menu" onClick={() => setMenu(false)} />}
      <main>
        <header className="topbar">
          <span>
            {familyName} / {route}
          </span>
          <div className="actions">
            <button className="text-button" onClick={() => go("Notificações")}>
              Notificações
            </button>
            <button className="user-button" aria-label="Abrir perfil" onClick={() => go("Perfil")}>
              <Avatar user={user} />
            </button>
          </div>
        </header>
        <section className="content">{children}</section>
      </main>
      <nav className="bottom-nav" aria-label="Acesso rápido">
        {items.slice(0, 4).map((item) => (
          <button className={route === item ? "active" : ""} key={item} onClick={() => go(item)}>
            {item}
          </button>
        ))}
        <button aria-expanded={menu} onClick={() => setMenu(!menu)}>
          Mais
        </button>
      </nav>
    </>
  );
}
