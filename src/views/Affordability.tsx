import { useMemo, useState } from "react";
import { useStore } from "../lib/store";
import type { AffordabilityCheck } from "../lib/types";
import { defaultRateFor } from "../lib/calc";
import { fmtMoney, fmtMoneyCompact, inDaysISO, relTime } from "../lib/format";
import { Avatar, Chip, EmptyState } from "../components/ui";
import { IArrowR, ICalc, ICheck, ITarget } from "../components/icons";

function NumField({ label, value, onChange, prefix, suffix, hint }: { label: string; value: string; onChange: (v: string) => void; prefix?: string; suffix?: string; hint?: string }) {
  return (
    <div>
      <label className="label">{label}</label>
      <div className="relative">
        {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 mono text-[12.5px] text-[var(--ink-faint)]">{prefix}</span>}
        <input
          className="input mono"
          style={prefix ? { paddingLeft: 30 } : undefined}
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11.5px] text-[var(--ink-faint)]">{suffix}</span>}
      </div>
      {hint && <p className="text-[11px] text-[var(--ink-faint)] mt-1 mb-0">{hint}</p>}
    </div>
  );
}

function Meter({ label, value, max, color, note }: { label: string; value: number; max: number; color: string; note: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between items-baseline mb-1">
        <span className="text-[12px] text-[var(--ink-dim)]">{label}</span>
        <span className="mono text-[13px] font-semibold">{value > 0 ? fmtMoney(value) : "—"}</span>
      </div>
      <div className="h-[8px] rounded-full overflow-hidden" style={{ background: "rgba(232,241,239,0.06)" }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}77, ${color})`, transition: "width 0.8s cubic-bezier(0.22,1,0.36,1)" }} />
      </div>
      <p className="text-[11px] text-[var(--ink-faint)] mt-1 mb-0">{note}</p>
    </div>
  );
}

export default function Affordability() {
  const { db, session, nav, toast, runCheck, attachCheck, createCase, userById, visibleCases } = useStore();
  const activeBanks = db.banks.filter((b) => b.active);
  const activeStages = [...db.stages].filter((s) => s.active).sort((a, b) => a.sortOrder - b.sortOrder);

  const [customerName, setCustomerName] = useState("");
  const [income, setIncome] = useState("85000");
  const [other, setOther] = useState("0");
  const [emis, setEmis] = useState("12000");
  const [age, setAge] = useState("34");
  const [emp, setEmp] = useState<"Salaried" | "Self-Employed">("Salaried");
  const [property, setProperty] = useState("75");
  const [bank, setBank] = useState(activeBanks[0]?.label ?? "HDFC");
  const [rate, setRate] = useState("");
  const [tenure, setTenure] = useState("25");
  const [err, setErr] = useState("");
  const [result, setResult] = useState<AffordabilityCheck | null>(null);
  const [attachPick, setAttachPick] = useState<number | "">("");

  const checks = useMemo(
    () => [...db.affordabilityChecks].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [db.affordabilityChecks]
  );

  const run = () => {
    const mi = parseFloat(income), oi = parseFloat(other) || 0, em = parseFloat(emis) || 0;
    const ag = parseInt(age, 10), pvL = parseFloat(property);
    if (!mi || mi <= 0) return setErr("Monthly income is required.");
    if (!ag || ag < 18 || ag > 75) return setErr("Age must be between 18 and 75.");
    if (!pvL || pvL <= 0) return setErr("Enter the property value in ₹ lakh.");
    setErr("");
    const check = runCheck({
      customerName,
      monthlyIncome: mi,
      otherIncome: oi,
      existingEmis: em,
      age: ag,
      employmentType: emp,
      propertyValue: Math.round(pvL * 100000),
      bank,
      interestRate: rate ? parseFloat(rate) : null,
      tenureYears: tenure ? parseInt(tenure, 10) : null,
    });
    setResult(check);
    toast(check.eligible ? "success" : "info", check.eligible ? `Eligible for ${fmtMoney(check.finalEligibleLoan)} — check saved.` : "Not eligible at these inputs — check saved for audit.");
  };

  const openCaseFromResult = (k: AffordabilityCheck) => {
    const c = createCase({
      customer: k.customerName,
      bank: k.bank,
      loanAmount: k.finalEligibleLoan,
      stage: activeStages[0]?.label ?? "New Login",
      ownerId: session?.id ?? 1,
      linkCheckId: k.id,
      task: {
        description: "Collect login documents as per eligibility check",
        ownerId: session?.id ?? 1,
        waitingFor: "Client",
        whyPending: db.whyPending[0]?.label ?? "Awaiting client documents",
        dueDate: inDaysISO(3),
      },
    });
    toast("success", `${c.caseNumber} opened from ${k.customerName}'s check.`);
    nav({ name: "case", id: c.id });
  };

  const doAttach = (k: AffordabilityCheck) => {
    if (attachPick === "") return toast("error", "Pick a case to attach to.");
    attachCheck(k.id, attachPick);
    const c = db.cases.find((x) => x.id === attachPick);
    toast("success", `Check linked to ${c?.caseNumber ?? "case"}.`);
    setAttachPick("");
    if (result?.id === k.id) setResult({ ...k, caseId: attachPick });
  };

  const maxMeter = result ? Math.max(result.maxLoanByLtv, result.maxLoanByDbr, 1) : 1;
  const attachable = visibleCases().filter((c) => c.caseStatus === "Active");

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-4 items-start">
      {/* -------- input form -------- */}
      <div className="card p-5 anim-fade-up">
        <div className="flex items-center gap-2.5 mb-4">
          <span className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: "rgba(242,176,76,0.12)", color: "var(--amber)" }}>
            <ICalc size={19} />
          </span>
          <div>
            <h2 className="font-disp font-semibold text-[16px] m-0 leading-tight">Affordability check</h2>
            <p className="text-[11.5px] text-[var(--ink-faint)] m-0">LTV + DBR + age caps → eligible loan. Every run is saved.</p>
          </div>
        </div>

        <div className="space-y-3.5">
          <div>
            <label className="label">Customer / enquiry name</label>
            <input className="input" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="e.g. Ramesh Iyer" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <NumField label="Monthly income" prefix="₹" value={income} onChange={setIncome} />
            <NumField label="Other income" prefix="₹" value={other} onChange={setOther} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <NumField label="Existing EMIs" prefix="₹" value={emis} onChange={setEmis} hint="Car, personal, cards…" />
            <NumField label="Age" suffix="yrs" value={age} onChange={setAge} />
          </div>
          <div>
            <label className="label">Employment type</label>
            <div className="grid grid-cols-2 gap-2">
              {(["Salaried", "Self-Employed"] as const).map((e) => (
                <button
                  key={e}
                  className="btn btn-sm justify-center"
                  style={
                    emp === e
                      ? { background: "rgba(242,176,76,0.14)", color: "var(--amber)", borderColor: "rgba(242,176,76,0.4)" }
                      : { background: "transparent", color: "var(--ink-dim)", borderColor: "var(--line)" }
                  }
                  onClick={() => setEmp(e)}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <NumField label="Property value" prefix="₹" suffix="L" value={property} onChange={setProperty} />
            <div>
              <label className="label">Bank</label>
              <select className="select" value={bank} onChange={(e) => { setBank(e.target.value); setRate(""); }}>
                {activeBanks.map((b) => (
                  <option key={b.id}>{b.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <NumField label="Interest rate" suffix="%" value={rate} onChange={setRate} hint={`Blank → ${bank} desk rate ${defaultRateFor(bank)}%`} />
            <NumField label="Tenure" suffix="yrs" value={tenure} onChange={setTenure} hint="Capped by age automatically" />
          </div>
        </div>

        {err && <p className="text-[12.5px] mt-2 mb-0" style={{ color: "var(--coral)" }}>{err}</p>}
        <button className="btn btn-primary w-full justify-center mt-4" onClick={run}>
          <ITarget size={15} /> Run check
        </button>
      </div>

      {/* -------- result + history -------- */}
      <div className="space-y-4">
        {result ? (
          <div key={result.id} className="card p-5 anim-scale-in" style={{ borderColor: result.eligible ? "rgba(67,214,155,0.35)" : "rgba(242,115,99,0.35)" }}>
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <span
                className="font-disp font-bold text-[15px] px-3 py-1.5 rounded-lg inline-flex items-center gap-2"
                style={
                  result.eligible
                    ? { background: "rgba(67,214,155,0.12)", color: "var(--mint)" }
                    : { background: "rgba(242,115,99,0.12)", color: "var(--coral)" }
                }
              >
                {result.eligible ? <ICheck size={16} /> : <ITarget size={16} />}
                {result.eligible ? "ELIGIBLE" : "NOT ELIGIBLE"}
              </span>
              <div className="min-w-0">
                <div className="font-disp font-semibold text-[15px]">{result.customerName}</div>
                <div className="text-[11.5px] text-[var(--ink-faint)]">
                  {result.bank} · {result.employmentType} · {result.age}y · @{result.interestRate}% · {result.tenureYears}y tenure
                  {result.caseId ? " · linked to a case" : " · unlinked"}
                </div>
              </div>
              <div className="ml-auto text-right">
                <div className="text-[10.5px] uppercase tracking-[0.12em] text-[var(--ink-faint)]">Eligible loan</div>
                <div className="font-disp font-bold text-[28px] leading-none" style={{ color: result.eligible ? "var(--mint)" : "var(--coral)" }}>
                  {result.finalEligibleLoan > 0 ? fmtMoney(result.finalEligibleLoan) : "—"}
                </div>
                {result.estimatedEmi > 0 && <div className="mono text-[12px] text-[var(--ink-dim)] mt-1">EMI ≈ ₹{result.estimatedEmi.toLocaleString("en-IN")}/mo</div>}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Meter
                label={`LTV ceiling · ${result.applicableLtv}% of property`}
                value={result.maxLoanByLtv}
                max={maxMeter}
                color="#57c2ea"
                note={`Property ${fmtMoney(result.propertyValue)} × ${result.applicableLtv}%`}
              />
              <Meter
                label={`DBR ceiling · ${result.maxDbrPct}% of gross income`}
                value={result.maxLoanByDbr}
                max={maxMeter}
                color="#f2b04c"
                note={
                  result.availableDbrEmi > 0
                    ? `EMI room left: ₹${result.availableDbrEmi.toLocaleString("en-IN")}/mo after existing EMIs`
                    : "Existing EMIs already exhaust the DBR limit"
                }
              />
            </div>

            <div className="flex flex-wrap gap-2 mt-3 text-[11.5px] text-[var(--ink-dim)]">
              <Chip tone="slate">Max tenure by age: {Math.max(0, result.maxTenureByAge)}y</Chip>
              {result.eligible && <Chip tone={result.finalEligibleLoan === result.maxLoanByDbr ? "amber" : "sky"}>Binding cap: {result.finalEligibleLoan === result.maxLoanByDbr ? "DBR" : "LTV"}</Chip>}
              {!result.eligible && result.availableDbrEmi <= 0 && <Chip tone="coral">DBR exhausted</Chip>}
              {!result.eligible && result.maxTenureByAge < 5 && <Chip tone="coral">Age leaves &lt; 5y tenure</Chip>}
              <Chip tone="slate">Saved {relTime(result.createdAt)} by {userById(result.createdBy)?.name ?? "—"}</Chip>
            </div>

            {!result.caseId && (
              <div className="flex flex-wrap items-center gap-2 mt-4 pt-4" style={{ borderTop: "1px solid var(--line-soft)" }}>
                <button className="btn btn-mint" onClick={() => openCaseFromResult(result)}>
                  <IArrowR size={15} /> Open case from this
                </button>
                <div className="flex items-center gap-2">
                  <select className="select" style={{ width: 240 }} value={attachPick} onChange={(e) => setAttachPick(e.target.value === "" ? "" : parseInt(e.target.value, 10))}>
                    <option value="">Attach to existing case…</option>
                    {attachable.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.caseNumber} · {c.customer}
                      </option>
                    ))}
                  </select>
                  <button className="btn btn-ghost" onClick={() => doAttach(result)}>
                    Link
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="card p-8 text-center anim-fade-up">
            <ICalc size={30} className="mx-auto text-[var(--ink-faint)]" />
            <p className="text-[13px] text-[var(--ink-dim)] mt-3 mb-0">Fill the enquiry on the left and run the check.</p>
            <p className="text-[11.5px] text-[var(--ink-faint)] mt-1">The verdict, both ceilings and the EMI are stored — so eligibility stays auditable even if bank rules change later.</p>
          </div>
        )}

        {/* -------- saved checks -------- */}
        <div className="card anim-fade-up" style={{ animationDelay: "0.1s" }}>
          <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: "var(--line-soft)" }}>
            <h3 className="font-disp font-semibold text-[13.5px] m-0">Saved checks</h3>
            <span className="mono text-[11.5px] text-[var(--ink-faint)]">{checks.length} runs</span>
          </div>
          {checks.length === 0 ? (
            <EmptyState icon={<ICalc size={26} />} title="No checks run yet" body="Run the first affordability check — every run lands here for audit." />
          ) : (
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Bank</th>
                    <th>Gross income</th>
                    <th>Eligible loan</th>
                    <th>EMI</th>
                    <th>Verdict</th>
                    <th>Case</th>
                    <th>Run by</th>
                  </tr>
                </thead>
                <tbody>
                  {checks.map((k) => {
                    const linked = k.caseId ? db.cases.find((c) => c.id === k.caseId) : null;
                    return (
                      <tr key={k.id} style={{ cursor: linked ? "pointer" : "default" }} onClick={() => linked && nav({ name: "case", id: linked.id })}>
                        <td>
                          <div className="font-medium text-[13px]">{k.customerName}</div>
                          <div className="text-[11px] text-[var(--ink-faint)]">{relTime(k.createdAt)}</div>
                        </td>
                        <td className="text-[var(--ink-dim)]">{k.bank}</td>
                        <td className="mono text-[12.5px]">{fmtMoneyCompact(k.monthlyIncome + k.otherIncome)}/mo</td>
                        <td className="mono font-semibold text-[13px]">{k.finalEligibleLoan > 0 ? fmtMoneyCompact(k.finalEligibleLoan) : "—"}</td>
                        <td className="mono text-[12.5px] text-[var(--ink-dim)]">{k.estimatedEmi > 0 ? `₹${Math.round(k.estimatedEmi / 1000)}k` : "—"}</td>
                        <td>{k.eligible ? <Chip tone="mint">Eligible</Chip> : <Chip tone="coral">Declined</Chip>}</td>
                        <td>
                          {linked ? (
                            <span className="mono text-[11.5px]" style={{ color: "var(--amber)" }}>{linked.caseNumber}</span>
                          ) : (
                            <span className="text-[11.5px] text-[var(--ink-faint)]">unlinked</span>
                          )}
                        </td>
                        <td>
                          <div className="flex items-center gap-1.5">
                            <Avatar name={userById(k.createdBy)?.name ?? "?"} size={22} />
                            <span className="text-[12px] text-[var(--ink-dim)]">{userById(k.createdBy)?.name?.split(" ")[0] ?? "—"}</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

