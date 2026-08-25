import { useMemo, useState } from "react";
import { computeAffordability, defaultRateFor } from "../lib/calc";
import type { AffordabilityResult, CalcInput } from "../lib/calc";
import { useStore } from "../lib/store";
import type { AffordabilityCheck } from "../lib/types";
import { fmtMoney, fmtRate, relTime } from "../lib/format";
import { Avatar, Chip, EmptyState, Modal, Seg } from "../components/ui";
import { IArrowR, ICalc, ICheck, ITarget } from "../components/icons";

const num = (s: string) => Number(s) || 0;

function Row({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="text-[12.5px] text-[var(--ink-dim)]">{label}</span>
      <span className={`mono ${strong ? "text-[15px] font-bold" : "text-[13px]"}`} style={tone ? { color: tone } : undefined}>{value}</span>
    </div>
  );
}

function AttachModal({ check, onClose }: { check: AffordabilityCheck; onClose: () => void }) {
  const { db, linkCheckToCase, nav, toast } = useStore();
  const [caseId, setCaseId] = useState<number>(0);
  const active = db.cases.filter((c) => c.caseStatus === "Active").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return (
    <Modal title="Link check to a case" sub={check.customerName} onClose={onClose} width={460} footer={
      <>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={!caseId} onClick={() => {
          linkCheckToCase(check.id, caseId);
          toast("success", "Check linked to the case file.");
          onClose();
          nav({ name: "case", id: caseId });
        }}>
          <IArrowR size={14} /> Link it
        </button>
      </>
    }>
      <label className="label">Attach this {fmtMoney(check.finalEligibleLoan)} verdict to</label>
      <select className="select" value={caseId} onChange={(e) => setCaseId(Number(e.target.value))}>
        <option value={0}>Select a case…</option>
        {active.map((c) => (
          <option key={c.id} value={c.id}>{c.caseNumber} · {c.customer} · {c.stage}</option>
        ))}
      </select>
    </Modal>
  );
}

export default function Affordability() {
  const { db, session, userById, runCheck, createCaseFromCheck, nav, toast } = useStore();
  const [customer, setCustomer] = useState("");
  const [income, setIncome] = useState("35000");
  const [other, setOther] = useState("0");
  const [emis, setEmis] = useState("4000");
  const [age, setAge] = useState("32");
  const [emp, setEmp] = useState<"Salaried" | "Self-Employed">("Salaried");
  const [propValue, setPropValue] = useState("2000000");
  const [bank, setBank] = useState(db.banks[0]?.name ?? "ADCB");
  const [rateMode, setRateMode] = useState<"desk" | "custom">("desk");
  const [rate, setRate] = useState("4.5");
  const [tenureMode, setTenureMode] = useState<"auto" | "custom">("auto");
  const [tenure, setTenure] = useState("25");
  const [result, setResult] = useState<{ r: AffordabilityResult; savedId: number } | null>(null);
  const [attach, setAttach] = useState<AffordabilityCheck | null>(null);
  const [err, setErr] = useState("");

  const checks = useMemo(
    () => [...db.affordabilityChecks].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [db.affordabilityChecks]
  );

  const deskRate = defaultRateFor(bank);
  const rateUsed = rateMode === "desk" ? deskRate : num(rate);

  const run = () => {
    if (!customer.trim()) return setErr("Customer name is required.");
    if (num(income) <= 0) return setErr("Monthly income must be above zero.");
    if (num(propValue) <= 0) return setErr("Property value must be above zero.");
    if (num(age) < 18 || num(age) > 70) return setErr("Age must be between 18 and 70.");
    setErr("");
    const input: CalcInput = {
      monthlyIncome: num(income), otherIncome: num(other), existingEmis: num(emis),
      age: num(age), employmentType: emp, propertyValue: num(propValue), bank,
      interestRate: rateMode === "desk" ? null : num(rate),
      tenureYears: tenureMode === "auto" ? null : num(tenure),
    };
    const r = computeAffordability(input);
    const saved = [...db.affordabilityChecks].sort((a, b) => b.id - a.id)[0];
    runCheck(input, customer);
    setResult({ r, savedId: (saved?.id ?? 0) + 1 }); // store assigns max+1
    toast("success", "Check saved to the audit trail.");
  };

  const saveAsCase = () => {
    if (!result) return;
    const c = createCaseFromCheck(result.savedId);
    if (!c) return;
    toast("success", `${c.caseNumber} opened for ${c.customer} at ${fmtMoney(c.loanAmount)}.`);
    nav({ name: "case", id: c.id });
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_400px] gap-4 items-start">
      {/* input panel */}
      <div className="card p-5 anim-fade-up">
        <div className="flex items-center gap-2 mb-1">
          <ICalc size={17} className="text-[var(--amber)]" />
          <h2 className="font-disp font-semibold text-[16px] m-0">Affordability check</h2>
        </div>
        <p className="text-[12px] text-[var(--ink-faint)] mt-0 mb-4">LTV + debt-burden + age/tenure in one verdict. Every run is saved, so eligibility stays auditable.</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div className="sm:col-span-2">
            <label className="label">Customer name</label>
            <input className="input" value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="e.g. John Okafor" />
          </div>
          <div>
            <label className="label">Monthly income (AED)</label>
            <input className="input mono" type="number" value={income} onChange={(e) => setIncome(e.target.value)} />
          </div>
          <div>
            <label className="label">Other income (AED)</label>
            <input className="input mono" type="number" value={other} onChange={(e) => setOther(e.target.value)} />
          </div>
          <div>
            <label className="label">Existing EMIs (AED)</label>
            <input className="input mono" type="number" value={emis} onChange={(e) => setEmis(e.target.value)} />
            <p className="text-[10.5px] text-[var(--ink-faint)] mt-1 mb-0">Car loan, cards, personal loans…</p>
          </div>
          <div>
            <label className="label">Age</label>
            <input className="input mono" type="number" value={age} onChange={(e) => setAge(e.target.value)} />
          </div>
          <div>
            <label className="label">Employment</label>
            <Seg value={emp} onChange={(v) => setEmp(v)} options={[{ value: "Salaried", label: "Salaried" }, { value: "Self-Employed", label: "Self-Emp." }]} />
          </div>
          <div>
            <label className="label">Property value (AED)</label>
            <input className="input mono" type="number" value={propValue} onChange={(e) => setPropValue(e.target.value)} />
          </div>
          <div>
            <label className="label">Bank</label>
            <select className="select" value={bank} onChange={(e) => setBank(e.target.value)}>
              {db.banks.filter((b) => b.active).map((b) => (
                <option key={b.id} value={b.name}>{b.name} · desk {fmtRate(defaultRateFor(b.name))}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Interest rate</label>
            <div className="flex gap-2">
              <button className={`btn btn-sm ${rateMode === "desk" ? "btn-primary" : "btn-ghost"}`} onClick={() => setRateMode("desk")}>Desk {fmtRate(deskRate)}</button>
              <button className={`btn btn-sm ${rateMode === "custom" ? "btn-primary" : "btn-ghost"}`} onClick={() => { setRateMode("custom"); setRate(String(deskRate)); }}>Custom</button>
              {rateMode === "custom" && <input className="input mono !w-[80px]" type="number" step="0.05" value={rate} onChange={(e) => setRate(e.target.value)} />}
            </div>
          </div>
          <div>
            <label className="label">Tenure</label>
            <div className="flex gap-2">
              <button className={`btn btn-sm ${tenureMode === "auto" ? "btn-primary" : "btn-ghost"}`} onClick={() => setTenureMode("auto")}>Max by age</button>
              <button className={`btn btn-sm ${tenureMode === "custom" ? "btn-primary" : "btn-ghost"}`} onClick={() => setTenureMode("custom")}>Custom</button>
              {tenureMode === "custom" && <input className="input mono !w-[70px]" type="number" value={tenure} onChange={(e) => setTenure(e.target.value)} />}
            </div>
          </div>
        </div>

        {err && <p className="text-[12.5px] mt-3 mb-0" style={{ color: "var(--coral)" }}>{err}</p>}

        <button className="btn btn-primary mt-5" onClick={run}>
          <ICalc size={15} /> Run check & save
        </button>
        <span className="text-[11px] text-[var(--ink-faint)] ml-3">Runs as {session?.name} · stored forever</span>
      </div>

      {/* verdict + history */}
      <div className="space-y-4">
        {result ? (
          <div className="card p-5 anim-scale-in" style={{ borderColor: result.r.eligible ? "rgba(67,214,155,0.4)" : "rgba(242,115,99,0.4)" }}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] uppercase tracking-[0.14em] font-disp font-semibold text-[var(--ink-faint)]">Verdict · {bank} @ {fmtRate(result.r.rateUsed)} · {result.r.tenureUsed}y</span>
              {result.r.eligible ? <Chip tone="mint">Eligible</Chip> : <Chip tone="coral">Declined</Chip>}
            </div>
            <div className="font-disp font-bold text-[34px] leading-none mb-1" style={{ color: result.r.eligible ? "var(--mint)" : "var(--coral)" }}>
              {result.r.finalEligibleLoan > 0 ? fmtMoney(result.r.finalEligibleLoan) : "No loan"}
            </div>
            <div className="text-[12.5px] text-[var(--ink-dim)] mb-4">
              est. EMI <span className="mono">{fmtMoney(result.r.estimatedEmi)}/mo</span>
            </div>

            <div style={{ borderTop: "1px dashed var(--line)" }}>
              <Row label={`LTV cap (${emp.toLowerCase()})`} value={`${result.r.applicableLtv}%`} />
              <Row label="Max loan by property" value={fmtMoney(result.r.maxLoanByLtv)} />
              <Row label={`DBR cap`} value={`${result.r.maxDbrPct}% of income`} />
              <Row label="EMI room after existing debts" value={`${fmtMoney(result.r.availableDbrEmi)}/mo`} />
              <Row label="Max loan by DBR" value={fmtMoney(result.r.maxLoanByDbr)} />
              <Row label="Max tenure by age" value={`${result.r.maxTenureByAge}y`} />
              <Row label="We lend" value={fmtMoney(result.r.finalEligibleLoan)} strong tone="var(--amber)" />
            </div>

            {result.r.notes.length > 0 && (
              <ul className="m-0 mt-2 pl-4 space-y-1">
                {result.r.notes.map((n) => (
                  <li key={n} className="text-[11.5px] text-[var(--ink-faint)]">{n}</li>
                ))}
              </ul>
            )}

            <div className="flex flex-wrap gap-2 mt-4">
              {result.r.eligible ? (
                <button className="btn btn-mint" onClick={saveAsCase}>
                  <ITarget size={14} /> Open case at this amount
                </button>
              ) : (
                <span className="text-[12px] text-[var(--ink-faint)] py-2">Below the AED 250K floor — not bookable.</span>
              )}
            </div>
          </div>
        ) : (
          <div className="card p-6 text-center anim-fade-up">
            <ICalc size={26} className="text-[var(--ink-faint)] mx-auto mb-2" />
            <p className="text-[13px] text-[var(--ink-dim)] m-0">Fill the form and run a check — the verdict lands here with the full working.</p>
          </div>
        )}

        <div className="card anim-fade-up">
          <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: "var(--line-soft)" }}>
            <h3 className="font-disp font-semibold text-[13.5px] m-0">Saved checks</h3>
            <span className="mono text-[11px] text-[var(--ink-faint)]">{checks.length} on record</span>
          </div>
          {checks.length === 0 ? (
            <div className="p-4">
              <EmptyState icon={<ICalc size={22} />} title="No checks yet" body="Every run is auditable — the first one will appear here." />
            </div>
          ) : (
            <div className="divide-y max-h-[380px] overflow-y-auto" style={{ borderColor: "var(--line-soft)" }}>
              {checks.map((k) => (
                <div key={k.id} className="px-4 py-3" style={{ borderColor: "var(--line-soft)" }}>
                  <div className="flex items-center gap-2.5">
                    {k.eligible ? <Chip tone="mint">Eligible</Chip> : <Chip tone="coral">Declined</Chip>}
                    <span className="text-[13px] font-medium">{k.customerName}</span>
                    <span className="mono text-[12.5px] ml-auto">{k.finalEligibleLoan > 0 ? fmtMoney(k.finalEligibleLoan) : "—"}</span>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5 text-[11px] text-[var(--ink-faint)]">
                    <span>{k.bank} @ {fmtRate(k.interestRate)}</span>
                    <span>income {fmtMoney(k.monthlyIncome + k.otherIncome)}</span>
                    <span>EMIs {fmtMoney(k.existingEmis)}</span>
                    <span>{k.age}y {k.employmentType.toLowerCase()}</span>
                    <span className="inline-flex items-center gap-1">by {userById(k.createdBy)?.name ?? "—"} · {relTime(k.createdAt)}</span>
                  </div>
                  <div className="flex gap-2 mt-2">
                    {k.caseId ? (
                      <button className="btn btn-ghost btn-sm" onClick={() => nav({ name: "case", id: k.caseId! })}>
                        <IArrowR size={13} /> View case
                      </button>
                    ) : (
                      <>
                        {k.eligible && (
                          <button className="btn btn-ghost btn-sm" onClick={() => {
                            const c = createCaseFromCheck(k.id);
                            if (c) { toast("success", `${c.caseNumber} opened for ${c.customer}.`); nav({ name: "case", id: c.id }); }
                          }}>
                            <ITarget size={13} /> Open case
                          </button>
                        )}
                        <button className="btn btn-ghost btn-sm" onClick={() => setAttach(k)}>
                          <IArrowR size={13} /> Link to case
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {attach && <AttachModal check={attach} onClose={() => setAttach(null)} />}
    </div>
  );
}
