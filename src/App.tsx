import { StoreProvider, useStore } from "./lib/store";
import Shell from "./components/Shell";
import { Toasts } from "./components/ui";
import Login from "./views/Login";
import Dashboard from "./views/Dashboard";
import CaseDetail from "./views/CaseDetail";
import Tasks from "./views/Tasks";
import Bulletin from "./views/Bulletin";
import Reports from "./views/Reports";
import Admin from "./views/Admin";
import Calculator from "./views/Calculator";

function Router() {
  const { session, route } = useStore();

  if (!session) {
    return (
      <>
        <Login />
        <Toasts />
      </>
    );
  }

  return (
    <>
      <Shell>
        {route.name === "dashboard" && <Dashboard />}
        {route.name === "case" && <CaseDetail id={route.id} />}
        {route.name === "tasks" && <Tasks />}
        {route.name === "bulletin" && <Bulletin />}
        {route.name === "calculator" && <Calculator />}
        {route.name === "reports" && <Reports />}
        {route.name === "admin" && <Admin />}
      </Shell>
      <Toasts />
    </>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Router />
    </StoreProvider>
  );
}
