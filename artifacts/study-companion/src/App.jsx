import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import LoginPage from "@/pages/LoginPage";
import RegisterPage from "@/pages/RegisterPage";
import DashboardPage from "@/pages/DashboardPage";
import WorkspacePage from "@/pages/WorkspacePage";
import NotFound from "@/pages/not-found";
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 3e4
    }
  }
});
function ProtectedRoute({ component: Component }) {
  const { token, isLoading } = useAuth();
  if (isLoading) return null;
  if (!token) return <Redirect to="/login" />;
  return <Component />;
}
function PublicRoute({ component: Component }) {
  const { token, isLoading } = useAuth();
  if (isLoading) return null;
  if (token) return <Redirect to="/dashboard" />;
  return <Component />;
}
function Router() {
  return <Switch>
      <Route path="/" component={() => {
    const { token, isLoading } = useAuth();
    if (isLoading) return null;
    return <Redirect to={token ? "/dashboard" : "/login"} />;
  }} />
      <Route path="/login" component={() => <PublicRoute component={LoginPage} />} />
      <Route path="/register" component={() => <PublicRoute component={RegisterPage} />} />
      <Route path="/dashboard" component={() => <ProtectedRoute component={DashboardPage} />} />
      <Route path="/workspace/:id" component={() => <ProtectedRoute component={WorkspacePage} />} />
      <Route component={NotFound} />
    </Switch>;
}
function App() {
  return <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>;
}
var stdin_default = App;
export {
  stdin_default as default
};
