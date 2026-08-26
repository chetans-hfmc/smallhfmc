import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useStore } from "../lib/store";
import type { AffordabilityCheck } from "../lib/types";
import {
  CO_SOURCES, FREQUENCIES, LIAB_METHODS, LIAB_TYPES, LTV_CHOICES, SALARIED_SOURCES, SE_SOURCES,
  cloneInput, computeMortgage, defaultInput, defaultLtvPct, emiFor, fmtAED, fmtPct, incomeMonthly, liabilityEmi,
  newIncomeRow, newLiabRow, scenarioCardNewLimit, scenarioCardsPct, scenarioIncomePct,
  scenarioIncomeRemove, scenarioRate, scenarioRemoveCards, scenarioRemoveLiab, scenarioTenor, tenorLabel,
} from "../lib/mortgage";
import type { Frequency, IncomeRow, LiabRow, MortgageInput, MortgageResult } from "../lib/mortgage";
import { generateMortgagePdf } from "../lib/pdf";
import type { PdfScenarioTable } from "../lib/pdf";
import { relTime } from "../lib/format";
import { Avatar, Chip } from "../components/ui";
import { ConfirmModal } from "../components/bits";
import { useCountUp } from "../components/charts";
import { IArrowR, ICalc, IDownload, IEye, IPlus, ITrash, IX } from "../components/icons";

/* ---------- small building blocks ---------- */

function Section({ num, title, hint, children }: { num: string; title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="card p-4 sm:p-5 anim-fade-up">
      <div className="flex items-baseline gap-3 mb-3.5">
        <span className="mono text-[11px] font-semibold px-1.5 py-0.5 rounded" style={{ background: "rgba(242,176,76,0.12)", color: "var(--amber)" }}>{num}</span>
        <h2 className="font-disp font-semibold text-[15px] m-0">{title}</h2>
        {hint && <span className="text-[11.5px] text-[var(--ink-faint)] ml-auto hidden sm:inline">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

function ToggleChips({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: "var(--line)" }}>
      {options.map((o) => (
        <button
          key={o}
          type="button"
          className="flex-1 px-2 py-1.5 text-[12px] font-disp font-semibold transition-all"
          style={value === o ? { background: "rgba(242,176,76,0.16)", color: "var(--amber)" } : { color: "var(--ink-faint)", background: "transparent" }}
          onClick={() => onChange(o)}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

const NumIn = ({ value, onChange, min = 0, step = 1000, placeholder }: { value: number; onChange: (n: number) => void; min?: number; step?: number; placeholder?: string }) => (
  <input className="input mono" type="number" min={min} step={step} value={Number.isFinite(value) ? value : ""} placeholder={placeholder}
    onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))} />
);

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <div className="text-[10.5px] uppercase tracking-[0.1em] text-[var(--ink-faint)] font-disp font-semibold">{label}</div>
      <div className="mono text-[13.5px] font-medium" style={tone ? { color: tone } : undefined}>{value}</div>
    </div>
  );
}

/* ---------- main view ---------- */

type WhifTab = "liab" | "rate" | "tenor" | "income";

export default function Calculator() {
  const { db, session, nav, toast, userById, saveMortgageCheck, createCaseFromCheck, linkCheckToCase } = useStore();
  const [input, setInput] = useState<MortgageInput>(defaultInput);
  const [savedId, setSavedId] = useState<number | null>(null);
  const [confirmCase, setConfirmCase] = useState(false);
  const [preview, setPreview] = useState<{ input: MortgageInput; res: MortgageResult; tables: PdfScenarioTable[]; by: string; obs: string } | null>(null);
  const [whif, setWhif] = useState<WhifTab>("liab");
  const [cardId, setCardId] = useState("");
  const [cardLimit, setCardLimit] = useState("");
  const [manualRate, setManualRate] = useState("");
  const [manualTenor, setManualTenor] = useState("");
  const [extraIncome, setExtraIncome] = useState("");

  const up = (patch: Partial<MortgageInput>) => setInput((p) => ({ ...p, ...patch }));
  const r = useMemo(() => computeMortgage(input), [input]);
  const mpbfDisplay = useCountUp(r.finalMpbf, 550);

  const setEmployment = (emp: string) => {
    const employment = emp === "Self-Employed" ? ("Self-Employed" as const) : ("Salaried" as const);
    const pool = employment === "Self-Employed" ? SE_SOURCES : SALARIED_SOURCES;
    setInput((p) => ({
      ...p,
      employment,
      incomes: p.incomes.map((row) => (pool.includes(row.source) ? row : { ...row, source: pool[0], eligiblePct: employment === "Self-Employed" && pool[0] === "Business Income" ? 70 : 100 })),
    }));
  };

  const patchIncome = (id: string, patch: Partial<IncomeRow>) =>
    setInput((p) => ({ ...p, incomes: p.incomes.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
  const patchLiab = (id: string, patch: Partial<LiabRow>) =>
    setInput((p) => ({ ...p, liabilities: p.liabilities.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));

  /* ---- co-borrower (DBR only, never written to a case) ---- */
  const patchCoIncome = (id: string, patch: Partial<IncomeRow>) =>
    setInput((p) => ({
      ...p,
      coBorrower: p.coBorrower
        ? { ...p.coBorrower, incomes: p.coBorrower.incomes.map((x) => (x.id === id ? { ...x, ...patch } : x)) }
        : p.coBorrower,
    }));

  const defaultLtv = defaultLtvPct(input.applicantType);
  const isCustomLtv = input.ltvPctChoice != null && !LTV_CHOICES.includes(input.ltvPctChoice);

  /* ---------------- scenarios ---------------- */

  const cards = input.liabilities.filter((l) => l.type === "Credit Card");

  const liabScenarios = useMemo(() => {
    const rows: { label: string; input: MortgageInput }[] = [];
    if (cards.length) {
      rows.push({ label: "Credit cards −25%", input: scenarioCardsPct(input, 0.75) });
      rows.push({ label: "Credit cards −50%", input: scenarioCardsPct(input, 0.5) });
      rows.push({ label: "Credit cards removed", input: scenarioRemoveCards(input) });
      const lim = Number(cardLimit);
      if (lim > 0) rows.push({ label: `Card limit → ${fmtAED(lim)}`, input: scenarioCardNewLimit(input, cardId || cards[0].id, lim) });
    }
    for (const l of input.liabilities.filter((x) => x.type !== "Credit Card"))
      rows.push({ label: `Remove ${l.name || l.type}`, input: scenarioRemoveLiab(input, l.id) });
    return rows;
  }, [input, cardId, cardLimit]); // eslint-disable-line react-hooks/exhaustive-deps

  const rateScenarios = useMemo(() => {
    const base = input.actualRate + input.loadFactor;
    const rows = [1, 2, 3].map((n) => ({ label: `Stress +${n}%`, input: scenarioRate(input, base + n) }));
    const m = Number(manualRate);
    if (m > 0) rows.push({ label: `Manual ${m.toFixed(2)}%`, input: scenarioRate(input, m) });
    return rows;
  }, [input, manualRate]);

  const tenorScenarios = useMemo(() => {
    const rows = [15, 20, 25].map((y) => ({ label: `${y} years`, input: scenarioTenor(input, y * 12) }));
    const m = Number(manualTenor);
    if (m > 0) rows.push({ label: `Manual ${m} months`, input: scenarioTenor(input, m) });
    return rows;
  }, [input, manualTenor]);

  const incomeScenarios = useMemo(() => {
    const rows: { label: string; input: MortgageInput }[] = [];
    for (const row of input.incomes) {
      rows.push({ label: `Remove ${row.source}`, input: scenarioIncomeRemove(input, row.id) });
      rows.push({ label: `${row.source} −25%`, input: scenarioIncomePct(input, row.id, 0.75) });
    }
    const extra = Number(extraIncome);
    if (extra > 0) {
      const c = cloneInput(input);
      c.incomes = [...c.incomes, { ...newIncomeRow("Other Income"), amount: extra }];
      rows.push({ label: `Add allowance ${fmtAED(extra)}/mo`, input: c });
    }
    return rows;
  }, [input, extraIncome]);

  const runScenarios = (list: { label: string; input: MortgageInput }[]) =>
    list.map((s) => {
      const sr = computeMortgage(s.input);
      return { label: s.label, dbr: sr.currentDbr, residual: sr.residualDbr, mpbf: sr.finalMpbf, extra: sr.eligibleIncome, rate: sr.assessmentRate, tenor: sr.maxTenorMonths };
    });

  const delta = (v: number) => {
    const d = v - r.finalMpbf;
    if (Math.abs(d) < 1) return <span className="text-[var(--ink-faint)]">—</span>;
    return <span style={{ color: d > 0 ? "var(--mint)" : "var(--coral)" }}>{d > 0 ? "+" : ""}{fmtAED(d)}</span>;
  };

  /* ---------------- actions ---------------- */

  const summaryFor = () => ({
    income: r.eligibleIncome, emi: r.existingEmis, final: r.finalMpbf,
    rate: r.assessmentRate, tenorMonths: r.maxTenorMonths, ltv: r.actualLtv, eligible: r.finalMpbf > 0,
  });

  const saveCheck = (): number => {
    const id = saveMortgageCheck(
      input.name || "Unnamed applicant",
      input.whatsapp,
      JSON.stringify({ v: 1, input }),
      summaryFor()
    );
    setSavedId(id);
    return id;
  };

  const onSave = () => {
    saveCheck();
    toast("success", "Check saved to the audit trail — no case was created.");
  };

  const doCreateCase = () => {
    const payload = JSON.stringify({ v: 1, input });
    const id = saveMortgageCheck(input.name || "Unnamed applicant", input.whatsapp, payload, summaryFor());
    const check: AffordabilityCheck = {
      id, caseId: null, customerName: input.name || "Unnamed applicant",
      monthlyIncome: r.eligibleIncome, otherIncome: 0, existingEmis: r.existingEmis,
      age: r.ageNowYears, employmentType: input.employment, propertyValue: r.calcBasis,
      bank: "", interestRate: r.assessmentRate, tenureYears: Math.round(r.maxTenorMonths / 12),
      applicableLtv: r.actualLtv, maxLoanByLtv: r.ltvMpbf, maxDbrPct: 50,
      availableDbrEmi: r.availableEmi, maxLoanByDbr: r.dbrMpbf,
      maxTenureByAge: Math.round(r.maxTenorMonths / 12), finalEligibleLoan: r.finalMpbf,
      estimatedEmi: r.newEmi, eligible: r.finalMpbf > 0,
      createdBy: session?.id ?? 0, createdAt: new Date().toISOString(), payload,
    };
    const c = createCaseFromCheck(id, false, check);
    setSavedId(id);
    if (c) {
      toast("success", `${c.caseNumber} opened for ${c.customer} at ${fmtAED(c.loanAmount)}.`);
      nav({ name: "case", id: c.id });
    }
  };

  const onOpenCase = () => setConfirmCase(true);

  /* scenario builders that work for any saved input (audit-trail reports) */
  const liabScenariosOf = (src: MortgageInput) => {
    const rows: { label: string; input: MortgageInput }[] = [];
    const cards = src.liabilities.filter((x) => x.type === "Credit Card");
    if (cards.length) {
      rows.push({ label: "Credit cards −25%", input: scenarioCardsPct(src, 0.75) });
      rows.push({ label: "Credit cards −50%", input: scenarioCardsPct(src, 0.5) });
      rows.push({ label: "Credit cards removed", input: scenarioRemoveCards(src) });
    }
    for (const l of src.liabilities.filter((x) => x.type !== "Credit Card"))
      rows.push({ label: `Remove ${l.name || l.type}`, input: scenarioRemoveLiab(src, l.id) });
    return rows;
  };
  const incomeScenariosOf = (src: MortgageInput) =>
    src.incomes.map((row) => ({ label: `Remove ${row.source}`, input: scenarioIncomeRemove(src, row.id) }));

  const buildScenarioTablesFor = (src: MortgageInput, base: MortgageResult): PdfScenarioTable[] => {
    const run = (list: { label: string; input: MortgageInput }[]) =>
      list.map((s) => {
        const sr = computeMortgage(s.input);
        return { label: s.label, dbr: sr.currentDbr, residual: sr.residualDbr, mpbf: sr.finalMpbf, extra: sr.eligibleIncome, rate: sr.assessmentRate, tenor: sr.maxTenorMonths };
      });
    const liabRows = run(liabScenariosOf(src));
    const rateRows = run([1, 2, 3].map((n) => ({ label: `Stress +${n}%`, input: scenarioRate(src, src.actualRate + src.loadFactor + n) })));
    const tenorRows = run([15, 20, 25].map((yy) => ({ label: `${yy} years`, input: scenarioTenor(src, yy * 12) })));
    const incomeRows = run(incomeScenariosOf(src));
    const dlt = (v: number) => (v >= 0 ? "+" : "−") + fmtAED(Math.abs(v));
    const mk = (title: string, head: string[], rows: { label: string }[], cells: (row: (typeof liabRows)[number], i: number) => (string | number)[]) => ({
      title, head,
      body: rows.map((row, i) => [row.label, ...cells(row as (typeof liabRows)[number], i)]),
    });
    return [
      mk("Liability scenarios", ["Scenario", "Current DBR", "Residual DBR", "MPBF", "Change"], [{ label: "Current (baseline)" }, ...liabRows], (row, i) =>
        i === 0
          ? [fmtPct(base.currentDbr), fmtPct(base.residualDbr), fmtAED(base.finalMpbf), "—"]
          : [fmtPct(row.dbr), fmtPct(row.residual), fmtAED(row.mpbf), dlt(row.mpbf - base.finalMpbf)]),
      mk("Rate scenarios", ["Scenario", "Assessment rate", "MPBF", "Change"], [{ label: `Current (${base.assessmentRate.toFixed(2)}%)` }, ...rateRows], (row, i) =>
        i === 0 ? [fmtPct(base.assessmentRate), fmtAED(base.finalMpbf), "—"] : [fmtPct(row.rate), fmtAED(row.mpbf), dlt(row.mpbf - base.finalMpbf)]),
      mk("Tenor scenarios", ["Scenario", "Tenor", "MPBF", "Change"], [{ label: `Current max (${tenorLabel(base.maxTenorMonths)})` }, ...tenorRows], (row, i) =>
        i === 0 ? [tenorLabel(base.maxTenorMonths), fmtAED(base.finalMpbf), "—"] : [tenorLabel(row.tenor), fmtAED(row.mpbf), dlt(row.mpbf - base.finalMpbf)]),
      mk("Income scenarios", ["Scenario", "Eligible income", "MPBF", "Change"], [{ label: "Current (baseline)" }, ...incomeRows], (row, i) =>
        i === 0 ? [fmtAED(base.eligibleIncome), fmtAED(base.finalMpbf), "—"] : [fmtAED(row.extra), fmtAED(row.mpbf), dlt(row.mpbf - base.finalMpbf)]),
    ];
  };

  const buildScenarioTables = (): PdfScenarioTable[] => {
    const liabRows = runScenarios(liabScenarios);
    const rateRows = runScenarios(rateScenarios);
    const tenorRows = runScenarios(tenorScenarios);
    const incomeRows = runScenarios(incomeScenarios);
    const delta = (v: number) => (v >= 0 ? "+" : "−") + fmtAED(Math.abs(v));
    const mk = (title: string, head: string[], rows: { label: string }[], cells: (row: (typeof liabRows)[number], i: number) => (string | number)[]) => ({
      title, head,
      body: rows.map((row, i) => [row.label, ...cells(row as (typeof liabRows)[number], i)]),
    });
    return [
      mk("Liability scenarios", ["Scenario", "Current DBR", "Residual DBR", "MPBF", "Change"], [{ label: "Current (baseline)" }, ...liabRows], (row, i) =>
        i === 0
          ? [fmtPct(r.currentDbr), fmtPct(r.residualDbr), fmtAED(r.finalMpbf), "—"]
          : [fmtPct(row.dbr), fmtPct(row.residual), fmtAED(row.mpbf), delta(row.mpbf - r.finalMpbf)]),
      mk("Rate scenarios", ["Scenario", "Assessment rate", "MPBF", "Change"], [{ label: `Current (${r.assessmentRate.toFixed(2)}%)` }, ...rateRows], (row, i) =>
        i === 0 ? [fmtPct(r.assessmentRate), fmtAED(r.finalMpbf), "—"] : [fmtPct(row.rate), fmtAED(row.mpbf), delta(row.mpbf - r.finalMpbf)]),
      mk("Tenor scenarios", ["Scenario", "Tenor", "MPBF", "Change"], [{ label: `Current max (${tenorLabel(r.maxTenorMonths)})` }, ...tenorRows], (row, i) =>
        i === 0 ? [tenorLabel(r.maxTenorMonths), fmtAED(r.finalMpbf), "—"] : [tenorLabel(row.tenor), fmtAED(row.mpbf), delta(row.mpbf - r.finalMpbf)]),
      mk("Income scenarios", ["Scenario", "Eligible income", "MPBF", "Change"], [{ label: "Current (baseline)" }, ...incomeRows], (row, i) =>
        i === 0 ? [fmtAED(r.eligibleIncome), fmtAED(r.finalMpbf), "—"] : [fmtAED(row.extra), fmtAED(row.mpbf), delta(row.mpbf - r.finalMpbf)]),
    ];
  };

  const buildReport = () => {
    const tables = buildScenarioTables();
    const liab = runScenarios(liabScenarios);
    const income = runScenarios(incomeScenarios);
    const candidates = [
      ...liab.map((s) => ({ label: s.label, d: s.mpbf - r.finalMpbf, dbr: s.dbr })),
      ...income.map((s) => ({ label: s.label, d: s.mpbf - r.finalMpbf, dbr: s.dbr })),
    ]
      .filter((c) => c.d > 5000)
      .sort((a, b) => b.d - a.d);
    const obs =
      candidates.length === 0
        ? `No liability or income scenario meaningfully improves the baseline ${fmtAED(r.finalMpbf)} — the binding constraint is ${r.limitedBy.toLowerCase()}. Movement must come from income, liabilities or the property itself.`
        : `Strongest lever: ${candidates[0].label} — DBR moves ${fmtPct(r.currentDbr)} → ${fmtPct(candidates[0].dbr)}, unlocking ${fmtAED(candidates[0].d)} of additional MPBF (${fmtAED(r.finalMpbf)} → ${fmtAED(r.finalMpbf + candidates[0].d)}).`;
    return { tables, obs };
  };

  const onPdf = () => {
    const { tables, obs } = buildReport();
    generateMortgagePdf(input, r, tables, session?.name ?? "HFMC", obs);
    toast("success", "Bank-facing PDF downloaded.");
  };

  const onView = () => {
    const { tables, obs } = buildReport();
    setPreview({ input, res: r, tables, by: session?.name ?? "HFMC", obs });
  };

  /* ---------------- render ---------------- */

  const caps = [
    { label: "DBR / Residual DBR MPBF", v: r.dbrMpbf },
    { label: "LTV MPBF", v: r.ltvMpbf },
    ...(r.multiplierCap != null ? [{ label: `Income multiplier (${input.multiplierX}×)`, v: r.multiplierCap }] : []),
    ...(r.requested > 0 ? [{ label: "Requested finance", v: r.requested }] : []),
  ];
  const capMax = Math.max(...caps.map((c) => c.v), 1);

  const checks = [...db.affordabilityChecks].sort((a, b) => b.id - a.id);
  const sourcePool = input.employment === "Self-Employed" ? SE_SOURCES : SALARIED_SOURCES;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-disp font-bold text-[24px] tracking-tight m-0 flex items-center gap-2.5">
            <ICalc size={22} className="text-[var(--amber)]" /> Mortgage Eligibility Calculator
          </h1>
          <p className="text-[13px] text-[var(--ink-dim)] mt-0.5 mb-0">
            Preliminary MPBF assessment · CBUAE-style DBR {fmtPct(50)} cap · <em>not</em> a bank approval
          </p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => { setInput(defaultInput()); setSavedId(null); toast("info", "Calculator reset."); }}>
          Reset
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_400px] gap-4 items-start">
        {/* ================= input column ================= */}
        <div className="space-y-4">
          <Section num="01" title="Applicant" hint="age sets the usable tenor">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="label">Applicant name</label>
                <input className="input" value={input.name} onChange={(e) => up({ name: e.target.value })} placeholder="e.g. Mohammed Al Mansoori" />
              </div>
              <div>
                <label className="label">WhatsApp</label>
                <input className="input mono" value={input.whatsapp} onChange={(e) => up({ whatsapp: e.target.value })} placeholder="+971 50 …" />
              </div>
              <div>
                <label className="label">Applicant type</label>
                <ToggleChips options={["Expatriate", "UAE National"]} value={input.applicantType} onChange={(v) => up({ applicantType: v as MortgageInput["applicantType"] })} />
              </div>
              <div>
                <label className="label">Employment</label>
                <ToggleChips options={["Salaried", "Self-Employed"]} value={input.employment} onChange={setEmployment} />
              </div>
              <div>
                <label className="label">Date of birth</label>
                <input className="input mono" type="date" value={input.dob} onChange={(e) => e.target.value && up({ dob: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Final age</label>
                  <NumIn value={input.finalAge} onChange={(n) => up({ finalAge: n })} step={1} min={40} />
                </div>
                <div>
                  <label className="label">Margin (mo)</label>
                  <NumIn value={input.marginMonths} onChange={(n) => up({ marginMonths: n })} step={1} min={0} />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3.5 pt-3.5" style={{ borderTop: "1px dashed var(--line)" }}>
              <Stat label="Current age" value={`${r.ageNowYears}y`} />
              <Stat label="After margin" value={`${Math.floor(r.ageAfterMarginMonths / 12)}y ${r.ageAfterMarginMonths % 12}m`} />
              <Stat label="Remaining period" value={tenorLabel(r.remainingMonths)} />
              <Stat label="Max usable tenor" value={tenorLabel(r.maxTenorMonths)} tone="var(--amber)" />
            </div>
          </Section>

          <Section num="02" title="Property" hint="only what the calculation needs">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="label">Property value (AED)</label>
                <NumIn value={input.propertyValue} onChange={(n) => up({ propertyValue: n })} step={50000} />
              </div>
              <div>
                <label className="label">Bank valuation — optional</label>
                <input className="input mono" type="number" min={0} step={50000} value={input.valuation ?? ""} placeholder="blank if not available"
                  onChange={(e) => up({ valuation: e.target.value === "" ? null : Number(e.target.value) || 0 })} />
              </div>
              <div>
                <label className="label">Requested finance (AED)</label>
                <NumIn value={input.requested} onChange={(n) => up({ requested: n })} step={50000} />
              </div>
            </div>

            <div className="mt-3">
              <label className="label">LTV applied — default {defaultLtv}% for {input.applicantType}</label>
              <div className="flex flex-wrap items-center gap-1.5">
                <button type="button" className="chip transition-all"
                  style={input.ltvPctChoice == null ? { background: "rgba(242,176,76,0.14)", borderColor: "var(--amber)", color: "var(--amber)" } : { background: "var(--bg2)", borderColor: "var(--line)", color: "var(--ink-faint)" }}
                  onClick={() => up({ ltvPctChoice: null })}>
                  Default {defaultLtv}%
                </button>
                {LTV_CHOICES.map((v) => (
                  <button key={v} type="button" className="chip transition-all"
                    style={input.ltvPctChoice === v ? { background: "rgba(242,176,76,0.14)", borderColor: "var(--amber)", color: "var(--amber)" } : { background: "var(--bg2)", borderColor: "var(--line)", color: "var(--ink-faint)" }}
                    onClick={() => up({ ltvPctChoice: v })}>
                    {v}%
                  </button>
                ))}
                <button type="button" className="chip transition-all"
                  style={isCustomLtv ? { background: "rgba(242,176,76,0.14)", borderColor: "var(--amber)", color: "var(--amber)" } : { background: "var(--bg2)", borderColor: "var(--line)", color: "var(--ink-faint)" }}
                  onClick={() => up({ ltvPctChoice: isCustomLtv ? input.ltvPctChoice : defaultLtv })}>
                  Custom
                </button>
                {isCustomLtv && (
                  <span className="flex items-center gap-1.5 anim-fade-in">
                    <input className="input mono" style={{ width: 84, padding: "4px 8px" }} type="number" min={10} max={95} step={1}
                      value={input.ltvPctChoice ?? ""}
                      onChange={(e) => up({ ltvPctChoice: Math.min(95, Math.max(10, Number(e.target.value) || 0)) })} />
                    <span className="text-[12px] text-[var(--ink-faint)]">%</span>
                  </span>
                )}
              </div>
            </div>

            <p className="text-[12px] text-[var(--ink-dim)] mt-3 mb-0 rounded-lg px-3 py-2" style={{ background: "rgba(232,241,239,0.035)" }}>
              Calculation basis: <strong className="mono">{fmtAED(r.calcBasis)}</strong>
              <span className="text-[var(--ink-faint)]"> — {r.basisLabel}. LTV {r.ltvPct}% ({input.ltvPctChoice != null ? "selected" : "default"}) for {input.applicantType}.</span>
            </p>
          </Section>

          <Section num="03" title="Income" hint={input.employment === "Self-Employed" ? "self-employed basis" : "all sources → monthly equivalent"}>
            <div className="space-y-2">
              {input.incomes.map((row) => (
                <div key={row.id} className="grid grid-cols-[1fr_92px_110px_76px_100px_30px] gap-2 items-center anim-fade-in">
                  <select className="select" value={row.source} onChange={(e) => patchIncome(row.id, { source: e.target.value })}>
                    {sourcePool.map((s) => <option key={s}>{s}</option>)}
                  </select>
                  <select className="select" value={row.frequency} onChange={(e) => patchIncome(row.id, { frequency: e.target.value as Frequency })}>
                    {FREQUENCIES.map((f) => <option key={f}>{f}</option>)}
                  </select>
                  <NumIn value={row.amount} onChange={(n) => patchIncome(row.id, { amount: n })} step={500} />
                  <NumIn value={row.eligiblePct} onChange={(n) => patchIncome(row.id, { eligiblePct: Math.min(100, Math.max(0, n)) })} step={5} min={0} />
                  <span className="mono text-[12.5px] text-right" style={{ color: "var(--mint)" }}>{fmtAED(incomeMonthly(row))}</span>
                  <button className="text-[var(--ink-faint)] hover:text-[var(--coral)] transition-colors justify-self-center" title="Remove row"
                    onClick={() => setInput((p) => ({ ...p, incomes: p.incomes.filter((x) => x.id !== row.id) }))}>
                    <IX size={14} />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between mt-3">
              <button className="btn btn-ghost btn-sm" onClick={() => setInput((p) => ({ ...p, incomes: [...p.incomes, newIncomeRow(sourcePool[Math.min(p.incomes.length, sourcePool.length - 1)], input.employment)] }))}>
                <IPlus size={13} /> Add income
              </button>
              <div className="text-[12.5px]">
                Eligible monthly income{input.coBorrower ? " (combined)" : ""}{" "}
                <strong className="mono text-[15px]" style={{ color: "var(--mint)" }}>{fmtAED(r.eligibleIncome)}</strong>
              </div>
            </div>
            <div className="grid grid-cols-5 gap-2 mt-2 text-[10px] uppercase tracking-[0.08em] text-[var(--ink-faint)] font-disp font-semibold sm:hidden">
              <span>Source</span><span>Freq</span><span>Amount</span><span>%</span><span className="text-right">Monthly</span>
            </div>

            {/* co-borrower — calculation only, never written to a case */}
            <div
              className="mt-4 rounded-lg p-3.5 transition-colors"
              style={{
                border: input.coBorrower ? "1px solid rgba(87,194,234,0.35)" : "1px dashed var(--line)",
                background: input.coBorrower ? "rgba(87,194,234,0.045)" : "transparent",
              }}
            >
              {!input.coBorrower ? (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => up({ coBorrower: { name: "", incomes: [newIncomeRow(sourcePool[0], input.employment)], existingEmis: 0 } })}
                >
                  <IPlus size={13} /> Add co-borrower (if applicable)
                </button>
              ) : (
                <div className="anim-fade-in">
                  <div className="flex items-center justify-between mb-2.5">
                    <span className="text-[11px] uppercase tracking-[0.12em] font-disp font-semibold" style={{ color: "var(--sky)" }}>
                      Co-borrower · combined for DBR
                    </span>
                    <button
                      className="text-[var(--ink-faint)] hover:text-[var(--coral)] transition-colors"
                      title="Remove co-borrower"
                      onClick={() => up({ coBorrower: null })}
                    >
                      <ITrash size={14} />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_170px] gap-2 mb-2">
                    <div>
                      <label className="label">Co-borrower name</label>
                      <input
                        className="input"
                        placeholder="Shown on the report only"
                        value={input.coBorrower.name}
                        onChange={(e) => up({ coBorrower: { ...input.coBorrower!, name: e.target.value } })}
                      />
                    </div>
                    <div>
                      <label className="label">Their existing EMIs</label>
                      <NumIn value={input.coBorrower.existingEmis} onChange={(n) => up({ coBorrower: { ...input.coBorrower!, existingEmis: n } })} step={100} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    {input.coBorrower.incomes.map((row) => (
                      <div key={row.id} className="grid grid-cols-[1fr_92px_110px_76px_100px_30px] gap-2 items-center">
                        <select className="select" value={row.source} onChange={(e) => patchCoIncome(row.id, { source: e.target.value })}>
                          {sourcePool.map((s) => <option key={s}>{s}</option>)}
                        </select>
                        <select className="select" value={row.frequency} onChange={(e) => patchCoIncome(row.id, { frequency: e.target.value as Frequency })}>
                          {FREQUENCIES.map((f) => <option key={f}>{f}</option>)}
                        </select>
                        <NumIn value={row.amount} onChange={(n) => patchCoIncome(row.id, { amount: n })} step={500} />
                        <NumIn value={row.eligiblePct} onChange={(n) => patchCoIncome(row.id, { eligiblePct: Math.min(100, Math.max(0, n)) })} step={5} min={0} />
                        <span className="mono text-[12.5px] text-right" style={{ color: "var(--sky)" }}>{fmtAED(incomeMonthly(row))}</span>
                        <button
                          className="text-[var(--ink-faint)] hover:text-[var(--coral)] transition-colors justify-self-center"
                          title="Remove row"
                          onClick={() =>
                            setInput((p) => ({
                              ...p,
                              coBorrower: p.coBorrower
                                ? { ...p.coBorrower, incomes: p.coBorrower.incomes.filter((x) => x.id !== row.id) }
                                : p.coBorrower,
                            }))
                          }
                        >
                          <IX size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between mt-2.5">
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() =>
                        setInput((p) => ({
                          ...p,
                          coBorrower: p.coBorrower
                            ? { ...p.coBorrower, incomes: [...p.coBorrower.incomes, newIncomeRow(sourcePool[Math.min(p.coBorrower.incomes.length, sourcePool.length - 1)], input.employment)] }
                            : p.coBorrower,
                        }))
                      }
                    >
                      <IPlus size={13} /> Add co-borrower income
                    </button>
                    <div className="text-[12.5px]">
                      Co-borrower income <strong className="mono text-[14px]" style={{ color: "var(--sky)" }}>{fmtAED(r.coIncome)}</strong>
                    </div>
                  </div>
                  <p className="text-[11px] text-[var(--ink-faint)] mt-2 mb-0">
                    Counted in the eligibility calculation only — the co-borrower is never written to the case file.
                  </p>
                </div>
              )}
            </div>
          </Section>

          <Section num="04" title="Liabilities" hint="credit cards assess at 5% of limit by default">
            {input.liabilities.length === 0 && (
              <p className="text-[12.5px] text-[var(--ink-faint)] m-0">No liabilities declared — the full DBR headroom is available.</p>
            )}
            <div className="space-y-2">
              {input.liabilities.map((l) => (
                <div key={l.id} className="rounded-lg p-2.5 anim-fade-in" style={{ background: "rgba(232,241,239,0.025)", border: "1px solid var(--line-soft)" }}>
                  <div className="grid grid-cols-[1fr_130px_130px] gap-2">
                    <input className="input" value={l.name} onChange={(e) => patchLiab(l.id, { name: e.target.value })} placeholder="Liability name" />
                    <select className="select" value={l.type} onChange={(e) => patchLiab(l.id, { type: e.target.value as LiabRow["type"] })}>
                      {LIAB_TYPES.map((t) => <option key={t}>{t}</option>)}
                    </select>
                    <select className="select" value={l.method} onChange={(e) => patchLiab(l.id, { method: e.target.value as LiabRow["method"] })}>
                      {LIAB_METHODS.map((m) => <option key={m}>{m}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-[1fr_1fr_110px_30px] gap-2 mt-2 items-center">
                    <div>
                      <label className="label" style={{ marginBottom: 3 }}>{l.type === "Credit Card" || l.type === "Overdraft" ? "Limit / outstanding" : "Outstanding"}</label>
                      <NumIn value={l.limitOrOutstanding} onChange={(n) => patchLiab(l.id, { limitOrOutstanding: n })} step={1000} />
                    </div>
                    <div>
                      <label className="label" style={{ marginBottom: 3 }}>Monthly EMI {l.method.startsWith("5%") ? "(ignored)" : ""}</label>
                      <NumIn value={l.monthlyEmi} onChange={(n) => patchLiab(l.id, { monthlyEmi: n })} step={100} />
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-faint)] font-disp font-semibold">Assessed</div>
                      <div className="mono text-[13px]" style={{ color: "var(--coral)" }}>{fmtAED(liabilityEmi(l))}</div>
                    </div>
                    <button className="text-[var(--ink-faint)] hover:text-[var(--coral)] transition-colors justify-self-center" title="Remove liability"
                      onClick={() => setInput((p) => ({ ...p, liabilities: p.liabilities.filter((x) => x.id !== l.id) }))}>
                      <ITrash size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between mt-3">
              <button className="btn btn-ghost btn-sm" onClick={() => setInput((p) => ({ ...p, liabilities: [...p.liabilities, newLiabRow()] }))}>
                <IPlus size={13} /> Add liability
              </button>
              <div className="text-[12.5px]">
                Existing EMIs <strong className="mono text-[15px]" style={{ color: "var(--coral)" }}>{fmtAED(r.existingEmis)}</strong>
              </div>
            </div>
          </Section>

          <Section num="05" title="Rate & stress" hint="assessment rate drives the DBR MPBF">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="label">Actual / contract rate %</label>
                <input className="input mono" type="number" step={0.05} min={0} value={input.actualRate}
                  onChange={(e) => up({ actualRate: Number(e.target.value) || 0 })} />
              </div>
              <div>
                <label className="label">Load factor</label>
                <div className="flex gap-1.5 flex-wrap">
                  {[1.5, 2, 3, 4].map((l) => (
                    <button key={l} type="button" className="chip transition-all"
                      style={input.loadFactor === l && input.stressOverride == null
                        ? { background: "rgba(242,176,76,0.14)", borderColor: "var(--amber)", color: "var(--amber)" }
                        : { background: "var(--bg2)", borderColor: "var(--line)", color: "var(--ink-faint)" }}
                      onClick={() => up({ loadFactor: l, stressOverride: null })}>
                      +{l}%
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="label">Manual stress rate — optional</label>
                <input className="input mono" type="number" step={0.05} min={0} value={input.stressOverride ?? ""} placeholder={`auto: ${fmtPct(input.actualRate + input.loadFactor)}`}
                  onChange={(e) => up({ stressOverride: e.target.value === "" ? null : Number(e.target.value) || 0 })} />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-3.5 pt-3.5" style={{ borderTop: "1px dashed var(--line)" }}>
              <Stat label="Assessment rate" value={fmtPct(r.assessmentRate)} tone="var(--amber)" />
              <div>
                <label className="label">Income multiplier cap</label>
                <select className="select" style={{ width: 130 }} value={input.multiplierX} onChange={(e) => up({ multiplierX: Number(e.target.value) })}>
                  <option value={0}>Off</option>
                  {[5, 6, 7, 8].map((x) => <option key={x} value={x}>{x}× annual</option>)}
                </select>
              </div>
              <Stat label="Tenor used" value={tenorLabel(r.maxTenorMonths)} />
            </div>
          </Section>
        </div>

        {/* ================= result rail ================= */}
        <div className="space-y-4 xl:sticky xl:top-[86px]">
          <div className="card p-5 anim-fade-up" style={{ borderColor: "rgba(242,176,76,0.3)", background: "linear-gradient(180deg, rgba(242,176,76,0.06), rgba(18,36,44,0.9))" }}>
            <div className="text-[10.5px] uppercase tracking-[0.14em] font-disp font-semibold" style={{ color: "var(--amber)" }}>Final MPBF</div>
            <div className="font-disp font-bold text-[38px] leading-[1.05] tracking-tight mt-1 tabular-nums">{fmtAED(mpbfDisplay)}</div>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-[11.5px] text-[var(--ink-faint)]">limited by</span>
              <Chip tone={r.limitedBy === "DBR / Income" ? "coral" : r.limitedBy === "LTV" ? "sky" : "amber"}>{r.limitedBy}</Chip>
              {r.finalMpbf <= 0 && <Chip tone="coral">not eligible</Chip>}
            </div>

            {/* DBR gauge */}
            <div className="mt-4">
              <div className="flex justify-between text-[10.5px] uppercase tracking-[0.1em] font-disp font-semibold text-[var(--ink-faint)] mb-1.5">
                <span>Debt burden</span><span>cap {fmtPct(r.maxDbr)}</span>
              </div>
              <div className="relative h-3 rounded-full overflow-hidden" style={{ background: "rgba(232,241,239,0.07)" }}>
                <div className="absolute inset-y-0 left-0 rounded-l-full transition-all duration-500"
                  style={{ width: `${Math.min(r.currentDbr, 100)}%`, background: r.currentDbr > 50 ? "linear-gradient(90deg,#d95f4f,#f27363)" : "linear-gradient(90deg,#d99427,#f2b04c)" }} />
                {r.currentDbr < 50 && (
                  <div className="absolute inset-y-0 transition-all duration-500"
                    style={{ left: `${r.currentDbr}%`, width: `${50 - r.currentDbr}%`, background: "rgba(67,214,155,0.4)" }} />
                )}
                <div className="absolute inset-y-0 w-[2px]" style={{ left: "50%", background: "var(--ink)" }} />
              </div>
              <div className="grid grid-cols-3 gap-2 mt-2.5">
                <Stat label="Current DBR" value={fmtPct(r.currentDbr)} tone={r.currentDbr > 50 ? "var(--coral)" : undefined} />
                <Stat label="Maximum" value={fmtPct(r.maxDbr)} />
                <Stat label="Residual" value={fmtPct(r.residualDbr)} tone="var(--mint)" />
              </div>
            </div>

            {/* caps */}
            <div className="mt-4 space-y-2">
              {caps.map((c) => {
                const limiting = Math.abs(c.v - Math.min(...caps.map((x) => x.v))) < 1;
                return (
                  <div key={c.label}>
                    <div className="flex justify-between text-[11.5px] mb-1">
                      <span className={limiting ? "text-[var(--ink)] font-semibold" : "text-[var(--ink-dim)]"}>{c.label}{limiting && <span style={{ color: "var(--amber)" }}> ◂ binds</span>}</span>
                      <span className="mono">{fmtAED(c.v)}</span>
                    </div>
                    <div className="h-[5px] rounded-full overflow-hidden" style={{ background: "rgba(232,241,239,0.06)" }}>
                      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${(c.v / capMax) * 100}%`, background: limiting ? "var(--amber)" : "rgba(232,241,239,0.25)" }} />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 mt-4 pt-3.5" style={{ borderTop: "1px dashed var(--line)" }}>
              <Stat label="Required down payment" value={fmtAED(r.downPayment)} />
              <Stat label="Actual LTV" value={fmtPct(r.actualLtv)} />
              <Stat label="DBR after mortgage" value={fmtPct(r.dbrAfter)} tone={r.dbrAfter > 50 ? "var(--coral)" : "var(--mint)"} />
              <Stat label="EMI at actual rate" value={`${fmtAED(r.newEmi)}/mo`} />
            </div>

            <div className="flex flex-col gap-2 mt-4">
              <button className="btn btn-primary justify-center" onClick={onView}><IEye size={15} /> View bank-facing report</button>
              <button className="btn btn-ghost justify-center" onClick={onPdf}><IDownload size={15} /> Download PDF</button>
              <div className="grid grid-cols-2 gap-2">
                <button className="btn btn-mint justify-center" onClick={onSave} title="Stores the eligibility check only — never creates a case">Save check</button>
                <button className="btn btn-ghost justify-center" onClick={onOpenCase} title="Opens a pipeline case from this check (asks for confirmation)">Open case…</button>
              </div>
              <p className="text-[10.5px] text-[var(--ink-faint)] text-center m-0">
                Saving only stores the check for audit — a case is created only when you choose “Open case”.
              </p>
              {savedId && <p className="text-[11px] text-[var(--ink-faint)] text-center m-0">Saved as audit entry #{savedId}{input.name ? ` for ${input.name}` : ""}</p>}
            </div>
          </div>

          {/* trail */}
          <div className="card p-4 anim-fade-up">
            <h3 className="font-disp font-semibold text-[13.5px] m-0 mb-2.5">Calculation trail</h3>
            <ol className="space-y-1.5 m-0 p-0 list-none">
              {r.trail.map((t, i) => (
                <li key={i} className="mono text-[11px] leading-relaxed text-[var(--ink-dim)] flex gap-2">
                  <span className="text-[var(--ink-faint)] shrink-0">{String(i + 1).padStart(2, "0")}</span>{t}
                </li>
              ))}
            </ol>
            {r.notes.length > 0 && (
              <div className="mt-3 pt-3 space-y-1" style={{ borderTop: "1px dashed var(--line)" }}>
                {r.notes.map((n, i) => (
                  <p key={i} className="text-[11.5px] m-0" style={{ color: "var(--amber)" }}>⚑ {n}</p>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ================= quick tools ================= */}
      <div className="anim-fade-up">
        <div className="flex items-baseline gap-3 mb-2.5 px-1">
          <span className="mono text-[11px] font-semibold px-1.5 py-0.5 rounded" style={{ background: "rgba(87,194,234,0.12)", color: "var(--sky)" }}>T</span>
          <h2 className="font-disp font-semibold text-[15px] m-0">Quick tools</h2>
          <span className="text-[11.5px] text-[var(--ink-faint)]">inverse answers using the assessment above</span>
        </div>
        <QuickTools input={input} r={r} />
      </div>

      {/* ================= what-if ================= */}
      <div className="card anim-fade-up">
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b" style={{ borderColor: "var(--line-soft)" }}>
          <h3 className="font-disp font-semibold text-[14px] m-0">What-if analysis</h3>
          <div className="flex gap-1.5 ml-auto flex-wrap">
            {([["liab", "Liabilities"], ["rate", "Rate"], ["tenor", "Tenor"], ["income", "Income"]] as [WhifTab, string][]).map(([k, l]) => (
              <button key={k} className="chip transition-all"
                style={whif === k ? { background: "rgba(242,176,76,0.14)", borderColor: "var(--amber)", color: "var(--amber)" } : { background: "var(--bg2)", borderColor: "var(--line)", color: "var(--ink-faint)" }}
                onClick={() => setWhif(k)}>
                {l}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4">
          {whif === "liab" && (
            <div>
              <div className="flex flex-wrap gap-2 mb-3">
                {cards.length > 0 && (
                  <>
                    <select className="select" style={{ width: 190 }} value={cardId || cards[0].id} onChange={(e) => setCardId(e.target.value)}>
                      {cards.map((c) => <option key={c.id} value={c.id}>{c.name || "Credit Card"} · {fmtAED(c.limitOrOutstanding)}</option>)}
                    </select>
                    <input className="input mono" style={{ width: 170 }} type="number" min={0} step={1000} placeholder="new limit →" value={cardLimit} onChange={(e) => setCardLimit(e.target.value)} />
                  </>
                )}
              </div>
              {liabScenarios.length === 0 ? (
                <p className="text-[12.5px] text-[var(--ink-faint)] m-0">Add liabilities above to model reductions and removals.</p>
              ) : (
                <ScenarioTable rows={[{ label: "Current (baseline)", dbr: r.currentDbr, residual: r.residualDbr, mpbf: r.finalMpbf }, ...runScenarios(liabScenarios)]} base={r.finalMpbf} delta={delta} />
              )}
            </div>
          )}

          {whif === "rate" && (
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span className="text-[12px] text-[var(--ink-faint)]">Manual assessment rate:</span>
                <input className="input mono" style={{ width: 130 }} type="number" min={0} step={0.05} placeholder="e.g. 6.50" value={manualRate} onChange={(e) => setManualRate(e.target.value)} />
              </div>
              <ScenarioTable
                rows={[{ label: `Current · ${fmtPct(r.assessmentRate)}`, dbr: r.currentDbr, residual: r.residualDbr, mpbf: r.finalMpbf }, ...runScenarios(rateScenarios)]}
                base={r.finalMpbf} delta={delta} />
            </div>
          )}

          {whif === "tenor" && (
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span className="text-[12px] text-[var(--ink-faint)]">Manual tenor (months):</span>
                <input className="input mono" style={{ width: 130 }} type="number" min={12} step={12} placeholder="e.g. 178" value={manualTenor} onChange={(e) => setManualTenor(e.target.value)} />
              </div>
              <ScenarioTable
                rows={[{ label: `Current max · ${tenorLabel(r.maxTenorMonths)}`, dbr: r.currentDbr, residual: r.residualDbr, mpbf: r.finalMpbf }, ...runScenarios(tenorScenarios)]}
                base={r.finalMpbf} delta={delta} />
            </div>
          )}

          {whif === "income" && (
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span className="text-[12px] text-[var(--ink-faint)]">Hypothetical extra allowance (AED/mo):</span>
                <input className="input mono" style={{ width: 150 }} type="number" min={0} step={500} placeholder="e.g. 3000" value={extraIncome} onChange={(e) => setExtraIncome(e.target.value)} />
              </div>
              <ScenarioTable
                rows={[{ label: "Current (baseline)", dbr: r.currentDbr, residual: r.residualDbr, mpbf: r.finalMpbf }, ...runScenarios(incomeScenarios)]}
                base={r.finalMpbf} delta={delta} />
            </div>
          )}
        </div>
      </div>

      {/* ================= audit trail ================= */}
      <div className="card anim-fade-up">
        <div className="px-4 py-3 border-b flex items-center gap-2" style={{ borderColor: "var(--line-soft)" }}>
          <h3 className="font-disp font-semibold text-[13.5px] m-0">Saved checks · audit trail</h3>
          <span className="mono text-[11px] text-[var(--ink-faint)] ml-auto">{checks.length} saved</span>
        </div>
        {checks.length === 0 ? (
          <p className="text-[12.5px] text-[var(--ink-faint)] p-4 m-0">Nothing saved yet — run a check and hit “Save check”.</p>
        ) : (
          <div className="divide-y" style={{ borderColor: "var(--line-soft)" }}>
            {checks.map((k) => {
              const parsed = k.payload ? (JSON.parse(k.payload) as { input?: MortgageInput }) : null;
              return (
                <div key={k.id} className="px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2" style={{ borderColor: "var(--line-soft)" }}>
                  {k.eligible ? <Chip tone="mint">Eligible</Chip> : <Chip tone="coral">Not eligible</Chip>}
                  <span className="mono font-semibold text-[13.5px]">{fmtAED(k.finalEligibleLoan)}</span>
                  <span className="text-[12px] text-[var(--ink-dim)] min-w-0 truncate">
                    {k.customerName} · income {fmtAED(k.monthlyIncome)} · EMIs {fmtAED(k.existingEmis)} · {k.interestRate}%
                  </span>
                  <span className="text-[11px] text-[var(--ink-faint)]">
                    by {userById(k.createdBy)?.name ?? "—"} · {relTime(k.createdAt)}
                  </span>
                  <div className="ml-auto flex items-center gap-1.5 flex-wrap">
                    {parsed?.input && (
                      <>
                        <button className="btn btn-ghost btn-sm" onClick={() => { setInput(parsed.input as MortgageInput); setSavedId(k.id); window.scrollTo({ top: 0, behavior: "smooth" }); toast("info", `Loaded check #${k.id} for ${k.customerName}.`); }}>
                          Open
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => {
                          const ri = computeMortgage(parsed.input as MortgageInput);
                          generateMortgagePdf(parsed.input as MortgageInput, ri, [], session?.name ?? "HFMC");
                        }}>
                          PDF
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => {
                          const pi = parsed.input as MortgageInput;
                          const ri = computeMortgage(pi);
                          const liab = runScenarios(liabScenariosOf(pi));
                          const income = runScenarios(incomeScenariosOf(pi));
                          const best = [...liab, ...income]
                            .map((s) => ({ label: s.label, d: s.mpbf - ri.finalMpbf, dbr: s.dbr }))
                            .filter((c) => c.d > 5000)
                            .sort((a, b) => b.d - a.d)[0];
                          const obs = best
                            ? `Strongest lever: ${best.label} — DBR moves ${fmtPct(ri.currentDbr)} → ${fmtPct(best.dbr)}, unlocking ${fmtAED(best.d)} of additional MPBF.`
                            : `No scenario improves the baseline ${fmtAED(ri.finalMpbf)} — the binding constraint is ${ri.limitedBy.toLowerCase()}.`;
                          const tables = buildScenarioTablesFor(pi, ri);
                          setPreview({ input: pi, res: ri, tables, by: session?.name ?? "HFMC", obs });
                        }}>
                          <IEye size={13} /> Report
                        </button>
                      </>
                    )}
                    {k.caseId ? (
                      <button className="btn btn-ghost btn-sm" onClick={() => nav({ name: "case", id: k.caseId as number })}>
                        View case
                      </button>
                    ) : (
                      <select
                        className="select"
                        style={{ width: 170, fontSize: 12 }}
                        value=""
                        onChange={(e) => {
                          if (!e.target.value) return;
                          linkCheckToCase(k.id, parseInt(e.target.value, 10));
                          toast("success", `Check #${k.id} linked to a case.`);
                        }}
                      >
                        <option value="">Link to case…</option>
                        {db.cases.filter((c) => c.caseStatus === "Active").map((c) => (
                          <option key={c.id} value={c.id}>{c.caseNumber} · {c.customer}</option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 text-[11.5px] text-[var(--ink-faint)] px-1">
        <Avatar name={session?.name ?? "?"} size={20} />
        Prepared by {session?.name} · figures follow CBUAE-style limits (50% DBR, {input.applicantType} LTV bands, 25y max tenor) — lender policy may differ.
      </div>

      {preview && (
        <PreviewReport
          data={preview}
          onClose={() => setPreview(null)}
          onPdf={() => generateMortgagePdf(preview.input, preview.res, preview.tables, preview.by)}
        />
      )}

      <ConfirmModal
        open={confirmCase}
        onClose={() => setConfirmCase(false)}
        tone="mint"
        title="Open a case from this check?"
        body={
          <span>
            This will create a new pipeline case for <strong>{input.name.trim() || "Unnamed applicant"}</strong> with a loan
            amount of <strong>{fmtAED(r.finalMpbf)}</strong> (the final MPBF). The saved eligibility check is attached to it for
            audit. No case is created until you confirm.
          </span>
        }
        confirmLabel="Create case"
        onConfirm={doCreateCase}
      />
    </div>
  );
}

/* ================= bank-facing report preview ================= */

function Pkv({ rows }: { rows: [string, string][] }) {
  return (
    <div>
      {rows.map(([k, v]) => (
        <div key={k} className="paper-kv">
          <span className="k">{k}</span>
          <span className="dots" />
          <span className="v">{v}</span>
        </div>
      ))}
    </div>
  );
}

function PreviewReport({
  data,
  onClose,
  onPdf,
}: {
  data: { input: MortgageInput; res: MortgageResult; tables: PdfScenarioTable[]; by: string; obs: string };
  onClose: () => void;
  onPdf: () => void;
}) {
  const { input: inp, res, tables, by, obs } = data;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const date = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
  const numTh = (t: string) => (
    <th className="num">{t}</th>
  );

  return (
    <div
      className="fixed inset-0 z-[70] anim-fade-in"
      style={{ background: "rgba(4, 12, 15, 0.8)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div className="h-full overflow-y-auto py-6 px-3 sm:px-6">
        <div className="max-w-[800px] mx-auto" onClick={(e) => e.stopPropagation()}>
          {/* toolbar */}
          <div
            className="card flex flex-wrap items-center gap-2 px-4 py-2.5 mb-5 sticky top-0 z-10"
            style={{ background: "var(--raised)", boxShadow: "0 14px 40px -12px rgba(0,0,0,0.6)" }}
          >
            <IEye size={15} className="text-[var(--amber)]" />
            <span className="font-disp font-semibold text-[13.5px]">Bank-facing report preview</span>
            <span className="text-[11px] text-[var(--ink-faint)] hidden sm:inline">— exactly what the PDF contains</span>
            <div className="ml-auto flex gap-2">
              <button className="btn btn-primary btn-sm" onClick={onPdf}>
                <IDownload size={13} /> Download PDF
              </button>
              <button className="btn btn-ghost btn-sm" onClick={onClose}>
                <IX size={13} /> Close
              </button>
            </div>
          </div>

          {/* ---------- page 1 ---------- */}
          <div className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink-faint)] mb-1.5 px-1">Page 1 · Eligibility summary</div>
          <div className="paper mb-7 anim-fade-up">
            <div className="paper-band">
              <div className="font-disp font-bold text-[17px] leading-tight">HFMC — Mortgage Eligibility Assessment</div>
              <div className="text-[10.5px] opacity-75 mt-1">Preliminary assessment · not a bank approval or binding offer · {date}</div>
            </div>
            <div className="paper-body">
              <div className="paper-sec">Applicant & Property</div>
              <Pkv
                rows={[
                  ["Applicant", inp.name || "—"],
                  ["Applicant type", `${inp.applicantType} · ${inp.employment}`],
                  ...(inp.coBorrower
                    ? ([["Co-borrower", `${inp.coBorrower.name || "—"} · income ${fmtAED(res.coIncome)}/mo · EMIs ${fmtAED(inp.coBorrower.existingEmis)}/mo (combined)`]] as [string, string][])
                    : []),
                  ["Property value", fmtAED(inp.propertyValue)],
                  ["Bank valuation", inp.valuation ? fmtAED(inp.valuation) : "Not available"],
                  ["Calculation basis", `${fmtAED(res.calcBasis)} (${res.basisLabel})`],
                  ["Requested finance", inp.requested > 0 ? fmtAED(inp.requested) : "—"],
                ]}
              />
              <div className="paper-sec">Eligibility Summary</div>
              <Pkv
                rows={[
                  ["Eligible monthly income", `${fmtAED(res.eligibleIncome)}${inp.coBorrower ? " (combined)" : ""}`],
                  ...(inp.coBorrower
                    ? ([
                        ["  · Applicant", fmtAED(res.ownIncome)],
                        ["  · Co-borrower", fmtAED(res.coIncome)],
                      ] as [string, string][])
                    : []),
                  ["Existing monthly liabilities", `${fmtAED(res.existingEmis)}${inp.coBorrower ? " (combined)" : ""}`],
                  ["Current DBR", fmtPct(res.currentDbr)],
                  ["Maximum DBR (CBUAE)", fmtPct(res.maxDbr)],
                  ["Residual DBR", fmtPct(res.residualDbr)],
                ]}
              />
              <div className="paper-sec">Loan Parameters</div>
              <Pkv
                rows={[
                  ["Actual / contract rate", fmtPct(res.actualRate)],
                  ["Stress load factor", `+ ${res.loadFactor.toFixed(2)}%`],
                  ["Assessment rate", fmtPct(res.assessmentRate)],
                  ["LTV applied", `${res.ltvPct}%${inp.ltvPctChoice != null ? " (selected)" : ` (default · ${inp.applicantType})`}`],
                  ["Current age", `${res.ageNowYears} years`],
                  ["Age processing margin", `${inp.marginMonths} months`],
                  ["Maximum tenor used", tenorLabel(res.maxTenorMonths)],
                ]}
              />
              <div className="paper-sec">MPBF — Eligibility Tests</div>
              <table className="paper-tbl">
                <thead>
                  <tr>
                    <th>Eligibility test</th>
                    {numTh("Maximum finance")}
                  </tr>
                </thead>
                <tbody>
                  <tr><td>DBR / Residual DBR MPBF</td><td className="num">{fmtAED(res.dbrMpbf)}</td></tr>
                  <tr><td>LTV MPBF ({fmtAED(res.calcBasis)} × {res.ltvPct}%)</td><td className="num">{fmtAED(res.ltvMpbf)}</td></tr>
                  {res.multiplierCap != null && (
                    <tr><td>Income multiplier cap</td><td className="num">{fmtAED(res.multiplierCap)}</td></tr>
                  )}
                  {inp.requested > 0 && (
                    <tr><td>Requested finance</td><td className="num">{fmtAED(res.requested)}</td></tr>
                  )}
                </tbody>
              </table>
              <div className="paper-final">
                <span className="font-disp font-bold text-[12px] tracking-[0.1em]">FINAL MPBF</span>
                <span className="amt">{fmtAED(res.finalMpbf)}</span>
              </div>
              <Pkv
                rows={[
                  ["Limited by", res.limitedBy],
                  ["Required down payment", fmtAED(res.downPayment)],
                  ["Actual LTV", fmtPct(res.actualLtv)],
                  ["Proposed mortgage EMI (actual rate)", `${fmtAED(res.newEmi)} / month`],
                  ["DBR after proposed mortgage", fmtPct(res.dbrAfter)],
                ]}
              />
            </div>
          </div>

          {/* ---------- page 2 ---------- */}
          <div className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink-faint)] mb-1.5 px-1">Page 2 · Supporting calculation</div>
          <div className="paper mb-7 anim-fade-up">
            <div className="paper-body">
              <div className="paper-sec">Income Breakdown</div>
              <table className="paper-tbl">
                <thead>
                  <tr>
                    <th>Source</th>
                    <th>Frequency</th>
                    {numTh("Amount")}
                    {numTh("Elig %")}
                    {numTh("Monthly")}
                  </tr>
                </thead>
                <tbody>
                  {inp.incomes.length === 0 && (
                    <tr><td colSpan={5}>No income entered</td></tr>
                  )}
                  {inp.incomes.map((row) => (
                    <tr key={row.id}>
                      <td>{row.source}</td>
                      <td>{row.frequency}</td>
                      <td className="num">{fmtAED(row.amount)}</td>
                      <td className="num">{row.eligiblePct}%</td>
                      <td className="num">{fmtAED(incomeMonthly(row))}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={4}>Eligible monthly income{inp.coBorrower ? " (combined)" : ""}</td>
                    <td className="num">{fmtAED(res.eligibleIncome)}</td>
                  </tr>
                </tfoot>
              </table>

              {inp.coBorrower && (
                <>
                  <div className="paper-sec">
                    Income Breakdown — Co-borrower{inp.coBorrower.name ? ` (${inp.coBorrower.name})` : ""}
                  </div>
                  <table className="paper-tbl">
                    <thead>
                      <tr>
                        <th>Source</th>
                        <th>Frequency</th>
                        {numTh("Amount")}
                        {numTh("Elig %")}
                        {numTh("Monthly")}
                      </tr>
                    </thead>
                    <tbody>
                      {inp.coBorrower.incomes.length === 0 && (
                        <tr><td colSpan={5}>No income entered</td></tr>
                      )}
                      {inp.coBorrower.incomes.map((row) => (
                        <tr key={row.id}>
                          <td>{row.source}</td>
                          <td>{row.frequency}</td>
                          <td className="num">{fmtAED(row.amount)}</td>
                          <td className="num">{row.eligiblePct}%</td>
                          <td className="num">{fmtAED(incomeMonthly(row))}</td>
                        </tr>
                      ))}
                      <tr>
                        <td colSpan={2}>Co-borrower existing EMIs</td>
                        <td className="num" colSpan={2}></td>
                        <td className="num">{fmtAED(inp.coBorrower.existingEmis)}</td>
                      </tr>
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={4}>Co-borrower eligible income</td>
                        <td className="num">{fmtAED(res.coIncome)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </>
              )}

              <div className="paper-sec">Liability Breakdown</div>
              <table className="paper-tbl">
                <thead>
                  <tr>
                    <th>Liability</th>
                    <th>Type</th>
                    {numTh("Limit / Outstanding")}
                    <th>Method</th>
                    {numTh("Assessed EMI")}
                  </tr>
                </thead>
                <tbody>
                  {inp.liabilities.length === 0 && (
                    <tr><td colSpan={5}>No liabilities declared</td></tr>
                  )}
                  {inp.liabilities.map((row) => (
                    <tr key={row.id}>
                      <td>{row.name}</td>
                      <td>{row.type}</td>
                      <td className="num">{fmtAED(row.limitOrOutstanding)}</td>
                      <td>{row.method}</td>
                      <td className="num">{fmtAED(liabilityEmi(row))}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={4}>Existing monthly liabilities</td>
                    <td className="num">{fmtAED(res.existingEmis)}</td>
                  </tr>
                </tfoot>
              </table>

              <div className="paper-sec">Rate, Stress & Tenor</div>
              <Pkv
                rows={[
                  ["Assessment basis", `${fmtPct(res.actualRate)} actual + ${res.loadFactor.toFixed(2)}% load = ${fmtPct(res.assessmentRate)} assessment`],
                  ["Age calculation", `${res.ageNowYears}y now + ${inp.marginMonths}m margin → final age ${inp.finalAge} → ${tenorLabel(res.remainingMonths)} available`],
                  ["Tenor used", `${tenorLabel(res.maxTenorMonths)}${inp.tenorOverrideMonths ? " (manual override)" : " (age-constrained)"}`],
                  ["LTV applied", `${res.ltvPct}% — ${inp.applicantType}${res.calcBasis > 5000000 ? ", above AED 5M band" : ", up to AED 5M band"}`],
                ]}
              />

              <div className="paper-sec">Calculation Trail</div>
              <div className="paper-trail">
                {res.trail.map((t, i) => (
                  <div key={i}>{t}</div>
                ))}
              </div>
            </div>
          </div>

          {/* ---------- page 3 ---------- */}
          <div className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink-faint)] mb-1.5 px-1">Page 3 · What-if analysis</div>
          <div className="paper mb-7 anim-fade-up">
            <div className="paper-body">
              <p className="text-[11.5px] mt-0 mb-4" style={{ color: "#5b6367" }}>
                Each scenario re-runs the full calculation with one input changed. Baseline final MPBF:{" "}
                <strong style={{ color: "#172024" }}>{fmtAED(res.finalMpbf)}</strong> — positive deltas add eligibility.
              </p>

              {obs && (
                <div
                  className="mb-5"
                  style={{
                    background: "#fbf6ec",
                    border: "1px solid rgba(198,138,40,0.45)",
                    borderLeft: "4px solid #c68a28",
                    borderRadius: 4,
                    padding: "12px 16px",
                  }}
                >
                  <div
                    className="font-disp font-bold text-[10px] tracking-[0.14em] mb-1.5"
                    style={{ color: "#c68a28" }}
                  >
                    KEY OBSERVATION
                  </div>
                  <div className="text-[12px] leading-relaxed" style={{ color: "#172024" }}>
                    {obs}
                  </div>
                </div>
              )}

              {tables.length === 0 && (
                <p className="text-[11.5px] m-0" style={{ color: "#5b6367" }}>
                  No what-if scenarios were captured for this saved check. Re-run the assessment to include them.
                </p>
              )}
              {tables.map((t) => (
                <div key={t.title}>
                  <div className="paper-sec">{t.title}</div>
                  <table className="paper-tbl">
                    <thead>
                      <tr>
                        {t.head.map((h, i) => (
                          <th key={h} className={i > 0 ? "num" : ""}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {t.body.map((row, ri) => (
                        <tr key={ri}>
                          {row.map((cell, ci) => (
                            <td key={ci} className={ci > 0 ? "num" : ""}>{cell}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}

              <p className="text-[10px] italic mt-5 mb-3" style={{ color: "#7a8286" }}>
                These figures are indicative and based solely on the inputs provided, CBUAE-style DBR/LTV limits and the lender age
                policy selected. They do not constitute a bank approval, sanction or binding offer. Final eligibility, pricing and
                tenor are at the sole discretion of the lender.
              </p>
              <div className="flex items-baseline justify-between text-[11px]">
                <span className="font-semibold" style={{ color: "#172024" }}>Prepared by: {by}</span>
                <span style={{ color: "#7a8286" }}>
                  {new Date().toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            </div>
          </div>

          <div className="text-center text-[11px] text-[var(--ink-faint)] pb-6">
            This preview mirrors the PDF page-for-page · <button className="btn btn-ghost btn-sm" onClick={onPdf}><IDownload size={13} /> Download PDF</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ToolCard({ title, children, out, note }: { title: string; children: ReactNode; out: string; note: string }) {
  return (
    <div className="card card-hover p-4">
      <div className="text-[10.5px] uppercase tracking-[0.12em] font-disp font-semibold text-[var(--ink-faint)] mb-2.5">{title}</div>
      {children}
      <div className="mono text-[19px] font-semibold mt-2.5" style={{ color: "var(--mint)" }}>{out}</div>
      <div className="text-[11px] text-[var(--ink-faint)] mt-0.5">{note}</div>
    </div>
  );
}

function QuickTools({ input, r }: { input: MortgageInput; r: MortgageResult }) {
  const [finance, setFinance] = useState(1000000);
  const [propVal, setPropVal] = useState(1500000);
  const [reqFin, setReqFin] = useState(1200000);

  const reqEmi = emiFor(finance, r.assessmentRate, r.maxTenorMonths);
  const reqIncome = reqEmi / 0.5 + r.existingEmis;
  const maxProp = r.ltvPct > 0 ? r.dbrMpbf / (r.ltvPct / 100) : 0;
  const ltvCap = (propVal * r.ltvPct) / 100;
  const funded = Math.min(reqFin, ltvCap);
  const reqDp = Math.max(0, propVal - funded);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <ToolCard
        title="Required income"
        out={fmtAED(reqIncome)}
        note={`eligible monthly income needed · ${r.assessmentRate.toFixed(2)}% over ${tenorLabel(r.maxTenorMonths)} · incl. existing EMIs`}
      >
        <label className="label">Desired finance (AED)</label>
        <NumIn value={finance} onChange={setFinance} step={50000} />
      </ToolCard>
      <ToolCard
        title="Maximum property value"
        out={fmtAED(maxProp)}
        note={`income supports ${fmtAED(r.dbrMpbf)} at ${r.ltvPct}% LTV (${input.applicantType})`}
      >
        <label className="label">Based on current eligible income</label>
        <div className="text-[12px] text-[var(--ink-dim)]">DBR MPBF {fmtAED(r.dbrMpbf)} ÷ {r.ltvPct}% LTV</div>
      </ToolCard>
      <ToolCard
        title="Required down payment"
        out={fmtAED(reqDp)}
        note={reqFin > ltvCap ? `bank funds at most ${fmtAED(ltvCap)} at ${r.ltvPct}% LTV — rest is cash` : "requested finance fits inside the LTV cap"}
      >
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label">Property (AED)</label>
            <NumIn value={propVal} onChange={setPropVal} step={50000} />
          </div>
          <div>
            <label className="label">Finance (AED)</label>
            <NumIn value={reqFin} onChange={setReqFin} step={50000} />
          </div>
        </div>
      </ToolCard>
    </div>
  );
}

function ScenarioTable({ rows, base, delta }: {
  rows: { label: string; dbr: number; residual: number; mpbf: number }[];
  base: number;
  delta: (v: number) => ReactNode;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="tbl" style={{ minWidth: 560 }}>
        <thead>
          <tr>
            <th>Scenario</th>
            <th>Current DBR</th>
            <th>Residual DBR</th>
            <th>Final MPBF</th>
            <th>Change</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.label + i} style={{ cursor: "default" }} className={i === 0 ? "anim-fade-in" : ""}>
              <td className={i === 0 ? "font-semibold" : ""}>{row.label}</td>
              <td className="mono text-[12.5px]">{fmtPct(row.dbr)}</td>
              <td className="mono text-[12.5px]" style={{ color: "var(--mint)" }}>{fmtPct(row.residual)}</td>
              <td className="mono font-semibold">{fmtAED(row.mpbf)}</td>
              <td className="mono text-[12.5px]">{i === 0 ? <span className="text-[var(--ink-faint)]">baseline</span> : delta(row.mpbf)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <span className="hidden">{base}</span>
    </div>
  );
}
