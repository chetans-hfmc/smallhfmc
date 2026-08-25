import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useStore } from "../lib/store";
import {
  CBUAE_MAX_TENOR_YEARS, FREQUENCIES, LIAB_METHODS, LIAB_TYPES, SALARIED_SOURCES, SE_SOURCES,
  computeMortgage, defaultInput, emiFor, fmtAED, fmtPct, incomeMonthly, liabilityEmi, newIncomeRow,
  newLiabRow, pvFor, scenarioCardNewLimit, scenarioCardsPct, scenarioIncomePct, scenarioIncomeRemove,
  scenarioRate, scenarioRemoveCards, scenarioRemoveLiab, scenarioTenor, tenorLabel,
} from "../lib/mortgage";
import type { IncomeRow, LiabRow, MortgageInput } from "../lib/mortgage";
import { generateMortgagePdf } from "../lib/pdf";
import type { PdfScenarioTable } from "../lib/pdf";
import { Avatar, Chip, EmptyState } from "../components/ui";
import { ICalc, ICheck, IDownload, IHistory, IPlus, ITrash, IZap } from "../components/icons";
import { relTime } from "../lib/format";

function Section({ title, hint, children, right }: { title: string; hint?: string; children: ReactNode; right?: ReactNode }) {
  return (
    <div className="card p-4 anim-fade-up">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="font-disp font-semibold text-[14px] m-0">{title}</h3>
          {hint && <p className="text-[11.5px] text-[var(--ink-faint)] mt-0.5 mb-0">{hint}</p>}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

function DbrDial({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-lg px-3 py-2.5 text-center" style={{ background: "rgba(232,241,239,0.03)", border: "1px solid var(--line-soft)" }}>
      <div className="font-disp font-bold text-[20px] leading-none" style={{ color: tone }}>{fmtPct(value)}</div>
      <div className="text-[10px] uppercase tracking-[0.12em] text-[var(--ink-faint)] mt-1 font-disp">{label}</div>
    </div>
  );
}

function CapRow({ label, value, final, active, color }: { label: string; value: number; final: number; active: boolean; color: string }) {
  const max = Math.max(final, 1);
  return (
    <div>
      <div className="flex justify-between items-baseline mb-1">
        <span className="text-[12px]" style={{ color: active ? "var(--ink)" : "var(--ink-dim)" }}>
          {label} {active && <span className="mono text-[10px] px-1 rounded" style={{ background: "rgba(242,115,99,0.15)", color: "var(--coral)" }}>LIMITS</span>}
        </span>
        <span className="mono text-[12.5px] font-semibold">{fmtAED(value)}</span>
      </div>
      <div className="h-[6px] rounded-full overflow-hidden" style={{ background: "rgba(232,241,239,0.06)" }}>
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, (value / (max * 1.15)) * 100)}%`, background: active ? color : "rgba(140,166,176,0.5)", transition: "width 0.6s cubic-bezier(0.22,1,0.36,1)" }} />
      </div>
    </div>
  );
}

const LOADS = [1.5, 2, 3, 4];

export default function Calculator() {
  const store = useStore();
  const { db, session, toast, nav, saveMortgageCheck, createCaseFromCheck, linkCheckToCase } = store;
  const [inp, setInp] = useState<MortgageInput>(() => {
    const d = defaultInput();
    d.incomes = [
      { ...newIncomeRow("Basic Salary"), amount: 25000 },
      { ...newIncomeRow("Housing Allowance"), amount: 10000 },
      { ...newIncomeRow("Other Allowance"), amount: 5000 },
    ];
    d.liabilities = [
      { ...newLiabRow("Credit Card"), name: "ADCB Credit Card", limitOrOutstanding: 40000, method: "5% of Limit" },
      { id: Math.random().toString(36).slice(2, 9), name: "Car loan — Nissan Patrol", type: "Car Loan" as const, limitOrOutstanding: 95000, monthlyEmi: 2600, method: "Actual EMI" as const },
    ];
    return d;
  });
  const [tab, setTab] = useState<"liab" | "rate" | "tenor" | "income">("liab");
  const [customCardId, setCustomCardId] = useState("");
  const [customCardLimit, setCustomCardLimit] = useState("20000");
  const [manualRate, setManualRate] = useState("");
  const [linkCaseId, setLinkCaseId] = useState<Record<number, string>>({});

  const res = useMemo(() => computeMortgage(inp), [inp]);
  const set = (patch: Partial<MortgageInput>) => setInp((p) => ({ ...p, ...patch }));
  const setIncome = (id: string, patch: Partial<IncomeRow>) => setInp((p) => ({ ...p, incomes: p.incomes.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
  const setLiab = (id: string, patch: Partial<LiabRow>) => setInp((p) => ({ ...p, liabilities: p.liabilities.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));

  const sources = inp.employment === "Salaried" ? SALARIED_SOURCES : SE_SOURCES;
  const cards = inp.liabilities.filter((l) => l.type === "Credit Card");

  const save = (openCase: boolean) => {
    const name = inp.name.trim() || "Unnamed applicant";
    const payload = JSON.stringify({ engine: "hfmc-mpbf-v1", input: inp });
    const id = saveMortgageCheck(name, inp.whatsapp, payload, {
      income: res.eligibleIncome, emi: Math.round(res.newEmi), final: res.finalMpbf,
      rate: res.assessmentRate, tenorMonths: res.maxTenorMonths, ltv: res.ltvPct, eligible: res.finalMpbf > 0,
    });
    if (openCase) {
      const c = createCaseFromCheck(id, false);
      if (c) {
        toast("success", `${c.caseNumber} opened for ${name} — estimated finance ${fmtAED(res.finalMpbf)}.`);
        nav({ name: "case", id: c.id });
        return;
      }
    }
    toast("success", "Assessment saved to the audit trail.");
  };

  const buildPdf = () => {
    const base = res;
    const liabScen: PdfScenarioTable = {
      title: "Liability Scenarios",
      head: ["Scenario", "Current DBR", "Residual DBR", "MPBF", "Change"],
      body: [
        ["Current", fmtPct(base.currentDbr), fmtPct(base.residualDbr), fmtAED(base.finalMpbf), "—"],
        ...[
          { label: "Credit cards −25%", i: scenarioCardsPct(inp, 0.75) },
          { label: "Credit cards −50%", i: scenarioCardsPct(inp, 0.5) },
          { label: "Credit cards removed", i: scenarioRemoveCards(inp) },
          ...inp.liabilities.filter((l) => l.type !== "Credit Card").map((l) => ({ label: `${l.name} removed`, i: scenarioRemoveLiab(inp, l.id) })),
        ].map(({ label, i }) => {
          const r = computeMortgage(i);
          return [label, fmtPct(r.currentDbr), fmtPct(r.residualDbr), fmtAED(r.finalMpbf), fmtAED(r.finalMpbf - base.finalMpbf)];
        }),
      ],
    };
    const rateScen: PdfScenarioTable = {
      title: "Rate Scenarios",
      head: ["Scenario", "Assessment rate", "MPBF", "Change"],
      body: [
        ["Current load", fmtPct(base.assessmentRate), fmtAED(base.finalMpbf), "—"],
        ...LOADS.slice(1).map((d) => {
          const r = computeMortgage(scenarioRate(inp, inp.actualRate + inp.loadFactor + d));
          return [`Load +${d}%`, fmtPct(r.assessmentRate), fmtAED(r.finalMpbf), fmtAED(r.finalMpbf - base.finalMpbf)];
        }),
      ],
    };
    const tenorScen: PdfScenarioTable = {
      title: "Tenor Scenarios",
      head: ["Scenario", "Tenor", "MPBF", "Change"],
      body: [
        ["Maximum (age-based)", tenorLabel(base.maxTenorMonths), fmtAED(base.finalMpbf), "—"],
        ...[180, 240, 300].map((m) => {
          const r = computeMortgage(scenarioTenor(inp, m));
          return [tenorLabel(m), tenorLabel(r.maxTenorMonths), fmtAED(r.finalMpbf), fmtAED(r.finalMpbf - base.finalMpbf)];
        }),
      ],
    };
    generateMortgagePdf(inp, base, [liabScen, rateScen, tenorScen], session?.name ?? "HFMC Advisor");
    toast("success", "Bank-facing PDF downloaded.");
  };

  const scenRow = (label: string, i: MortgageInput) => {
    const r = computeMortgage(i);
    return (
      <tr key={label}>
        <td>{label}</td>
        <td className="mono">{fmtPct(r.currentDbr)}</td>
        <td className="mono">{fmtPct(r.residualDbr)}</td>
        <td className="mono font-semibold">{fmtAED(r.finalMpbf)}</td>
        <td className="mono" style={{ color: r.finalMpbf >= res.finalMpbf ? "var(--mint)" : "var(--coral)" }}>
          {r.finalMpbf - res.finalMpbf >= 0 ? "+" : ""}{fmtAED(r.finalMpbf - res.finalMpbf)}
        </td>
      </tr>
    );
  };

  const checks = [...db.affordabilityChecks].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8);
  const visibleChecks = checks.filter((k) => {
    const f = store.visibleCases().map((c) => c.id);
    return !k.caseId || f.includes(k.caseId);
  });

  return (
    <div className="space-y-4 pb-16 xl:pb-0">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-disp font-bold text-[24px] tracking-tight m-0">
            Mortgage Calculator <span className="text-[13px] font-medium text-[var(--ink-faint)] align-middle">· MPBF eligibility</span>
          </h1>
          <p className="text-[13px] text-[var(--ink-dim)] mt-0.5 mb-0">
            Preliminary assessment under CBUAE-style rules — DBR 50% · LTV {res.ltvPct}% ({inp.applicantType}) · max tenor {CBUAE_MAX_TENOR_YEARS}y. Not a bank approval.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-ghost" onClick={() => save(false)}><ICheck size={15} /> Save</button>
          <button className="btn btn-mint" onClick={() => save(true)}><IPlus size={15} /> Save & open case</button>
          <button className="btn btn-primary" onClick={buildPdf}><IDownload size={15} /> Generate PDF</button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_400px] gap-4 items-start">
        {/* ---------------- inputs ---------------- */}
        <div className="space-y-4">
          <Section title="Applicant" hint="Only what the calculation needs — nothing else.">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="col-span-2">
                <label className="label">Applicant name</label>
                <input className="input" value={inp.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Mohammed Al Mansoori" />
              </div>
              <div className="col-span-2">
                <label className="label">WhatsApp</label>
                <input className="input mono" value={inp.whatsapp} onChange={(e) => set({ whatsapp: e.target.value })} placeholder="+971 50 123 4567" />
              </div>
              <div>
                <label className="label">Applicant type</label>
                <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: "var(--line)" }}>
                  {(["Expatriate", "UAE National"] as const).map((t) => (
                    <button key={t} className="flex-1 px-2 py-2 text-[11.5px] font-disp font-semibold transition-colors" style={inp.applicantType === t ? { background: "rgba(242,176,76,0.15)", color: "var(--amber)" } : { color: "var(--ink-faint)" }} onClick={() => set({ applicantType: t })}>
                      {t === "Expatriate" ? "Expat" : "National"}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="label">Employment</label>
                <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: "var(--line)" }}>
                  {(["Salaried", "Self-Employed"] as const).map((t) => (
                    <button key={t} className="flex-1 px-2 py-2 text-[11.5px] font-disp font-semibold transition-colors" style={inp.employment === t ? { background: "rgba(242,176,76,0.15)", color: "var(--amber)" } : { color: "var(--ink-faint)" }} onClick={() => {
                      setInp((p) => ({
                        ...p, employment: t,
                        incomes: p.incomes.map((r) => (t === "Self-Employed" && r.source === "Basic Salary" ? { ...r, source: "Business Income", frequency: "Annual", eligiblePct: 70 } : r)),
                      }));
                    }}>
                      {t === "Salaried" ? "Salaried" : "Self-Emp."}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="label">Date of birth</label>
                <input className="input mono" type="date" value={inp.dob} onChange={(e) => e.target.value && set({ dob: e.target.value })} />
              </div>
              <div>
                <label className="label">Final age</label>
                <input className="input mono" type="number" min={40} max={75} value={inp.finalAge} onChange={(e) => set({ finalAge: Number(e.target.value) || 60 })} />
              </div>
              <div>
                <label className="label">Processing margin (months)</label>
                <input className="input mono" type="number" min={0} max={12} value={inp.marginMonths} onChange={(e) => set({ marginMonths: Math.max(0, Number(e.target.value) || 0) })} />
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
              {[
                ["Current age", `${res.ageNowYears} yrs`],
                ["Age after margin", tenorLabel(res.ageAfterMarginMonths)],
                ["Remaining period", tenorLabel(res.remainingMonths)],
                ["Max usable tenor", tenorLabel(res.maxTenorMonths)],
              ].map(([k, v]) => (
                <div key={k} className="rounded-lg px-3 py-2" style={{ background: "rgba(87,194,234,0.05)", border: "1px solid rgba(87,194,234,0.15)" }}>
                  <div className="text-[10px] uppercase tracking-[0.1em] text-[var(--ink-faint)] font-disp">{k}</div>
                  <div className="mono text-[13.5px] font-semibold text-[var(--sky)]">{v}</div>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Property" hint="Valuation optional — the lower of the two is used when available.">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="label">Property value (AED)</label>
                <input className="input mono" type="number" min={0} step={50000} value={inp.propertyValue || ""} onChange={(e) => set({ propertyValue: Number(e.target.value) || 0 })} />
              </div>
              <div>
                <label className="label">Bank valuation — optional</label>
                <input className="input mono" type="number" min={0} step={50000} value={inp.valuation ?? ""} onChange={(e) => set({ valuation: e.target.value === "" ? null : Number(e.target.value) })} placeholder="leave blank if not available" />
              </div>
              <div>
                <label className="label">Requested finance (AED)</label>
                <input className="input mono" type="number" min={0} step={25000} value={inp.requested || ""} onChange={(e) => set({ requested: Number(e.target.value) || 0 })} />
              </div>
            </div>
            <p className="text-[11.5px] text-[var(--ink-faint)] mt-2 mb-0">
              Calculation basis: <span className="mono text-[var(--ink-dim)]">{fmtAED(res.calcBasis)}</span> — {res.basisLabel} · LTV band {res.ltvPct}%
            </p>
          </Section>

          <Section
            title="Income"
            hint={inp.employment === "Salaried" ? "Every source converts to a monthly equivalent." : "Self-employed — business income is typically assessed at 60–70%."}
            right={
              <button className="btn btn-ghost btn-sm" onClick={() => setInp((p) => ({ ...p, incomes: [...p.incomes, newIncomeRow(inp.employment === "Salaried" ? "Other Income" : "Other Regular Income", inp.employment)] }))}>
                <IPlus size={13} /> Add income
              </button>
            }
          >
            <div className="space-y-2">
              {inp.incomes.map((r) => (
                <div key={r.id} className="grid grid-cols-[1fr_104px_110px_70px_110px_28px] gap-2 items-center">
                  <select className="select" value={r.source} onChange={(e) => setIncome(r.id, { source: e.target.value })}>
                    {sources.map((s) => <option key={s}>{s}</option>)}
                  </select>
                  <select className="select" value={r.frequency} onChange={(e) => setIncome(r.id, { frequency: e.target.value as IncomeRow["frequency"] })}>
                    {FREQUENCIES.map((f) => <option key={f}>{f}</option>)}
                  </select>
                  <input className="input mono" type="number" min={0} value={r.amount || ""} onChange={(e) => setIncome(r.id, { amount: Number(e.target.value) || 0 })} placeholder="Amount" />
                  <input className="input mono" type="number" min={0} max={100} value={r.eligiblePct} onChange={(e) => setIncome(r.id, { eligiblePct: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })} title="Eligible %" />
                  <div className="mono text-[12.5px] text-right" style={{ color: "var(--mint)" }}>{fmtAED(incomeMonthly(r))}</div>
                  <button className="text-[var(--ink-faint)] hover:text-[var(--coral)] transition-colors justify-self-center" onClick={() => setInp((p) => ({ ...p, incomes: p.incomes.filter((x) => x.id !== r.id) }))} aria-label="Remove income">
                    <ITrash size={15} />
                  </button>
                </div>
              ))}
              {inp.incomes.length === 0 && <p className="text-[12px] text-[var(--ink-faint)] m-0">No income rows — add at least one source.</p>}
            </div>
            <div className="flex justify-end items-baseline gap-2 mt-2 pt-2" style={{ borderTop: "1px dashed var(--line)" }}>
              <span className="text-[11px] uppercase tracking-[0.1em] text-[var(--ink-faint)] font-disp">Eligible monthly income</span>
              <span className="mono font-bold text-[16px]" style={{ color: "var(--mint)" }}>{fmtAED(res.eligibleIncome)}</span>
            </div>
          </Section>

          <Section
            title="Liabilities"
            hint="Credit cards assessed at 5% of limit by default — the method is changeable per row."
            right={
              <button className="btn btn-ghost btn-sm" onClick={() => setInp((p) => ({ ...p, liabilities: [...p.liabilities, newLiabRow("Personal Loan")] }))}>
                <IPlus size={13} /> Add liability
              </button>
            }
          >
            <div className="space-y-2">
              {inp.liabilities.map((l) => (
                <div key={l.id} className="rounded-lg p-2.5 grid grid-cols-2 md:grid-cols-[1fr_120px_110px_130px_100px_100px_28px] gap-2 items-center" style={{ background: "rgba(232,241,239,0.025)", border: "1px solid var(--line-soft)" }}>
                  <input className="input" value={l.name} onChange={(e) => setLiab(l.id, { name: e.target.value })} placeholder="Liability name" />
                  <select className="select" value={l.type} onChange={(e) => setLiab(l.id, { type: e.target.value as LiabRow["type"], method: e.target.value === "Credit Card" ? "5% of Limit" : l.method })}>
                    {LIAB_TYPES.map((t) => <option key={t}>{t}</option>)}
                  </select>
                  <input className="input mono" type="number" min={0} value={l.limitOrOutstanding || ""} onChange={(e) => setLiab(l.id, { limitOrOutstanding: Number(e.target.value) || 0 })} placeholder="Limit / O/S" />
                  <select className="select" value={l.method} onChange={(e) => setLiab(l.id, { method: e.target.value as LiabRow["method"] })}>
                    {LIAB_METHODS.map((m) => <option key={m}>{m}</option>)}
                  </select>
                  {(l.method === "Actual EMI" || l.method === "Manual") ? (
                    <input className="input mono" type="number" min={0} value={l.monthlyEmi || ""} onChange={(e) => setLiab(l.id, { monthlyEmi: Number(e.target.value) || 0 })} placeholder="EMI" />
                  ) : (
                    <span className="text-[11px] text-[var(--ink-faint)]">auto from limit</span>
                  )}
                  <div className="mono text-[12.5px] text-right" style={{ color: "var(--coral)" }}>{fmtAED(liabilityEmi(l))}</div>
                  <button className="text-[var(--ink-faint)] hover:text-[var(--coral)] transition-colors justify-self-center" onClick={() => setInp((p) => ({ ...p, liabilities: p.liabilities.filter((x) => x.id !== l.id) }))} aria-label="Remove liability">
                    <ITrash size={15} />
                  </button>
                </div>
              ))}
              {inp.liabilities.length === 0 && <p className="text-[12px] text-[var(--ink-faint)] m-0">No liabilities — a clean DBR. Add existing EMIs and credit cards.</p>}
            </div>
            <div className="flex justify-end items-baseline gap-2 mt-2 pt-2" style={{ borderTop: "1px dashed var(--line)" }}>
              <span className="text-[11px] uppercase tracking-[0.1em] text-[var(--ink-faint)] font-disp">Existing monthly liabilities</span>
              <span className="mono font-bold text-[16px]" style={{ color: "var(--coral)" }}>{fmtAED(res.existingEmis)}</span>
            </div>
          </Section>

          <Section title="Rate, Stress & Tenor" hint="Assessment rate = actual rate + load. Override anything manually.">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="label">Actual / contract rate %</label>
                <input className="input mono" type="number" step={0.01} min={0} value={inp.actualRate} onChange={(e) => set({ actualRate: Number(e.target.value) || 0 })} />
              </div>
              <div>
                <label className="label">Load factor %</label>
                <div className="flex gap-1">
                  {LOADS.map((l) => (
                    <button key={l} className="chip flex-1 justify-center py-1.5 transition-all" style={inp.loadFactor === l && inp.stressOverride == null ? { background: "rgba(242,176,76,0.14)", borderColor: "var(--amber)", color: "var(--amber)" } : {}} onClick={() => set({ loadFactor: l, stressOverride: null })}>
                      {l}%
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="label">Manual stress rate % — optional</label>
                <input className="input mono" type="number" step={0.01} min={0} value={inp.stressOverride ?? ""} placeholder={`${(inp.actualRate + inp.loadFactor).toFixed(2)} auto`} onChange={(e) => set({ stressOverride: e.target.value === "" ? null : Number(e.target.value) })} />
              </div>
              <div>
                <label className="label">Tenor override</label>
                <select className="select" value={inp.tenorOverrideMonths ?? ""} onChange={(e) => set({ tenorOverrideMonths: e.target.value === "" ? null : Number(e.target.value) })}>
                  <option value="">Auto — {tenorLabel(res.maxTenorMonths)}</option>
                  {[180, 240, 300].map((m) => <option key={m} value={m}>{m / 12} years</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div className="rounded-lg px-3 py-2" style={{ background: "rgba(242,176,76,0.06)", border: "1px solid rgba(242,176,76,0.2)" }}>
                <span className="text-[10px] uppercase tracking-[0.1em] text-[var(--ink-faint)] font-disp block">Assessment rate</span>
                <span className="mono font-bold text-[15px]" style={{ color: "var(--amber)" }}>{fmtPct(res.assessmentRate)}</span>
              </div>
              <div className="rounded-lg px-3 py-2" style={{ background: "rgba(242,176,76,0.06)", border: "1px solid rgba(242,176,76,0.2)" }}>
                <span className="text-[10px] uppercase tracking-[0.1em] text-[var(--ink-faint)] font-disp block">Income multiplier cap — × annual, 0 = off</span>
                <input className="input mono" style={{ marginTop: 2 }} type="number" step={0.5} min={0} value={inp.multiplierX || ""} placeholder="off" onChange={(e) => set({ multiplierX: Number(e.target.value) || 0 })} />
              </div>
            </div>
          </Section>
        </div>

        {/* ---------------- result rail ---------------- */}
        <div className="space-y-4 xl:sticky xl:top-4">
          <div className="card p-4 anim-fade-up" style={{ borderColor: "rgba(242,176,76,0.3)" }}>
            <div className="grid grid-cols-3 gap-2">
              <DbrDial label="Current DBR" value={res.currentDbr} tone="var(--ink)" />
              <DbrDial label="Maximum" value={res.maxDbr} tone="var(--ink-dim)" />
              <DbrDial label="Residual" value={res.residualDbr} tone={res.residualDbr > 0 ? "var(--mint)" : "var(--coral)"} />
            </div>

            <div className="space-y-3 mt-4">
              <CapRow label="DBR / Residual DBR MPBF" value={res.dbrMpbf} final={res.finalMpbf} active={res.limitedBy === "DBR / Income"} color={TONE("mint")} />
              <CapRow label="LTV MPBF" value={res.ltvMpbf} final={res.finalMpbf} active={res.limitedBy === "LTV"} color={TONE("sky")} />
              {res.multiplierCap != null && <CapRow label="Income multiplier cap" value={res.multiplierCap} final={res.finalMpbf} active={res.limitedBy === "Income Multiplier"} color={TONE("amber")} />}
              {inp.requested > 0 && <CapRow label="Requested finance" value={res.requested} final={res.finalMpbf} active={res.limitedBy === "Requested Finance"} color={TONE("slate")} />}
            </div>

            <div className="rounded-xl mt-4 px-4 py-3.5 text-center" style={{ background: "linear-gradient(180deg, rgba(242,176,76,0.14), rgba(242,176,76,0.05))", border: "1px solid rgba(242,176,76,0.4)" }}>
              <div className="text-[10.5px] uppercase tracking-[0.16em] font-disp font-semibold" style={{ color: "var(--amber)" }}>Final MPBF</div>
              <div className="font-disp font-bold text-[30px] leading-tight">{fmtAED(res.finalMpbf)}</div>
              <div className="mt-1">
                <Chip tone={res.finalMpbf > 0 ? "mint" : "coral"}>
                  {res.finalMpbf > 0 ? `Limited by · ${res.limitedBy}` : "No headroom — see trail"}
                </Chip>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-4 text-[12px]">
              {[
                ["Required down payment", fmtAED(res.downPayment)],
                ["Actual LTV", fmtPct(res.actualLtv)],
                ["DBR after mortgage", fmtPct(res.dbrAfter)],
                ["Proposed EMI (actual rate)", `${fmtAED(res.newEmi)}/mo`],
                ["Max tenor used", tenorLabel(res.maxTenorMonths)],
                ["Assessment rate", fmtPct(res.assessmentRate)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-2">
                  <span className="text-[var(--ink-faint)]">{k}</span>
                  <span className="mono text-[var(--ink)]">{v}</span>
                </div>
              ))}
            </div>

            <div className="mt-4 pt-3" style={{ borderTop: "1px dashed var(--line)" }}>
              <div className="text-[10.5px] uppercase tracking-[0.14em] font-disp font-semibold text-[var(--ink-faint)] mb-1.5">Calculation trail</div>
              <div className="space-y-1">
                {res.trail.map((t, i) => (
                  <p key={i} className="mono text-[10.5px] leading-snug text-[var(--ink-dim)] m-0">· {t}</p>
                ))}
              </div>
              {res.notes.length > 0 && (
                <div className="mt-2 space-y-1">
                  {res.notes.map((n, i) => (
                    <p key={i} className="text-[11px] m-0" style={{ color: "var(--amber)" }}>⚠ {n}</p>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* what-if */}
          <div className="card p-4 anim-fade-up">
            <div className="flex items-center gap-2 mb-3">
              <IZap size={15} className="text-[var(--amber)]" />
              <h3 className="font-disp font-semibold text-[13.5px] m-0 flex-1">What-if analysis</h3>
              <div className="flex gap-1">
                {([["liab", "Liabilities"], ["rate", "Rate"], ["tenor", "Tenor"], ["income", "Income"]] as const).map(([k, l]) => (
                  <button key={k} className="chip py-1 transition-all" style={tab === k ? { background: "rgba(87,194,234,0.12)", borderColor: "var(--sky)", color: "var(--sky)" } : {}} onClick={() => setTab(k)}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]" style={{ borderCollapse: "collapse" }}>
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-[0.1em] text-[var(--ink-faint)] font-disp">
                    <th className="pb-1.5 font-semibold">Scenario</th>
                    <th className="pb-1.5 font-semibold">DBR</th>
                    <th className="pb-1.5 font-semibold">Resid.</th>
                    <th className="pb-1.5 font-semibold">MPBF</th>
                    <th className="pb-1.5 font-semibold">Δ</th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: "var(--line-soft)" }}>
                  <tr>
                    <td className="py-1.5 font-medium">Current</td>
                    <td className="mono">{fmtPct(res.currentDbr)}</td>
                    <td className="mono">{fmtPct(res.residualDbr)}</td>
                    <td className="mono font-semibold">{fmtAED(res.finalMpbf)}</td>
                    <td className="mono text-[var(--ink-faint)]">—</td>
                  </tr>
                  {tab === "liab" && (
                    <>
                      {cards.length > 0 && scenRow("Credit cards −25%", scenarioCardsPct(inp, 0.75))}
                      {cards.length > 0 && scenRow("Credit cards −50%", scenarioCardsPct(inp, 0.5))}
                      {cards.length > 0 && scenRow("Credit cards removed", scenarioRemoveCards(inp))}
                      {cards.length > 0 && (
                        <tr>
                          <td colSpan={5} className="pt-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <select className="select" style={{ width: 168, padding: "5px 8px", fontSize: 11.5 }} value={customCardId || cards[0].id} onChange={(e) => setCustomCardId(e.target.value)}>
                                {cards.map((c) => <option key={c.id} value={c.id}>{c.name} ({fmtAED(c.limitOrOutstanding)})</option>)}
                              </select>
                              <span className="text-[11px] text-[var(--ink-faint)]">→ new limit</span>
                              <input className="input mono" style={{ width: 96, padding: "5px 8px", fontSize: 11.5 }} type="number" min={0} value={customCardLimit} onChange={(e) => setCustomCardLimit(e.target.value)} />
                            </div>
                          </td>
                        </tr>
                      )}
                      {cards.length > 0 && scenRow("Custom card limit", scenarioCardNewLimit(inp, customCardId || cards[0].id, Number(customCardLimit) || 0))}
                      {inp.liabilities.filter((l) => l.type !== "Credit Card").map((l) => scenRow(`${l.name} removed`, scenarioRemoveLiab(inp, l.id)))}
                      {inp.liabilities.length === 0 && <tr><td colSpan={5} className="py-2 text-[var(--ink-faint)]">Add liabilities to model scenarios.</td></tr>}
                    </>
                  )}
                  {tab === "rate" && (
                    <>
                      {LOADS.slice(1).map((d) => scenRow(`Load +${d}%`, scenarioRate(inp, inp.actualRate + inp.loadFactor + d)))}
                      <tr>
                        <td colSpan={5} className="pt-2">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-[var(--ink-faint)]">Manual stress rate</span>
                            <input className="input mono" style={{ width: 84, padding: "5px 8px", fontSize: 11.5 }} type="number" step={0.05} min={0} value={manualRate} onChange={(e) => setManualRate(e.target.value)} placeholder="6.50" />
                          </div>
                        </td>
                      </tr>
                      {manualRate !== "" && scenRow("Manual stress", scenarioRate(inp, Number(manualRate) || 0))}
                    </>
                  )}
                  {tab === "tenor" && (
                    <>
                      {[180, 240, 300].map((m) => scenRow(`${m / 12} years`, scenarioTenor(inp, m)))}
                    </>
                  )}
                  {tab === "income" && (
                    <>
                      {inp.incomes.map((r) => scenRow(`${r.source} −25%`, scenarioIncomePct(inp, r.id, 0.75)))}
                      {inp.incomes.map((r) => scenRow(`${r.source} removed`, scenarioIncomeRemove(inp, r.id)))}
                      {inp.incomes.length === 0 && <tr><td colSpan={5} className="py-2 text-[var(--ink-faint)]">Add income rows to model scenarios.</td></tr>}
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* tools */}
          <ToolsCard inp={inp} />

          {/* audit trail */}
          <div className="card p-4 anim-fade-up">
            <div className="flex items-center gap-2 mb-3">
              <IHistory size={15} className="text-[var(--ink-faint)]" />
              <h3 className="font-disp font-semibold text-[13.5px] m-0">Saved assessments</h3>
              <span className="mono text-[11px] text-[var(--ink-faint)] ml-auto">{visibleChecks.length} recent</span>
            </div>
            {visibleChecks.length === 0 ? (
              <EmptyState icon={<ICalc size={24} />} title="Nothing saved yet" body="Run the first assessment — every run lands here for audit." />
            ) : (
              <div className="space-y-1.5">
                {visibleChecks.map((k) => {
                  const isMpbf = k.payload?.includes("hfmc-mpbf");
                  const c = k.caseId ? db.cases.find((x) => x.id === k.caseId) : null;
                  return (
                    <div key={k.id} className="flex flex-wrap items-center gap-2 rounded-lg px-2.5 py-2" style={{ background: "rgba(232,241,239,0.025)", border: "1px solid var(--line-soft)" }}>
                      <Chip tone={k.eligible ? "mint" : "coral"}>{k.eligible ? "Eligible" : "Declined"}</Chip>
                      <span className="mono text-[12px] font-semibold">{fmtAED(k.finalEligibleLoan)}</span>
                      <span className="text-[11.5px] text-[var(--ink-dim)] truncate">{k.customerName}</span>
                      <span className="text-[10.5px] text-[var(--ink-faint)]">{isMpbf ? "MPBF" : "simple"} · {relTime(k.createdAt)}</span>
                      <span className="ml-auto flex items-center gap-1.5">
                        {isMpbf && k.payload && (
                          <button className="btn btn-ghost btn-sm" title="Reload inputs into the calculator" onClick={() => {
                            try {
                              const parsed = JSON.parse(k.payload!) as { input: MortgageInput };
                              setInp(parsed.input);
                              toast("info", `Loaded ${k.customerName}'s assessment.`);
                            } catch { toast("error", "Could not read this saved assessment."); }
                          }}>Load</button>
                        )}
                        {c ? (
                          <button className="btn btn-ghost btn-sm" onClick={() => nav({ name: "case", id: c.id })}>
                            <span className="mono">{c.caseNumber}</span>
                          </button>
                        ) : (
                          <>
                            <select className="select" style={{ width: 128, padding: "4px 22px 4px 8px", fontSize: 11 }} value={linkCaseId[k.id] ?? ""} onChange={(e) => setLinkCaseId((p) => ({ ...p, [k.id]: e.target.value }))}>
                              <option value="">Link to case…</option>
                              {store.visibleCases().filter((x) => x.caseStatus === "Active").map((x) => (
                                <option key={x.id} value={x.id}>{x.caseNumber} · {x.customer}</option>
                              ))}
                            </select>
                            {linkCaseId[k.id] && (
                              <button className="btn btn-primary btn-sm" onClick={() => {
                                linkCheckToCase(k.id, parseInt(linkCaseId[k.id], 10));
                                toast("success", "Assessment linked to case.");
                              }}>Link</button>
                            )}
                          </>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* mobile sticky result */}
      <div className="xl:hidden fixed bottom-0 left-0 right-0 z-40 px-4 pb-4">
        <div className="card px-4 py-2.5 flex items-center justify-between" style={{ background: "rgba(18,36,44,0.96)", borderColor: "rgba(242,176,76,0.4)", backdropFilter: "blur(6px)", boxShadow: "0 -8px 30px rgba(0,0,0,0.4)" }}>
          <div>
            <div className="text-[9.5px] uppercase tracking-[0.14em] font-disp font-semibold" style={{ color: "var(--amber)" }}>Final MPBF</div>
            <div className="font-disp font-bold text-[18px] leading-tight">{fmtAED(res.finalMpbf)}</div>
          </div>
          <Chip tone={res.residualDbr > 0 ? "mint" : "coral"}>{res.limitedBy}</Chip>
        </div>
      </div>
    </div>
  );
}

function TONE(t: "mint" | "sky" | "amber" | "slate"): string {
  return { mint: "#43d69b", sky: "#57c2ea", amber: "#f2b04c", slate: "#8ca6b0" }[t];
}

/* ---------------- quick tools ---------------- */

function ToolsCard({ inp }: { inp: MortgageInput }) {
  const res = useMemo(() => computeMortgage(inp), [inp]);
  const [desired, setDesired] = useState("1200000");
  const [dp, setDp] = useState("300000");
  const [toolFin, setToolFin] = useState("1000000");
  const [toolTenor, setToolTenor] = useState(300);

  const d = Number(desired) || 0;
  const emiNeeded = emiFor(d, res.assessmentRate, res.maxTenorMonths);
  const requiredIncome = res.existingEmis + emiNeeded > 0 ? (res.existingEmis + emiNeeded) / (res.maxDbr / 100) : 0;

  const dpVal = Number(dp) || 0;
  const maxByDbr = res.dbrMpbf + dpVal;
  const maxByLtv = res.dbrMpbf / (res.ltvPct / 100);
  const maxProp = Math.floor(Math.min(maxByDbr, maxByLtv) / 5000) * 5000;

  const pv = inp.propertyValue;
  const reqDp = Math.max(0, pv - d);
  const minDp = Math.max(0, pv - pv * (res.ltvPct / 100));

  return (
    <div className="card anim-fade-up">
      <details>
        <summary className="cursor-pointer px-4 py-3 font-disp font-semibold text-[13.5px] select-none flex items-center gap-2">
          <ICalc size={15} className="text-[var(--sky)]" /> Quick tools <span className="text-[10.5px] font-normal text-[var(--ink-faint)] ml-1">required income · max property · down payment · rate sensitivity</span>
        </summary>
        <div className="px-4 pb-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-lg p-3" style={{ background: "rgba(232,241,239,0.025)", border: "1px solid var(--line-soft)" }}>
              <label className="label">Required income for desired finance</label>
              <input className="input mono mb-2" type="number" value={desired} onChange={(e) => setDesired(e.target.value)} />
              <p className="text-[12px] text-[var(--ink-faint)] m-0">Needs eligible income of</p>
              <p className="mono font-bold text-[16px] m-0" style={{ color: "var(--mint)" }}>{fmtAED(requiredIncome)}<span className="text-[11px] font-normal text-[var(--ink-faint)]">/mo</span></p>
            </div>
            <div className="rounded-lg p-3" style={{ background: "rgba(232,241,239,0.025)", border: "1px solid var(--line-soft)" }}>
              <label className="label">Maximum property value</label>
              <input className="input mono mb-2" type="number" value={dp} onChange={(e) => setDp(e.target.value)} placeholder="Down payment" />
              <p className="text-[12px] text-[var(--ink-faint)] m-0">With {fmtAED(dpVal)} down payment</p>
              <p className="mono font-bold text-[16px] m-0" style={{ color: "var(--mint)" }}>{fmtAED(maxProp)}</p>
            </div>
            <div className="rounded-lg p-3" style={{ background: "rgba(232,241,239,0.025)", border: "1px solid var(--line-soft)" }}>
              <label className="label">Required down payment</label>
              <p className="text-[12px] text-[var(--ink-faint)] m-0">For {fmtAED(pv)} property, {fmtAED(d)} finance</p>
              <p className="mono font-bold text-[16px] m-0" style={{ color: "var(--amber)" }}>{fmtAED(reqDp)}</p>
              <p className="text-[10.5px] text-[var(--ink-faint)] m-0 mt-1">LTV minimum at {res.ltvPct}%: {fmtAED(minDp)}</p>
            </div>
            <div className="rounded-lg p-3" style={{ background: "rgba(232,241,239,0.025)", border: "1px solid var(--line-soft)" }}>
              <label className="label">Rate sensitivity</label>
              <div className="flex gap-2 mb-2">
                <input className="input mono" type="number" value={toolFin} onChange={(e) => setToolFin(e.target.value)} />
                <select className="select" style={{ width: 92 }} value={toolTenor} onChange={(e) => setToolTenor(Number(e.target.value))}>
                  {[180, 240, 300].map((m) => <option key={m} value={m}>{m / 12}y</option>)}
                </select>
              </div>
              <div className="space-y-1">
                {[3.5, 4, 4.5, 5, 5.5, 6].map((r) => (
                  <div key={r} className="flex justify-between text-[11.5px]">
                    <span className="mono text-[var(--ink-faint)]">{r.toFixed(2)}%</span>
                    <span className="mono">{fmtAED(emiFor(Number(toolFin) || 0, r, toolTenor))}/mo · MPBF {fmtAED(pvFor(res.availableEmi, r, toolTenor))}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </details>
    </div>
  );
}

export { Avatar };
