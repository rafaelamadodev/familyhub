import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, api, send, setSession, type User } from "../api/client";
import { familyApi } from "../api/families";
import { AppShell, HousePage } from "../components/AppShell";
import { FamilyOnboarding } from "../components/FamilyOnboarding";
import { AsyncState } from "../components/ui/AsyncState";
import { AuthPage } from "../pages/AuthPage";
import { DashboardPage } from "../pages/DashboardPage";
import { FamilyPage } from "../pages/FamilyPage";
import { ProfilePage } from "../pages/ProfilePage";
import { TasksPage } from "../features/tasks/TasksPage";
import { ShoppingPage } from "../features/shopping/ShoppingPage";
import { CalendarPage } from "../features/calendar/CalendarPage";
import { ChildrenPage } from "../features/children/ChildrenPage";
import { HealthPage } from "../features/health/HealthPage";
import { DocumentsPage } from "../features/documents/DocumentsPage";
import { FinancePage } from "../features/finance/FinancePage";
import { PrivacyPage } from "../features/privacy/PrivacyPage";
import { NotificationsPage } from "../features/notifications/NotificationsPage";

const tokenFromHash = () => {
  const hash = new URLSearchParams(location.hash.slice(1));
  for (const kind of ["verify", "reset"]) if (hash.get(kind)) return { kind, token: hash.get(kind)! };
  return null;
};
export function App() {
  const client = useQueryClient();
  const [dark, setDark] = useState(() => localStorage.getItem("familyhub.theme") === "dark");
  const [user, setUser] = useState<User | null>(null);
  const [boot, setBoot] = useState(true);
  const [tokenAction, setTokenAction] = useState(tokenFromHash);
  const [invite, setInvite] = useState(
    new URLSearchParams(location.hash.slice(1)).get("invite") ??
      sessionStorage.getItem("familyhub.invite") ??
      "",
  );
  const [route, setRoute] = useState("Início");
  const [familyId, setFamilyId] = useState("");
  const [focusedId, setFocusedId] = useState("");
  const [notice, setNotice] = useState("");
  const [offline, setOffline] = useState(!navigator.onLine);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const result = params.get("googleCalendar");
    const googleAuth = params.get("googleAuth");
    if (result) {
      const family = params.get("familyId");
      if (family) setFamilyId(family);
      setRoute("Família");
      setNotice(
        result === "connected"
          ? "Google Agenda conectado. Você já pode escolher o calendário e sincronizar seus compromissos."
          : "Não foi possível conectar ao Google Agenda. Confira as configurações e tente novamente.",
      );
    }
    if (googleAuth) {
      setNotice(
        googleAuth === "success"
          ? "Entrada com Google concluída. Bem-vindo ao FamilyHub."
          : "Não foi possível entrar com o Google. Tente novamente.",
      );
    }
    if (!result && !googleAuth) return;
    params.delete("googleCalendar");
    params.delete("googleAuth");
    params.delete("familyId");
    const query = params.toString();
    history.replaceState(null, "", location.pathname + (query ? `?${query}` : "") + location.hash);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#11131b" : "#f7f8fc");
    localStorage.setItem("familyhub.theme", dark ? "dark" : "light");
  }, [dark]);
  const toggleTheme = () => setDark((current) => !current);
  const me = useQuery({
    queryKey: ["me"],
    queryFn: api.me,
    enabled: boot || Boolean(user),
    retry: false,
    refetchOnWindowFocus: true,
  });
  const families = useQuery({
    queryKey: ["families", user?.id],
    queryFn: familyApi.list,
    enabled: Boolean(user),
    retry: false,
    refetchInterval: 10000,
  });
  const clear = () => {
    setSession(null);
    setUser(null);
    setBoot(false);
    setFamilyId("");
    setRoute("Início");
    client.clear();
  };
  useEffect(() => {
    if (invite) sessionStorage.setItem("familyhub.invite", invite);
  }, [invite]);
  useEffect(() => {
    if (me.data) {
      setUser(me.data.user);
      setBoot(false);
    }
    if (me.isError && boot) {
      setBoot(false);
      setNotice(
        me.error instanceof ApiError && me.error.status === 400
          ? "Não foi possível restaurar a sessão. Entre com seu e-mail e senha."
          : me.error.message,
      );
    }
  }, [me.data, me.isError]);
  useEffect(() => {
    const expired = () => {
      clear();
      setNotice("Sua sessão expirou. Entre novamente.");
    };
    const connected = () => setOffline(!navigator.onLine);
    window.addEventListener("familyhub:expired", expired);
    window.addEventListener("online", connected);
    window.addEventListener("offline", connected);
    return () => {
      window.removeEventListener("familyhub:expired", expired);
      window.removeEventListener("online", connected);
      window.removeEventListener("offline", connected);
    };
  }, []);
  const logout = async () => {
    try {
      await api.logout();
    } catch (error) {
      setNotice((error as Error).message || "A sessão será encerrada neste dispositivo.");
    } finally {
      // Always leave the authenticated UI, even if the API is temporarily unavailable.
      clear();
    }
  };
  const navigate = (target: string) => {
    const [nextRoute, id] = target.split("/");
    setRoute(nextRoute);
    setFocusedId(id ?? "");
    setNotice("");
    window.scrollTo({ top: 0 });
  };
  if (boot && !tokenAction)
    return (
      <div className="startup" role="status">
        Abrindo seu FamilyHub…
      </div>
    );
  if (!user || tokenAction)
    return (
      <AuthPage
        notice={notice}
        tokenAction={tokenAction}
        dark={dark}
        onToggleTheme={toggleTheme}
        onLogin={async (credentials) => {
          const result = await api.login(credentials);
          if ("mfaRequired" in result) return result;
          client.clear();
          setSession(null);
          setUser(result.user);
          setTokenAction(null);
          setNotice("");
          return {};
        }}
      />
    );
  const member = families.data?.find((item) => item.family.id === familyId) ?? families.data?.[0];
  const family = member?.family;
  const admin = member?.role === "ADMIN";
  const readOnly = member?.role === "VIEWER";
  const verification = !user.emailVerified && (
    <div className="verification-banner">
      <p>Verifique seu e-mail para aceitar convites e acessar dados restritos.</p>
      <button
        className="text-button"
        onClick={async () => {
          try {
            await send("/api/v1/auth/resend-verification", "POST");
            setNotice("Instruções enviadas ao seu e-mail.");
          } catch (error) {
            setNotice((error as Error).message);
          }
        }}
      >
        Reenviar confirmação
      </button>
      <button className="text-button" onClick={() => me.refetch()}>
        Já confirmei
      </button>
    </div>
  );
  if (families.isPending || families.isError)
    return (
      <div className="startup">
        <AsyncState pending={families.isPending} error={families.error} retry={families.refetch}>
          <></>
        </AsyncState>
        <button className="text-button" onClick={logout}>
          Sair da conta
        </button>
      </div>
    );
  if (!family) {
    if (!user.emailVerified)
      return (
        <div className="startup panel">
          <h1>Confirme seu e-mail</h1>
          {verification}
          {notice && <p role="status">{notice}</p>}
          <button className="text-button" onClick={logout}>
            Sair
          </button>
        </div>
      );
    return (
      <FamilyOnboarding
        initialCode={invite}
        onLogout={logout}
        onCreate={async (data) => {
          const result = await familyApi.create(data);
          setFamilyId(result.id);
          await families.refetch();
          setRoute("Família");
        }}
        onJoin={async (code) => {
          const result = await familyApi.join(code);
          setFamilyId(result.family.id);
          setInvite("");
          sessionStorage.removeItem("familyhub.invite");
          history.replaceState(null, "", location.pathname);
          await families.refetch();
        }}
      />
    );
  }
  const sensitive: Record<string, string> = {
    Crianças: "children",
    Saúde: "health",
    Documentos: "documents",
    Financeiro: "finance",
  };
  const denied =
    sensitive[route] &&
    (!user.emailVerified || (!admin && !member?.sensitivePermissions.includes(sensitive[route])));
  let content;
  if (denied)
    content = (
      <section className="panel">
        <h1>Acesso restrito</h1>
        <p>
          {!user.emailVerified
            ? "Confirme seu e-mail para acessar este módulo."
            : "Peça ao administrador permissão para acessar este módulo."}
        </p>
      </section>
    );
  else
    switch (route) {
      case "Casa":
        content = <HousePage onNavigate={navigate} />;
        break;
      case "Início":
        content = (
          <DashboardPage
            name={user.name}
            familyName={family.name}
            familyId={family.id}
            readOnly={readOnly}
            onNavigate={navigate}
          />
        );
        break;
      case "Tarefas":
        content = (
          <TasksPage
            familyId={family.id}
            timezone={family.timezone}
            readOnly={readOnly}
            focusedId={focusedId}
          />
        );
        break;
      case "Compras":
        content = <ShoppingPage familyId={family.id} readOnly={readOnly} />;
        break;
      case "Calendário":
        content = (
          <CalendarPage
            familyId={family.id}
            timezone={family.timezone}
            readOnly={readOnly}
            focusedId={focusedId}
          />
        );
        break;
      case "Família":
        content = <FamilyPage key={family.id} family={family} admin={admin} />;
        break;
      case "Crianças":
        content = <ChildrenPage familyId={family.id} timezone={family.timezone} admin={admin} />;
        break;
      case "Saúde":
        content = <HealthPage familyId={family.id} timezone={family.timezone} />;
        break;
      case "Documentos":
        content = <DocumentsPage familyId={family.id} />;
        break;
      case "Financeiro":
        content = <FinancePage familyId={family.id} />;
        break;
      case "Privacidade":
        content = <PrivacyPage familyId={family.id} />;
        break;
      case "Notificações":
        content = (
          <NotificationsPage
            onOpen={(id, target) => {
              setFamilyId(id);
              navigate(target);
            }}
          />
        );
        break;
      default:
        content = (
          <ProfilePage
            user={user}
            onUser={setUser}
            onSessionEnded={() => {
              clear();
              setNotice("Sessão encerrada. Entre novamente.");
            }}
          />
        );
    }
  return (
    <AppShell
      user={user}
      familyName={family.name}
      familyId={family.id}
      route={route}
      onNavigate={navigate}
      onLogout={logout}
      dark={dark}
      onToggleTheme={toggleTheme}
    >
      {offline && (
        <p className="form-error" role="alert">
          Você está offline. As alterações precisam de conexão para serem salvas.
        </p>
      )}
      {notice && (
        <p className="form-notice" role="status">
          {notice}
        </p>
      )}
      {verification}
      {families.data && families.data.length > 1 && (
        <label className="family-selector">
          Família ativa
          <select
            value={family.id}
            onChange={(e) => {
              setFamilyId(e.target.value);
              client.removeQueries({
                predicate: (query) => query.queryKey[0] !== "families" && query.queryKey[0] !== "me",
              });
            }}
          >
            {families.data.map((item) => (
              <option key={item.family.id} value={item.family.id}>
                {item.family.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {invite && (
        <section className="panel">
          <h2>Você recebeu um convite</h2>
          <button
            className="button button-primary"
            onClick={async () => {
              try {
                const result = await familyApi.join(invite);
                setFamilyId(result.family.id);
                setInvite("");
                sessionStorage.removeItem("familyhub.invite");
                history.replaceState(null, "", location.pathname);
                await families.refetch();
              } catch (error) {
                setNotice((error as Error).message);
              }
            }}
          >
            Aceitar convite
          </button>
          <button
            className="text-button"
            onClick={() => {
              setInvite("");
              sessionStorage.removeItem("familyhub.invite");
              history.replaceState(null, "", location.pathname);
            }}
          >
            Dispensar
          </button>
        </section>
      )}
      <div key={family.id + route}>{content}</div>
    </AppShell>
  );
}
