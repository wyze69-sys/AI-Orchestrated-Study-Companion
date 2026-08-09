import { useState } from "react";
import { useLocation } from "wouter";
import { useLogin } from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";
import { Icon } from "@/components/icons";
function LoginPage() {
  const [, setLocation] = useLocation();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const loginMutation = useLogin({
    mutation: {
      onSuccess: (data) => {
        login(data.token, data.user);
        setLocation("/dashboard");
      },
      onError: (err) => {
        const e = err;
        setError(e?.data?.error || "Login failed. Check your credentials.");
      }
    }
  });
  const handleSubmit = (e) => {
    e.preventDefault();
    setError("");
    loginMutation.mutate({ data: { email, password } });
  };
  return <div className="auth-wrap">
      <div className="auth-art">
        <p className="eyebrow">Place your materials · Study with a tutor that stays in them</p>
        <h1>An AI study partner grounded only in what you bring.</h1>
        <p className="lead">Upload notes or a reading, and every answer, flashcard and quiz is built from your own material — with citations back to your sources.</p>
        <div className="feature-list">
          <div className="f-row">
            <Icon name="book" />
            <span>Ground every answer in your uploaded documents</span>
          </div>
          <div className="f-row">
            <Icon name="spark" />
            <span>Turn any passage into flashcards, quizzes or a plain-English explanation</span>
          </div>
          <div className="f-row">
            <Icon name="note" />
            <span>Keep live notes that the tutor can read back as you study</span>
          </div>
        </div>
      </div>
      <div className="auth-panel">
        <div className="auth-card">
          <h2 id="auth-title">Sign in</h2>
          <p className="sub" id="auth-sub">Pick up where you left off.</p>
          <form className="form-stack" onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="a-email">Email</label>
              <input
    className="input"
    id="a-email"
    type="email"
    placeholder="you@university.edu"
    value={email}
    onChange={(e) => setEmail(e.target.value)}
    required
    autoComplete="email"
    data-testid="input-email"
  />
            </div>
            <div className="field">
              <label htmlFor="a-password">Password</label>
              <input
    className="input"
    id="a-password"
    type="password"
    placeholder="••••••••"
    value={password}
    onChange={(e) => setPassword(e.target.value)}
    required
    autoComplete="current-password"
    data-testid="input-password"
  />
            </div>
            {error && <p className="err show" data-testid="text-login-error">
                {error}
              </p>}
            <div className="form-actions">
              <button className="btn btn-primary" type="submit" disabled={loginMutation.isPending} data-testid="button-login">
                {loginMutation.isPending ? "Signing in…" : "Continue"}
              </button>
            </div>
          </form>
          <p className="switch-link">
            <span>New here?</span>{" "}
            <button type="button" onClick={() => setLocation("/register")} data-testid="link-register">
              Create an account
            </button>
          </p>
        </div>
      </div>
    </div>;
}
export {
  LoginPage as default
};