import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useStore } from "../lib/store";
import type { AffordabilityCheck } from "../lib/types";
import {
  CO_SOURCES, FREQUENCIES, LIAB_METHODS, LIAB_TYPES, LTV_CHOICES, SALARIED_SOURCES, SE_SOURCES,
  cloneInput, computeMortgage, defaultInput, defaultLtvPct, emiFor, fmtAED, fmtPct, incomeMonthly, liabilityEmi,
  newIncomeRow, newLiabRow, scenarioCardNewLimit, scenarioCardsPct, scenarioIncomePct,
  scenarioIncomeRemove, scenarioRate, scenarioRemoveCards, scenarioRemoveLiab, scenarioTenor, tenorLabel,
} from "../lib/mortgage";
import type { CoBorrower, Frequency, IncomeRow, LiabRow, MortgageInput, MortgageResult } from "../lib/mortgage";
import { generateMortgagePdf } from "../lib/pdf";
import type { PdfScenarioTable } from "../lib/pdf";
import { relTime } from "../lib/format";
import { Avatar, Chip } from "../components/ui";
import { ConfirmModal } from "../components/bits";
import { useCountUp } from "../components/charts";
import { IArrowR, ICalc, IChevronL, IDownload, IEye, IPlus, ITrash, IX } from "../components/icons";

/* ---------- small building blocks ---------- */

function Section({ num, title, hint, children }: { num: string; title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="card p-4 sm:p-5 anim-fade-up">
      <div className="flex items-baseline gap-3 mb-3.5">
        <span className="mono text-[11px] font-semibold px-1.5 py-0.5 rounded" style={{ background: "var(--amber-tint)", color: "var(--amber)" }}>{num}</span>
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
          style={value === o ? { background: "var(--amber-tint)", color: "var(--amber)" } : { color: "var(--ink-faint)", background: "transparent" }}
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

/* migrate saved payloads from older shapes so reloading a historic check never crashes */
function normalizeInput(raw: Partial<MortgageInput>): MortgageInput {
  const base = defaultInput();
  const co = raw.coBorrower as
    | (Partial<CoBorrower> & { existingEmis?: number })
    | null
    | undefined;
  const coBorrower: CoBorrower | null = co
    ? {
        name: co.name ?? "",
        dob: co.dob ?? "1992-01-15",
        incomes: Array.isArray(co.incomes) ? co.incomes : [newIncomeRow()],
        liabilities: Array.isArray(co.liabilities)
          ? co.liabilities
          : co.existingEmis
          ? [{ ...newLiabRow("Other Loan"), name: "Carried-over EMIs", method: "Manual", monthlyEmi: co.existingEmis }]
          : [],
      }
    : null;
  return {
    ...base,
    ...raw,
    customLtv: typeof raw.customLtv === "string" ? raw.customLtv : "",
    coBorrower,
    incomes: Array.isArray(raw.incomes) && raw.incomes.length ? raw.incomes : base.incomes,
    liabilities: Array.isArray(raw.liabilities) ? raw.liabilities : [],
  } as MortgageInput;
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
  const [clientMode, setClientMode] = useState<"trial" | "existing">("trial");
  const [existingCaseId, setExistingCaseId] = useState<number | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const scrollToResults = () => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  const up = (patch: Partial<MortgageInput>) => setInput((p) => ({ ...p, ...patch }));

  const loadExistingCase = (id: number) => {
    const c = db.cases.find((x) => x.id === id);
    if (!c) return;
    setInput((p) => ({
      ...p,
      name: c.customer,
      whatsapp: c.whatsapp || p.whatsapp,
      requested: c.loanAmount > 0 ? c.loanAmount : p.requested,
    }));
    toast("info", `Loaded ${c.customer} from ${c.caseNumber}. This stays a trial — nothing is written back to the case.`);
  };
  const r = useMemo(() => computeMortgage(input), [input]);
  const mpbfDisplay = useCountUp(r.finalMpbf, 550);

  const sourcePool = input.employment === "Self-Employed" ? SE_SOURCES : SALARIED_SOURCES;

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
  const patchCoLiab = (id: string, patch: Partial<LiabRow>) =>
    setInput((p) => ({
      ...p,
      coBorrower: p.coBorrower
        ? { ...p.coBorrower, liabilities: p.coBorrower.liabilities.map((x) => (x.id === id ? { ...x, ...patch } : x)) }
        : p.coBorrower,
    }));

  const defaultLtv = defaultLtvPct(input.applicantType);
  const isCustomLtv = input.customLtv.trim() !== "" && !Number.isNaN(parseFloat(input.customLtv));

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

  const onSave = () => {
    saveMortgageCheck(
      input.name || "Unnamed applicant",
      input.whatsapp,
      JSON.stringify({ v: 1, input }),
      summaryFor()
    );
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
    const c2 = src.liabilities.filter((x) => x.type === "Credit Card");
    if (c2.length) {
      rows.push({ label: "Credit cards −25%", input: scenarioCardsPct(src, 0.75) });
      rows.push({ label: "Credit cards −50%", input: scenarioCardsPct(src, 0.5) });
      rows.push({ label: "Credit cards removed", input: scenarioRemoveCards(src) });
    }
    for (const l of src.liabilities.filter((x) => x.type !== "Credit Card"))
      rows.push({ label: `Remove ${l.name || l.type}`, input: scenarioRemoveLiab(src, l.id) });
    return rows;
  };
  const incomeScenariosOf = (src: MortgageInput) => {
    const rows: { label: string; input: MortgageInput }[] = [];
    for (const row of src.incomes) {
      rows.push({ label: `Remove ${row.source}`, input: scenarioIncomeRemove(src, row.id) });
      rows.push({ label: `${row.source} −25%`, input: scenarioIncomePct(src, row.id, 0.75) });
    }
    return rows;
  };

  const buildScenarioTablesFor = (src: MortgageInput, sr: MortgageResult): PdfScenarioTable[] => {
    const liab = runScenarios(liabScenariosOf(src));
    const rate = [1, 2, 3].map((n) => ({ label: `Stress +${n}%`, input: scenarioRate(src, sr.assessmentRate + n) }));
    const tenor = [15, 20, 25].map((y) => ({ label: `${y} years`, input: scenarioTenor(src, y * 12) }));
    const income = runScenarios(incomeScenariosOf(src));
    const d = (v: number) => {
      const dd = v - sr.finalMpbf;
      return Math.abs(dd) < 1 ? "—" : `${dd > 0 ? "+" : "−"}${fmtAED(Math.abs(dd))}`;
    };
    return [
      {
        title: "Liability scenarios",
        head: ["Scenario", "Current DBR", "Residual DBR", "MPBF", "Change"],
        body: [{ label: "Baseline", dbr: sr.currentDbr, residual: sr.residualDbr, mpbf: sr.finalMpbf }, ...liab].map((x) => [
          x.label, fmtPct(x.dbr), fmtPct(x.residual), fmtAED(x.mpbf), x.label === "Baseline" ? "—" : d(x.mpbf),
        ]),
      },
      {
        title: "Rate scenarios",
        head: ["Scenario", "Assessment rate", "MPBF", "Change"],
        body: [{ label: `Baseline · ${fmtPct(sr.assessmentRate)}`, rate: sr.assessmentRate, mpbf: sr.finalMpbf }, ...runScenarios(rate)].map((x) => [
          x.label, fmtPct(x.rate), fmtAED(x.mpbf), x.label.startsWith("Baseline") ? "—" : d(x.mpbf),
        ]),
      },
      {
        title: "Tenor scenarios",
        head: ["Scenario", "Tenor", "MPBF", "Change"],
        body: [{ label: `Baseline · ${tenorLabel(sr.maxTenorMonths)}`, tenor: sr.maxTenorMonths, mpbf: sr.finalMpbf }, ...runScenarios(tenor)].map((x) => [
          x.label, tenorLabel(x.tenor), fmtAED(x.mpbf), x.label.startsWith("Baseline") ? "—" : d(x.mpbf),
        ]),
      },
      {
        title: "Income scenarios",
        head: ["Scenario", "Eligible income", "MPBF", "Change"],
        body: [{ label: "Baseline", extra: sr.eligibleIncome, mpbf: sr.finalMpbf }, ...income].map((x) => [
          x.label, fmtAED(x.extra), fmtAED(x.mpbf), x.label === "Baseline" ? "—" : d(x.mpbf),
        ]),
      },
    ];
  };

  const savePdf = () => {
    const tables = buildScenarioTablesFor(input, r);
    const liab = runScenarios(liabScenarios);
    const income = runScenarios(incomeScenarios);
    const best = [...liab, ...income]
      .map((s) => ({ label: s.label, d: s.mpbf - r.finalMpbf, dbr: s.dbr }))
      .filter((c) => c.d > 5000)
      .sort((a, b) => b.d - a.d)[0];
    const obs = best
      ? `Strongest lever: ${best.label} — DBR moves ${fmtPct(r.currentDbr)} → ${fmtPct(best.dbr)}, unlocking ${fmtAED(best.d)} of additional MPBF.`
      : `No scenario improves the baseline ${fmtAED(r.finalMpbf)} — the binding constraint is ${r.limitedBy.toLowerCase()}.`;
    generateMortgagePdf(input, r, tables, session?.name ?? "HFMC", obs);
    toast("success", "PDF downloaded.");
  };

  const checks = db.affordabilityChecks.filter((k) => true).sort((a, b) => b.id - a.id);

  /* ---------------- render ---------------- */

  return (
    <div className="space-y-5">
      {/* client chooser */}
      <div className="card p-4 anim-fade-up flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: "var(--line)" }}>
          {(["trial", "existing"] as const).map((m) => (
            <button
              key={m}
              className="px-3.5 py-2 text-[12.5px] font-disp font-semibold transition-all"
              style={clientMode === m ? { background: "var(--amber-tint)", color: "var(--amber)" } : { color: "var(--ink-faint)", background: "transparent" }}
              onClick={() => setClientMode(m)}
            >
              {m === "trial" ? "New client · trial" : "Existing client"}
            </button>
          ))}
        </div>
        {clientMode === "trial" ? (
          <p className="text-[12px] text-[var(--ink-faint)] m-0">Pure what-if — nothing touches the pipeline until you explicitly open a case.</p>
        ) : (
          <select
            className="select"
            style={{ width: 280 }}
            value={existingCaseId ?? ""}
            onChange={(e) => {
              const id = e.target.value ? parseInt(e.target.value, 10) : null;
              setExistingCaseId(id);
              if (id != null) loadExistingCase(id);
            }}
          >
            <option value="">Pick a case to prefill…</option>
            {db.cases.filter((c) => c.caseStatus === "Active").map((c) => (
              <option key={c.id} value={c.id}>{c.caseNumber} · {c.customer}</option>
            ))}
          </select>
        )}
        <span className="mono text-[11px] text-[var(--ink-faint)] ml-auto hidden md:inline">CBUAE-style · 50% DBR cap</span>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-5 items-start">
        {/* ================= inputs ================= */}
        <div className="space-y-5">
          <Section num="01" title="Applicant" hint="age drives the tenor">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
              <label className="label">
                LTV applied — default {defaultLtv}% for {input.applicantType}
                {isCustomLtv && <span style={{ color: "var(--amber)" }}> · using custom {parseFloat(input.customLtv)}%</span>}
              </label>
              <div className="flex flex-wrap items-center gap-1.5">
                <button type="button" className="chip transition-all"
                  style={input.ltvPctChoice == null && !isCustomLtv ? { background: "var(--amber-tint)", borderColor: "var(--amber)", color: "var(--amber)" } : { background: "var(--bg2)", borderColor: "var(--line)", color: "var(--ink-faint)" }}
                  onClick={() => up({ ltvPctChoice: null, customLtv: "" })}>
                  Default {defaultLtv}%
                </button>
                {LTV_CHOICES.map((v) => (
                  <button key={v} type="button" className="chip transition-all"
                    style={input.ltvPctChoice === v && !isCustomLtv ? { background: "var(--amber-tint)", borderColor: "var(--amber)", color: "var(--amber)" } : { background: "var(--bg2)", borderColor: "var(--line)", color: "var(--ink-faint)" }}
                    onClick={() => up({ ltvPctChoice: v, customLtv: "" })}>
                    {v}%
                  </button>
                ))}
                <span className="flex items-center gap-1.5 transition-all"
                  style={{ background: isCustomLtv ? "var(--amber-tint)" : "var(--bg2)", border: `1px solid ${isCustomLtv ? "var(--amber)" : "var(--line)"}`, borderRadius: 5, paddingLeft: 8, paddingRight: 8 }}>
                  <span className="text-[11px] uppercase tracking-[0.06em] font-disp" style={{ color: isCustomLtv ? "var(--amber)" : "var(--ink-faint)" }}>Custom</span>
                  <input className="mono" style={{ width: 52, padding: "3px 0", border: "none", background: "transparent", color: "var(--ink)", fontSize: 12, textAlign: "right", outline: "none" }}
                    type="number" min={1} max={95} step={0.5} placeholder="e.g. 72"
                    value={input.customLtv}
                    onChange={(e) => up({ customLtv: e.target.value, ltvPctChoice: null })} />
                  <span className="text-[11px]" style={{ color: isCustomLtv ? "var(--amber)" : "var(--ink-faint)" }}>%</span>
                </span>
              </div>
            </div>

            <p className="text-[12px] text-[var(--ink-dim)] mt-3 mb-0 rounded-lg px-3 py-2" style={{ background: "var(--tint)" }}>
              Calculation basis: <strong className="mono">{fmtAED(r.calcBasis)}</strong>
              <span className="text-[var(--ink-faint)]"> — {r.basisLabel}. LTV {r.ltvPct}% ({input.ltvPctChoice != null || isCustomLtv ? "selected" : "default"}) for {input.applicantType}.</span>
            </p>
          </Section>

          <Section num="03" title="Income" hint={input.employment === "Self-Employed" ? "self-employed basis" : "all sources → monthly equivalent"}>
            <div className="grid grid-cols-[1fr_76px_88px_60px_80px_24px] gap-2 mb-1 sm:hidden">
              <span className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-faint)] font-disp font-semibold">Source</span>
              <span className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-faint)] font-disp font-semibold">Freq</span>
              <span className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-faint)] font-disp font-semibold">Amount</span>
              <span className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-faint)] font-disp font-semibold">%</span>
              <span className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-faint)] font-disp font-semibold text-right">Monthly</span>
              <span />
            </div>
            <div className="overflow-x-auto scroll-slim -mx-1 px-1">
            <div className="min-w-[600px] space-y-2">
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
            </div>
            <div className="flex items-center justify-between mt-3 flex-wrap gap-2">
              <button className="btn btn-ghost btn-sm" onClick={() => setInput((p) => ({ ...p, incomes: [...p.incomes, newIncomeRow(sourcePool[Math.min(p.incomes.length, sourcePool.length - 1)], input.employment)] }))}>
                <IPlus size={13} /> Add income
              </button>
              <div className="text-[12.5px]">
                Eligible monthly income{input.coBorrower ? " (combined)" : ""}{" "}
                <strong className="mono text-[15px]" style={{ color: "var(--mint)" }}>{fmtAED(r.eligibleIncome)}</strong>
              </div>
            </div>

            {/* co-borrower — calculation only, never written to a case */}
            <div
              className="mt-4 rounded-lg p-3.5 transition-colors"
              style={{
                border: input.coBorrower ? "1px solid color-mix(in srgb, var(--sky) 35%, transparent)" : "1px dashed var(--line)",
                background: input.coBorrower ? "color-mix(in srgb, var(--sky) 6%, transparent)" : "transparent",
              }}
            >
              {!input.coBorrower ? (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => up({ coBorrower: { name: "", dob: "1992-01-15", incomes: [newIncomeRow(sourcePool[0], input.employment)], liabilities: [] } })}
                >
                  <IPlus size={13} /> Add co-borrower (if applicable)
                </button>
              ) : (
                <div className="anim-fade-in">
                  <div className="flex items-center justify-between mb-2.5">
                    <span className="text-[11px] uppercase tracking-[0.12em] font-disp font-semibold" style={{ color: "var(--sky)" }}>
                      Co-borrower · combined for DBR · age limits the tenor
                    </span>
                    <button
                      className="text-[var(--ink-faint)] hover:text-[var(--coral)] transition-colors"
                      title="Remove co-borrower"
                      onClick={() => up({ coBorrower: null })}
                    >
                      <ITrash size={14} />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_170px_110px] gap-2 mb-2">
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
                      <label className="label">Date of birth</label>
                      <input
                        className="input mono"
                        type="date"
                        value={input.coBorrower.dob}
                        onChange={(e) => e.target.value && up({ coBorrower: { ...input.coBorrower!, dob: e.target.value } })}
                      />
                    </div>
                    <div>
                      <label className="label">Age now</label>
                      <div className="mono text-[15px] font-semibold pt-1.5" style={{ color: r.tenorLimitedBy === "co-borrower" ? "var(--coral)" : "var(--ink-dim)" }}>
                        {r.coAgeYears} yrs{r.tenorLimitedBy === "co-borrower" && " ◂ caps tenor"}
                      </div>
                    </div>
                  </div>
                  <div className="overflow-x-auto scroll-slim -mx-1 px-1">
                  <div className="min-w-[600px] space-y-2">
                    {input.coBorrower.incomes.map((row) => (
                      <div key={row.id} className="grid grid-cols-[1fr_92px_110px_76px_100px_30px] gap-2 items-center">
                        <select className="select" value={row.source} onChange={(e) => patchCoIncome(row.id, { source: e.target.value })}>
                          {[...sourcePool, ...CO_SOURCES].filter((s, i, a) => a.indexOf(s) === i).map((s) => <option key={s}>{s}</option>)}
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
                  </div>
                  <div className="flex items-center justify-between mt-2.5 flex-wrap gap-2">
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
                      Co-borrower income <strong className="mono text-[14px]" style={{ color: "var(--sky)" }}>{fmtAED(r.coIncome)}</strong>/mo
                    </div>
                  </div>

                  {/* co-borrower liabilities — combined with the applicant's for DBR */}
                  <div className="mt-3 pt-3" style={{ borderTop: "1px dashed color-mix(in srgb, var(--sky) 30%, transparent)" }}>
                    <div className="text-[10.5px] uppercase tracking-[0.1em] font-disp font-semibold mb-2" style={{ color: "var(--sky)" }}>
                      Their liabilities
                    </div>
                    {input.coBorrower.liabilities.length === 0 && (
                      <p className="text-[12px] text-[var(--ink-faint)] m-0 mb-2">No liabilities declared for the co-borrower.</p>
                    )}
                    <div className="overflow-x-auto scroll-slim -mx-1 px-1">
                    <div className="min-w-[560px] space-y-2">
                      {input.coBorrower.liabilities.map((l) => (
                        <div key={l.id} className="rounded-lg p-2.5 anim-fade-in" style={{ background: "color-mix(in srgb, var(--sky) 5%, transparent)", border: "1px solid color-mix(in srgb, var(--sky) 18%, transparent)" }}>
                          <div className="grid grid-cols-[1fr_130px_130px] gap-2">
                            <input className="input" value={l.name} onChange={(e) => patchCoLiab(l.id, { name: e.target.value })} placeholder="Liability name" />
                            <select className="select" value={l.type} onChange={(e) => patchCoLiab(l.id, { type: e.target.value as LiabRow["type"] })}>
                              {LIAB_TYPES.map((t) => <option key={t}>{t}</option>)}
                            </select>
                            <select className="select" value={l.method} onChange={(e) => patchCoLiab(l.id, { method: e.target.value as LiabRow["method"] })}>
                              {LIAB_METHODS.map((m) => <option key={m}>{m}</option>)}
                            </select>
                          </div>
                          <div className="grid grid-cols-[1fr_1fr_110px_30px] gap-2 mt-2 items-center">
                            <div>
                              <label className="label" style={{ marginBottom: 3 }}>{l.type === "Credit Card" || l.type === "Overdraft" ? "Limit / outstanding" : "Outstanding"}</label>
                              <NumIn value={l.limitOrOutstanding} onChange={(n) => patchCoLiab(l.id, { limitOrOutstanding: n })} step={1000} />
                            </div>
                            <div>
                              <label className="label" style={{ marginBottom: 3 }}>Monthly EMI {l.method.startsWith("5%") ? "(ignored)" : ""}</label>
                              <NumIn value={l.monthlyEmi} onChange={(n) => patchCoLiab(l.id, { monthlyEmi: n })} step={100} />
                            </div>
                            <div className="text-right">
                              <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-faint)] font-disp font-semibold">Assessed</div>
                              <div className="mono text-[13px]" style={{ color: "var(--coral)" }}>{fmtAED(liabilityEmi(l))}</div>
                            </div>
                            <button className="text-[var(--ink-faint)] hover:text-[var(--coral)] transition-colors justify-self-center" title="Remove liability"
                              onClick={() =>
                                setInput((p) => ({
                                  ...p,
                                  coBorrower: p.coBorrower ? { ...p.coBorrower, liabilities: p.coBorrower.liabilities.filter((x) => x.id !== l.id) } : p.coBorrower,
                                }))
                              }>
                              <ITrash size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    </div>
                    <div className="flex items-center justify-between mt-2.5 flex-wrap gap-2">
                      <button className="btn btn-ghost btn-sm"
                        onClick={() =>
                          setInput((p) => ({
                            ...p,
                            coBorrower: p.coBorrower ? { ...p.coBorrower, liabilities: [...p.coBorrower.liabilities, newLiabRow()] } : p.coBorrower,
                          }))
                        }>
                        <IPlus size={13} /> Add co-borrower liability
                      </button>
                      <div className="text-[12.5px]">
                        Co-borrower EMIs <strong className="mono text-[14px]" style={{ color: "var(--coral)" }}>{fmtAED(r.coEmis)}</strong>/mo
                      </div>
                    </div>
                  </div>

                  <p className="text-[11px] text-[var(--ink-faint)] mt-2.5 mb-0">
                    Income, liabilities and age are combined into the eligibility calculation only — the co-borrower is never written to the case file.
                  </p>
                </div>
              )}
            </div>
          </Section>

          <Section num="04" title="Liabilities" hint="credit cards assess at 5% of limit by default">
            {input.liabilities.length === 0 && (
              <p className="text-[12.5px] text-[var(--ink-faint)] m-0">No liabilities declared — the full DBR headroom is available.</p>
            )}
            <div className="overflow-x-auto scroll-slim -mx-1 px-1">
            <div className="min-w-[560px] space-y-2">
              {input.liabilities.map((l) => (
                <div key={l.id} className="rounded-lg p-2.5 anim-fade-in" style={{ background: "var(--tint)", border: "1px solid var(--line-soft)" }}>
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
            </div>
            <div className="flex items-center justify-between mt-3 flex-wrap gap-2">
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
                        ? { background: "var(--amber-tint)", borderColor: "var(--amber)", color: "var(--amber)" }
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

          {/* quick tools */}
          <div className="anim-fade-up">
            <div className="flex items-baseline gap-3 mb-2.5 px-1">
              <span className="mono text-[11px] font-semibold px-1.5 py-0.5 rounded" style={{ background: "color-mix(in srgb, var(--sky) 14%, transparent)", color: "var(--sky)" }}>T</span>
              <h2 className="font-disp font-semibold text-[15px] m-0">Quick tools</h2>
              <span className="text-[11.5px] text-[var(--ink-faint)]">inverse answers using the assessment above</span>
            </div>
            <QuickTools input={input} r={r} />
          </div>
        </div>

        {/* ================= result rail ================= */}
        <div ref={resultsRef} className="space-y-4 xl:sticky xl:top-[86px] scroll-mt-20">
          <div className="card p-5 anim-fade-up" style={{ borderColor: "var(--amber-line)", background: "linear-gradient(180deg, var(--amber-tint), var(--surface))", boxShadow: "var(--shadow)" }}>
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
              <div className="relative h-3 rounded-full overflow-hidden" style={{ background: "var(--track)" }}>
                <div className="absolute inset-y-0 left-0 rounded-full transition-all duration-500" style={{ width: `${Math.min(100, (r.currentDbr / 60) * 100)}%`, background: r.currentDbr > 50 ? "var(--coral)" : "linear-gradient(90deg, var(--mint), var(--amber))" }} />
              </div>
              <div className="flex justify-between text-[11px] mt-1.5">
                <span className="text-[var(--ink-dim)]">current <strong className="mono">{fmtPct(r.currentDbr)}</strong></span>
                <span style={{ color: "var(--mint)" }}>residual <strong className="mono">{fmtPct(r.residualDbr)}</strong></span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-3 mt-4 pt-4" style={{ borderTop: "1px dashed var(--line)" }}>
              <Stat label="DBR MPBF" value={fmtAED(r.dbrMpbf)} />
              <Stat label="LTV MPBF" value={fmtAED(r.ltvMpbf)} />
              {r.multiplierCap != null && <Stat label="Multiplier cap" value={fmtAED(r.multiplierCap)} />}
              <Stat label="Down payment" value={fmtAED(r.downPayment)} tone="var(--coral)" />
              <Stat label="Actual LTV" value={fmtPct(r.actualLtv)} />
              <Stat label="EMI @ actual rate" value={`${fmtAED(r.newEmi)}/mo`} />
              <Stat label="DBR after mortgage" value={fmtPct(r.dbrAfter)} tone={r.dbrAfter > 50 ? "var(--coral)" : "var(--mint)"} />
              <Stat label="Tenor" value={tenorLabel(r.maxTenorMonths)} />
            </div>

            <div className="flex flex-col gap-2 mt-4">
              <button className="btn btn-primary justify-center" onClick={() => setPreview({
                input, res: r,
                tables: buildScenarioTablesFor(input, r),
                by: session?.name ?? "HFMC",
                obs: (() => {
                  const liab = runScenarios(liabScenarios);
                  const income = runScenarios(incomeScenarios);
                  const best = [...liab, ...income]
                    .map((s) => ({ label: s.label, d: s.mpbf - r.finalMpbf, dbr: s.dbr }))
                    .filter((c) => c.d > 5000)
                    .sort((a, b) => b.d - a.d)[0];
                  return best
                    ? `Strongest lever: ${best.label} — DBR moves ${fmtPct(r.currentDbr)} → ${fmtPct(best.dbr)}, unlocking ${fmtAED(best.d)} of additional MPBF.`
                    : `No scenario improves the baseline ${fmtAED(r.finalMpbf)} — the binding constraint is ${r.limitedBy.toLowerCase()}.`;
                })(),
              })}>
                <IEye size={15} /> View bank-facing report
              </button>
              <button className="btn btn-ghost justify-center" onClick={savePdf}>
                <IDownload size={15} /> Download PDF
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button className="btn btn-mint justify-center" onClick={onSave}>Save check</button>
                <button className="btn btn-ghost justify-center" onClick={onOpenCase}>Open case…</button>
              </div>
              <p className="text-[10.5px] text-[var(--ink-faint)] text-center m-0">
                Saving only stores the check for audit — a case is created only when you choose “Open case”.
              </p>
              {savedId && <p className="text-[11px] text-[var(--ink-faint)] text-center m-0">Saved as audit entry #{savedId}{input.name ? ` for ${input.name}` : ""}</p>}
            </div>
          </div>

          {r.notes.length > 0 && (
            <div className="card p-4 anim-fade-up">
              <div className="text-[10.5px] uppercase tracking-[0.12em] font-disp font-semibold text-[var(--ink-faint)] mb-2">Notes</div>
              <ul className="m-0 pl-4 space-y-1">
                {r.notes.map((n, i) => (
                  <li key={i} className="text-[12px] text-[var(--ink-dim)] leading-snug">{n}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* ================= what-if ================= */}
      <div className="card anim-fade-up">
        <div className="px-4 py-3 border-b flex flex-wrap items-center gap-2" style={{ borderColor: "var(--line-soft)" }}>
          <h3 className="font-disp font-semibold text-[13.5px] m-0">What-if analysis</h3>
          <span className="text-[11px] text-[var(--ink-faint)] hidden sm:inline">what moves the number?</span>
          <div className="ml-auto flex gap-1.5 flex-wrap">
            {([
              { k: "liab" as const, l: "Liabilities" },
              { k: "rate" as const, l: "Rate" },
              { k: "tenor" as const, l: "Tenor" },
              { k: "income" as const, l: "Income" },
            ]).map((t) => (
              <button key={t.k} className="chip transition-all"
                style={whif === t.k ? { background: "var(--amber-tint)", borderColor: "var(--amber)", color: "var(--amber)" } : { background: "var(--bg2)", borderColor: "var(--line)", color: "var(--ink-faint)" }}
                onClick={() => setWhif(t.k)}>
                {t.l}
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
          <ICalc size={15} className="text-[var(--amber)]" />
          <h3 className="font-disp font-semibold text-[13.5px] m-0">Saved checks · audit trail</h3>
          <span className="mono text-[11px] text-[var(--ink-faint)] ml-auto">{checks.length} saved</span>
        </div>
        {checks.length === 0 ? (
          <p className="text-[12.5px] text-[var(--ink-faint)] p-4 m-0">Nothing saved yet — run a check and hit “Save check”.</p>
        ) : (
          <div className="divide-y" style={{ borderColor: "var(--line-soft)" }}>
            {checks.map((k) => {
              let parsed: { input?: MortgageInput } | null = null;
              try {
                parsed = k.payload ? (JSON.parse(k.payload) as { input?: MortgageInput }) : null;
              } catch {
                parsed = null;
              }
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
                        <button className="btn btn-ghost btn-sm" onClick={() => { setInput(normalizeInput(parsed!.input as MortgageInput)); setSavedId(k.id); window.scrollTo({ top: 0, behavior: "smooth" }); toast("info", `Loaded check #${k.id} for ${k.customerName}.`); }}>
                          Open
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => {
                          const ni = normalizeInput(parsed!.input as MortgageInput);
                          const ri = computeMortgage(ni);
                          generateMortgagePdf(ni, ri, [], session?.name ?? "HFMC");
                        }}>
                          PDF
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => {
                          const pi = normalizeInput(parsed!.input as MortgageInput);
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

      <div className="flex items-center gap-2 text-[11.5px] text-[var(--ink-faint)] px-1 pb-20 xl:pb-0">
        <Avatar name={session?.name ?? "?"} size={20} />
        <span>Prepared by {session?.name} · figures follow CBUAE-style limits (50% DBR, {input.applicantType} LTV bands, 25y max tenor) — lender policy may differ.</span>
      </div>

      {/* thumb-reach result bar — phones only, taps through to the full rail */}
      <div
        className="xl:hidden fixed bottom-0 inset-x-0 z-40 px-3 pb-safe pt-1.5"
        style={{ background: "color-mix(in srgb, var(--bg) 86%, transparent)", backdropFilter: "blur(10px)", borderTop: "1px solid var(--line-soft)" }}
      >
        <button
          onClick={scrollToResults}
          className="w-full card flex items-center justify-between gap-3 px-4 py-2.5 text-left transition-transform active:scale-[0.985]"
          style={{ borderColor: "var(--amber-line)", boxShadow: "0 12px 32px -12px rgba(15,23,42,0.4)" }}
        >
          <span className="min-w-0">
            <span className="block text-[9.5px] uppercase tracking-[0.14em] font-disp font-semibold" style={{ color: "var(--amber)" }}>Final MPBF</span>
            <span className="block mono font-bold text-[19px] leading-tight tabular-nums truncate">{fmtAED(r.finalMpbf)}</span>
          </span>
          <span className="flex items-center gap-1.5 shrink-0">
            <Chip tone={r.limitedBy === "DBR / Income" ? "coral" : r.limitedBy === "LTV" ? "sky" : "amber"}>{r.limitedBy}</Chip>
            <IChevronL size={15} className="-rotate-90 text-[var(--ink-faint)]" />
          </span>
        </button>
      </div>

      {preview && (
        <PreviewReport
          data={preview}
          onClose={() => setPreview(null)}
          onPdf={() => generateMortgagePdf(preview.input, preview.res, preview.tables, preview.by, preview.obs)}
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

  const now = new Date();
  const date = now.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
  const ref = `HFMC-MEA-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(
    now.getDate()
  ).padStart(2, "0")}-${(inp.name || "client").replace(/[^a-z0-9]/gi, "").slice(0, 6).toUpperCase() || "CLIENT"}`;
  const numTh = (t: string) => (
    <th className="num">{t}</th>
  );

  const PageLabel = ({ n, title }: { n: number; title: string }) => (
    <div className="paper-page-label">
      <span>Page {n} of 3 · {title}</span>
    </div>
  );

  const SlimBand = ({ n, title }: { n: number; title: string }) => (
    <div className="paper-band paper-band--slim">
      <span className="font-disp font-bold text-[12px] tracking-[0.03em]">HFMC — Mortgage Eligibility Assessment</span>
      <span className="text-[10px] opacity-70 mono">Page {n} · {title} · {ref}</span>
    </div>
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
          <PageLabel n={1} title="Eligibility summary" />
          <div className="paper mb-7 anim-fade-up">
            <div className="paper-band">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="font-disp font-bold text-[17px] leading-tight">HFMC — Mortgage Eligibility Assessment</div>
                  <div className="text-[10.5px] opacity-75 mt-1">Preliminary assessment · not a bank approval or binding offer</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="mono text-[10px] opacity-90">{ref}</div>
                  <div className="text-[10px] opacity-70 mt-0.5">{date}</div>
                </div>
              </div>
            </div>
            <div className="paper-body">
              <div className="paper-sec">Applicant & Property</div>
              <Pkv
                rows={[
                  ["Applicant", inp.name || "—"],
                  ["Applicant type", `${inp.applicantType} · ${inp.employment}`],
                  ...(inp.coBorrower
                    ? ([["Co-borrower", `${inp.coBorrower.name || "—"} · age ${res.coAgeYears} · income ${fmtAED(res.coIncome)}/mo · EMIs ${fmtAED(res.coEmis)}/mo (combined)`]] as [string, string][])
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
                  ...(inp.coBorrower
                    ? ([
                        ["  · Applicant EMIs", fmtAED(res.ownEmis)],
                        ["  · Co-borrower EMIs", fmtAED(res.coEmis)],
                      ] as [string, string][])
                    : []),
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
                  ["LTV applied", `${res.ltvPct}%${inp.ltvPctChoice != null || inp.customLtv ? " (selected)" : ` (default · ${inp.applicantType})`}`],
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
          <PageLabel n={2} title="Supporting calculation" />
          <div className="paper mb-7 anim-fade-up">
            <SlimBand n={2} title="Supporting calculation" />
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

              <div className="paper-sec">Liability Breakdown — Applicant</div>
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
                    <td colSpan={4}>Applicant existing EMIs</td>
                    <td className="num">{fmtAED(res.ownEmis)}</td>
                  </tr>
                </tfoot>
              </table>

              {inp.coBorrower && (
                <>
                  <div className="paper-sec">Liability Breakdown — Co-borrower{inp.coBorrower.name ? ` (${inp.coBorrower.name})` : ""}</div>
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
                      {inp.coBorrower.liabilities.length === 0 && (
                        <tr><td colSpan={5}>No liabilities declared</td></tr>
                      )}
                      {inp.coBorrower.liabilities.map((row) => (
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
                        <td colSpan={4}>Co-borrower existing EMIs</td>
                        <td className="num">{fmtAED(res.coEmis)}</td>
                      </tr>
                      <tr>
                        <td colSpan={4}>Combined existing EMIs</td>
                        <td className="num">{fmtAED(res.existingEmis)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </>
              )}

              <div className="paper-sec">Rate, Stress & Tenor</div>
              <Pkv
                rows={[
                  ["Assessment basis", `${fmtPct(res.actualRate)} actual + ${res.loadFactor.toFixed(2)}% load = ${fmtPct(res.assessmentRate)} assessment`],
                  ["Age calculation", `${res.ageNowYears}y now + ${inp.marginMonths}m margin → final age ${inp.finalAge} → ${tenorLabel(res.remainingMonths)} available`],
                  ["Tenor used", `${tenorLabel(res.maxTenorMonths)}${inp.tenorOverrideMonths ? " (manual override)" : res.tenorLimitedBy === "co-borrower" ? ` (limited by co-borrower, age ${res.coAgeYears})` : " (age-constrained)"}`],
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
          <PageLabel n={3} title="What-if analysis" />
          <div className="paper mb-7 anim-fade-up">
            <SlimBand n={3} title="What-if analysis" />
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
