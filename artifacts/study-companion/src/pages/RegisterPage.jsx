import { useState } from "react";
import { useLocation } from "wouter";
import { useRegister } from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";
import { Icon } from "@/components/icons";
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
          <h2>Create account</h2>
          <p className="sub">Start building a study room for your next exam.</p>
          <form className="form-stack" onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="r-email">Email</label>
              <input
    className="input"
    id="r-email"
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
              <label htmlFor="r-password">Password</label>
              <input
    className="input"
    id="r-password"
    type="password"
    placeholder="At least 8 characters"
    value={password}
    onChange={(e) => setPassword(e.target.value)}
    required
    minLength={8}
    autoComplete="new-password"
    data-testid="input-password"
  />
            </div>
            {error && <p className="err show" data-testid="text-register-error">
                {error}
              </p>}
            <div className="form-actions">
              <button className="btn btn-primary" type="submit" disabled={registerMutation.isPending} data-testid="button-register">
                {registerMutation.isPending ? "Creating account…" : "Create account"}
              </button>
            </div>
          </form>
          <p className="switch-link">
            <span>Have an account?</span>{" "}
            <button type="button" onClick={() => setLocation("/login")} data-testid="link-login">
              Sign in
            </button>
          </p>
        </div>
      </div>
    </div>;
}
export {
  RegisterPage as default
};