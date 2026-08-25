import { useMemo, useState } from "react";
import { useStore } from "../lib/store";
import { LogoMark, IArrowR } from "../components/icons";
import { useReveal } from "../components/charts";

const DEMO = [
  { label: "Admin", email: "admin@hfmc.in", pw: "admin123" },
  { label: "Team Lead", email: "sara@hfmc.in", pw: "demo123" },
  { label: "SPO", email: "rohan@hfmc.in", pw: "demo123" },
];

export default function Login() {
  const { db, login, nav, toast } = useStore();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [shakeKey, setShakeKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const on = useReveal(150);

  const pipeline = useMemo(() => {
    const active = [...db.stages].sort((a, b) => a.sortOrder - b.sortOrder).filter((s) => s.label !== "Closed");
    const rows = active.map((s) => ({
      label: s.label,
      n: db.cases.filter((c) => c.stage === s.label).length,
    }));
    const max = Math.max(...rows.map((r) => r.n), 1);
    return { rows, max };
  }, [db.stages, db.cases]);

  const inFlight = db.cases.filter((c) => c.stage !== "Closed").length;
  const openTasks = db.tasks.filter((t) => t.status === "Open").length;
  const closed = db.cases.length - inFlight;

  const doLogin = (e: string, p: string) => {
    setBusy(true);
    window.setTimeout(() => {
      const res = login(e, p);
      setBusy(false);
      if (res) {
        setErr(res);
        setShakeKey((k) => k + 1);
      } else {
        toast("success", "Signed in. The pipeline is live.");
        nav({ name: "dashboard" });
      }
    }, 420);
  };

  return (
    <div className="min-h-screen flex">
      <div className="app-bg" />

      {/* left: the pipeline itself */}
      <div className="hidden lg:flex flex-col w-[52%] p-10 xl:p-14 relative overflow-hidden" style={{ borderRight: "1px solid var(--line-soft)" }}>
        <div className="flex items-center gap-3">
          <LogoMark size={38} />
          <div>
            <p className="font-disp font-bold text-[17px] leading-none m-0 tracking-tight">Case Tracker</p>
            <p className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-faint)] mt-1 mb-0">HFMC · Home Finance</p>
          </div>
        </div>

        <div className="mt-auto">
          <h1 className="font-disp font-bold text-[34px] xl:text-[40px] leading-[1.08] tracking-tight m-0 max-w-[480px]">
            Every loan file.
            <br />
            One honest <span style={{ color: "var(--amber)" }}>pipeline</span>.
          </h1>
          <p className="text-[14px] text-[var(--ink-dim)] max-w-[430px] mt-4 mb-8">
            Stages, next actions, waiting-fors and ageing — shared by the whole team,
            so the Monday review starts with facts instead of status calls.
          </p>

          <div className="card p-5 max-w-[520px]">
            <div className="flex items-center justify-between mb-4">
              <p className="font-disp text-[11px] font-semibold uppercase tracking-[0.13em] text-[var(--ink-faint)] m-0">Live pipeline · by stage</p>
              <span className="flex items-center gap-1.5 text-[11px] mono text-[var(--ink-dim)]"><span className="dot-live" /> real data</span>
            </div>
            <div className="space-y-[9px]">
              {pipeline.rows.map((r, i) => (
                <div key={r.label} className="flex items-center gap-3">
                  <span className="mono text-[10.5px] text-[var(--ink-faint)] w-4 text-right">{String(i + 1).padStart(2, "0")}</span>
                  <span className="text-[12.5px] text-[var(--ink-dim)] w-[148px] shrink-0 truncate">{r.label}</span>
                  <div className="flex-1 h-[9px] rounded-full overflow-hidden" style={{ background: "rgba(232,241,239,0.05)" }}>
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: on ? `${(r.n / pipeline.max) * 100}%` : "0%",
                        background: r.n === pipeline.max && r.n > 0
                          ? "linear-gradient(90deg, rgba(242,176,76,0.5), var(--amber))"
                          : "linear-gradient(90deg, rgba(87,194,234,0.35), rgba(87,194,234,0.75))",
                        transition: `width 0.9s cubic-bezier(0.22,1,0.36,1) ${i * 60}ms`,
                      }}
                    />
                  </div>
                  <span className="mono text-[12px] w-5 text-right">{r.n}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-5 mt-5 pt-4" style={{ borderTop: "1px dashed var(--line)" }}>
              <div><p className="mono text-[19px] font-semibold m-0 leading-none">{inFlight}</p><p className="text-[10.5px] text-[var(--ink-faint)] uppercase tracking-[0.1em] mt-1 mb-0">in flight</p></div>
              <div><p className="mono text-[19px] font-semibold m-0 leading-none" style={{ color: "var(--amber)" }}>{openTasks}</p><p className="text-[10.5px] text-[var(--ink-faint)] uppercase tracking-[0.1em] mt-1 mb-0">open tasks</p></div>
              <div><p className="mono text-[19px] font-semibold m-0 leading-none" style={{ color: "var(--mint)" }}>{closed}</p><p className="text-[10.5px] text-[var(--ink-faint)] uppercase tracking-[0.1em] mt-1 mb-0">closed won</p></div>
            </div>
          </div>
        </div>
      </div>

      {/* right: sign in */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-[400px] anim-fade-up">
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <LogoMark size={36} />
            <div>
              <p className="font-disp font-bold text-[16px] leading-none m-0">Case Tracker</p>
              <p className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-faint)] mt-1 mb-0">HFMC · Home Finance</p>
            </div>
          </div>

          <p className="font-disp text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--amber)] m-0">Team sign in</p>
          <h2 className="font-disp font-bold text-[26px] tracking-tight mt-2 mb-1">Back to the floor</h2>
          <p className="text-[13px] text-[var(--ink-faint)] mt-0 mb-6">Use your HFMC credentials. Access is scoped to your role.</p>

          <div key={shakeKey} className={err ? "anim-shake" : ""}>
            <div className="card p-5" style={{ borderColor: err ? "rgba(242,115,99,0.5)" : undefined }}>
              <label className="label" htmlFor="email">Email</label>
              <input
                id="email"
                className="input"
                type="email"
                placeholder="you@hfmc.in"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setErr(null); }}
                onKeyDown={(e) => e.key === "Enter" && doLogin(email, pw)}
                autoFocus
              />
              <label className="label mt-4" htmlFor="pw">Password</label>
              <input
                id="pw"
                className="input mono"
                type="password"
                placeholder="••••••••"
                value={pw}
                onChange={(e) => { setPw(e.target.value); setErr(null); }}
                onKeyDown={(e) => e.key === "Enter" && doLogin(email, pw)}
              />
              {err && <p className="text-[12.5px] mt-3 mb-0" style={{ color: "var(--coral)" }}>{err}</p>}
              <button className="btn btn-primary w-full mt-5 justify-center !py-2.5" disabled={busy} onClick={() => doLogin(email, pw)}>
                {busy ? "Checking…" : <>Sign in <IArrowR size={15} /></>}
              </button>
            </div>
          </div>

          <div className="mt-6">
            <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--ink-faint)] font-disp font-semibold mb-2.5">Demo roles — one tap</p>
            <div className="flex flex-wrap gap-2">
              {DEMO.map((d) => (
                <button
                  key={d.label}
                  className="btn btn-ghost btn-sm"
                  onClick={() => { setEmail(d.email); setPw(d.pw); setErr(null); doLogin(d.email, d.pw); }}
                >
                  {d.label}
                </button>
              ))}
            </div>
            <p className="mono text-[11px] text-[var(--ink-faint)] mt-3 mb-0">admin@hfmc.in / admin123 · everyone else / demo123</p>
          </div>
        </div>
      </div>
    </div>
  );
}
