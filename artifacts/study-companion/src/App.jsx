import { lazy, Suspense } from "react";
import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { Spinner } from "@/components/ui/spinner";

const LoginPage = lazy(() => import("@/pages/LoginPage"));
const RegisterPage = lazy(() => import("@/pages/RegisterPage"));
const DashboardPage = lazy(() => import("@/pages/DashboardPage"));
const WorkspacePage = lazy(() => import("@/pages/WorkspacePage"));
const NotFound = lazy(() => import("@/pages/not-found"));

function PageFallback() {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-background">
      <Spinner className="size-8 text-primary" />
    </div>
  );
}

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
  return (
    <Suspense fallback={<PageFallback />}>
      <Switch>
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
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

var stdin_default = App;
export {
  stdin_default as default
};
