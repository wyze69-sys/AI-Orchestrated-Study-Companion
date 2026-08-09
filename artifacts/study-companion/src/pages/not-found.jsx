import { useLocation } from "wouter";
import { Icon } from "@/components/icons";
function NotFound() {
  const [, setLocation] = useLocation();
  return <div className="page-wrap center" style={{ minHeight: "100vh" }}>
      <div className="not-found">
        <div className="brand">
          <span className="brand-icon"><Icon name="book" className="icon-lg" /></span>
          <span className="brand-word">STUDY COMPANION</span>
        </div>
        <div className="tagline">404 — page not found.</div>
        <p className="muted" style={{ marginBottom: 24 }}>
          The page you're looking for doesn't exist. Back to your study space.
        </p>
        <button className="btn btn-primary" onClick={() => setLocation("/dashboard")}>
          <Icon name="arrow" className="icon-sm rotated-180" />
          Back to dashboard
        </button>
      </div>
    </div>;
}
export {
  NotFound as default
};