import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./app/App";
import "./styles.css";
import "./focus.css";
import "./premium.css";
import "./family.css";
import "./application.css";
import "./theme.css";
import "./auth.css";
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 2000 } } });
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <App />
  </QueryClientProvider>,
);
