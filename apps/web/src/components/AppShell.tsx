import { useEffect, useState, type ReactNode } from "react";
import type { User } from "../api/client";
import { Avatar } from "./Avatar";
import { Brand } from "./Brand";
import { ThemeToggle } from "./ThemeToggle";
import { GlobalSearch } from "./GlobalSearch";
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
];
const navIcons: Record<string, ReactNode> = {
  Início: (
    <>
      <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-6v-7h-4v7H4a1 1 0 0 1-1-1z" />
    </>
  ),
  Tarefas: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="m8 12 2.5 2.5L16 9" />
    </>
  ),
  Compras: (
    <>
      <path d="M3 4h2l2.2 11.2a2 2 0 0 0 2 1.6h7.9a2 2 0 0 0 1.9-1.4L21 9H7" />
      <circle cx="10" cy="20" r="1" />
      <circle cx="18" cy="20" r="1" />
    </>
  ),
  Calendário: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 10h18" />
    </>
  ),
  Família: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  Crianças: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" />
    </>
  ),
  Saúde: (
    <>
      <path d="M20.8 8.6c0 5.4-8.8 11-8.8 11s-8.8-5.6-8.8-11A4.6 4.6 0 0 1 12 6.1a4.6 4.6 0 0 1 8.8 2.5Z" />
      <path d="M3 12h5l2-3 3.5 6 2-3H21" />
    </>
  ),
  Documentos: (
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6M8 13h8M8 17h8" />
    </>
  ),
  Financeiro: (
    <>
      <path d="M3 3v18h18" />
      <path d="m7 14 4-4 4 3 6-7" />
    </>
  ),
  Notificações: (
    <>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
    </>
  ),
  Privacidade: (
    <>
      <path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
};
export function AppShell({
  user,
  familyName,
  familyId,
  route,
  onNavigate,
  onLogout,
  dark,
  onToggleTheme,
  children,
}: {
  user: User;
  familyName?: string;
  familyId: string;
  route: string;
  onNavigate: (route: string) => void;
  onLogout: () => void;
  dark: boolean;
  onToggleTheme: () => void;
  children: ReactNode;
}) {
  const [menu, setMenu] = useState(false);
  const go = (route: string) => {
    onNavigate(route);
    setMenu(false);
  };
  useEffect(() => {
    if (!menu) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenu(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [menu]);
  return (
    <>
      <aside className={"sidebar " + (menu ? "mobile-open" : "")}>
        <Brand />
        <nav aria-label="Navegação principal">
          {items.map((item) => (
            <button
              className={"nav-link " + (route === item ? "active" : "")}
              aria-current={route === item ? "page" : undefined}
              key={item}
              onClick={() => go(item)}
            >
              <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true">
                {navIcons[item]}
              </svg>
              {item}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button className="user-button" onClick={() => go("Perfil")}>
            <Avatar user={user} />
            <span>
              <b>{user.name}</b>
              <small>{user.email}</small>
            </span>
          </button>
          <button className="logout-link" onClick={onLogout}>
            ↪ Sair da conta
          </button>
        </div>
      </aside>
      {menu && <button className="mobile-scrim" aria-label="Fechar menu" onClick={() => setMenu(false)} />}
      <main className={route === "Início" ? "dashboard-shell" : undefined}>
        <header className="topbar">
          <div className="topbar-context">
            <button
              className="menu-toggle"
              type="button"
              aria-label={menu ? "Fechar menu de navegação" : "Abrir menu de navegação"}
              aria-expanded={menu}
              onClick={() => setMenu((current) => !current)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                {menu ? <path d="m6 6 12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
              </svg>
            </button>
            <span>
              {familyName} / {route}
            </span>
          </div>
          <div className="actions">
            {route === "Início" && <GlobalSearch familyId={familyId} onNavigate={go} />}
            <ThemeToggle dark={dark} onToggle={onToggleTheme} />
            <button
              className="topbar-notifications"
              aria-label="Notificações"
              title="Notificações"
              onClick={() => go("Notificações")}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-8 12a2 2 0 0 0 4 0" />
              </svg>
              <span>Notificações</span>
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
      </nav>
    </>
  );
}
