import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

/* If anything blows up at boot (e.g. stale local data from an older build),
   fail loud with a one-click recovery instead of a silent white screen. */
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0b171d", color: "#e8f1ef", fontFamily: "'IBM Plex Sans', system-ui, sans-serif", padding: 24 }}>
          <div style={{ maxWidth: 460, textAlign: "center" }}>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 22, marginBottom: 10 }}>
              HFMC Case Tracker hit a snag
            </div>
            <p style={{ color: "#9cb3b1", fontSize: 14, lineHeight: 1.6, marginBottom: 22 }}>
              Usually this is leftover data from an older build. Clearing it takes one click and sign-in details are unchanged.
            </p>
            <button
              onClick={() => {
                try {
                  localStorage.removeItem("hfmc.casetracker.db.v9");
                  localStorage.removeItem("hfmc.casetracker.session.v9");
                } catch {
                  /* ignore */
                }
                window.location.reload();
              }}
              style={{ background: "#f2b04c", color: "#231a08", border: "none", borderRadius: 8, padding: "11px 22px", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "'Space Grotesk', sans-serif" }}
            >
              Reset local data & reload
            </button>
            <p style={{ color: "#617e7c", fontSize: 12, marginTop: 18 }}>
              {String(this.state.error?.message ?? this.state.error)}
            </p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
