import { useState } from "react";
import { useLocation } from "wouter";
import { useRegister } from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
function RegisterPage() {
  const [, setLocation] = useLocation();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const registerMutation = useRegister({
    mutation: {
      onSuccess: (data) => {
        login(data.token, data.user);
        setLocation("/dashboard");
      },
      onError: (err) => {
        const e = err;
        setError(e?.data?.error || "Registration failed. Please try again.");
      }
    }
  });
  const handleSubmit = (e) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    registerMutation.mutate({ data: { email, password } });
  };
  return <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.4 }}
  >
          <div className="flex items-center justify-center gap-2 mb-8">
            <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-semibold text-foreground">Study Companion</span>
          </div>

          <Card className="shadow-lg border-card-border">
            <CardHeader className="pb-4">
              <CardTitle className="text-xl">Create your account</CardTitle>
              <CardDescription>Start studying smarter with AI</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input
    id="email"
    type="email"
    placeholder="you@example.com"
    value={email}
    onChange={(e) => setEmail(e.target.value)}
    required
    data-testid="input-email"
    autoComplete="email"
  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password">Password</Label>
                  <Input
    id="password"
    type="password"
    placeholder="At least 8 characters"
    value={password}
    onChange={(e) => setPassword(e.target.value)}
    required
    minLength={8}
    data-testid="input-password"
    autoComplete="new-password"
  />
                </div>

                {error && <motion.p
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    className="text-sm text-destructive"
    data-testid="text-register-error"
  >
                    {error}
                  </motion.p>}

                <Button
    type="submit"
    className="w-full"
    disabled={registerMutation.isPending}
    data-testid="button-register"
  >
                  {registerMutation.isPending ? <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Creating account...
                    </> : "Create account"}
                </Button>

                <p className="text-center text-sm text-muted-foreground">
                  Already have an account?{" "}
                  <button
    type="button"
    onClick={() => setLocation("/login")}
    className="text-primary hover:underline font-medium"
    data-testid="link-login"
  >
                    Sign in
                  </button>
                </p>
              </form>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>;
}
export {
  RegisterPage as default
};
