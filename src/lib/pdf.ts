import jsPDF from "jspdf";
import type { MortgageInput, MortgageResult } from "./mortgage";
import { fmtAED, fmtPct, incomeMonthly, liabilityEmi, tenorLabel } from "./mortgage";

const INK: [number, number, number] = [17, 26, 30];
const FAINT: [number, number, number] = [110, 122, 126];
const AMBER: [number, number, number] = [198, 138, 40];
const POS: [number, number, number] = [16, 122, 82];
const NEG: [number, number, number] = [176, 62, 50];

export interface PdfScenarioTable {
  title: string;
  head: string[];
  body: (string | number)[][];
}

interface TCol {
  header: string;
  width: number;
  align?: "left" | "right";
}

export function generateMortgagePdf(
  inp: MortgageInput,
  res: MortgageResult,
  scenarios: PdfScenarioTable[],
  preparedBy: string,
  keyObservation?: string
) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const M = 48;
  const CW = W - 2 * M;
  const BOTTOM = 780;
  let y = 0;

  const now = new Date();
  const ref = `HFMC-MEA-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(
    now.getDate()
  ).padStart(2, "0")}-${(inp.name || "client").replace(/[^a-z0-9]/gi, "").slice(0, 6).toUpperCase() || "CLIENT"}`;

  const header = (newPage = false) => {
    if (newPage) doc.addPage();
    doc.setFillColor(...INK);
    doc.rect(0, 0, W, 76, "F");
    doc.setFillColor(...AMBER);
    doc.rect(0, 76, W, 3, "F");
    doc.setTextColor(244, 238, 226);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.text("HFMC — Mortgage Eligibility Assessment", M, 32);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(180, 176, 166);
    doc.text("Preliminary assessment · not a bank approval or binding offer", M, 50);
    doc.setFontSize(8);
    doc.setTextColor(214, 178, 106);
    doc.text(ref, W - M, 32, { align: "right" });
    doc.setTextColor(180, 176, 166);
    doc.text(
      now.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
      W - M, 50, { align: "right" }
    );
    y = 100;
  };

  /* page footer written once all pages exist */
  const footer = () => {
    const total = doc.getNumberOfPages();
    for (let p = 1; p <= total; p++) {
      doc.setPage(p);
      doc.setDrawColor(220, 214, 200);
      doc.setLineWidth(0.6);
      doc.line(M, 806, W - M, 806);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(...FAINT);
      doc.text(`${ref} · preliminary`, M, 818);
      doc.text(`Page ${p} of ${total}`, W - M, 818, { align: "right" });
    }
  };

  const section = (title: string) => {
    if (y > BOTTOM - 46) {
      doc.addPage();
      header();
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...INK);
    doc.text(title.toUpperCase(), M + 0.5, y);
    doc.setFillColor(...AMBER);
    doc.rect(M, y + 5, 22, 2.6, "F");
    y += 20;
  };

  /* ledger-style rows: label … dotted leader … right-aligned bold value (wraps if long) */
  const kv = (rows: [string, string][]) => {
    const VALUE_MAX = 268;
    for (const [k, v] of rows) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      const vLines = doc.splitTextToSize(v, VALUE_MAX) as string[];
      const rowH = vLines.length * 13 + 2.5;
      if (y + rowH > BOTTOM) {
        doc.addPage();
        header();
      }
      const widest = Math.max(...vLines.map((ln) => doc.getTextWidth(ln)));
      vLines.forEach((ln, li) => {
        doc.setTextColor(...INK);
        doc.text(ln, W - M, y + 10 + li * 13, { align: "right" });
      });
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...FAINT);
      doc.text(k, M, y + 10);
      const labelW = doc.getTextWidth(k);
      const startX = M + labelW + 7;
      const endX = W - M - widest - 7;
      if (endX - startX > 16) {
        doc.setDrawColor(206, 200, 187);
        doc.setLineWidth(0.75);
        doc.setLineDashPattern([0.75, 2.6], 0);
        doc.line(startX, y + 7.6, endX, y + 7.6);
        doc.setLineDashPattern([], 0);
      }
      y += rowH;
    }
  };

  /* one table engine for the whole document: wrapped cells, dynamic row heights,
     right-aligned figures, zebra rows, bold totals, header repeats after page breaks */
  const wtable = (rawCols: TCol[], rows: (string | number)[][], foot?: (string | number)[][]) => {
    const scale = CW / rawCols.reduce((s, c) => s + c.width, 0);
    const cols = rawCols.map((c) => ({ ...c, width: c.width * scale }));
    const PAD = 7;
    const LINE = 11.5;
    const HEAD_H = 20;
    const footRows = foot ?? [];

    const drawHead = () => {
      doc.setFillColor(...INK);
      doc.rect(M, y, CW, HEAD_H, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(244, 238, 226);
      let hx = M;
      for (const c of cols) {
        doc.text(c.header.toUpperCase(), c.align === "right" ? hx + c.width - PAD : hx + PAD, y + 12.8, {
          align: c.align === "right" ? "right" : "left",
        });
        hx += c.width;
      }
      y += HEAD_H;
    };

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    const wrap = (s: string, w: number) => doc.splitTextToSize(s, w) as string[];
    const wrappedBody = rows.map((r) => r.map((cell, ci) => wrap(String(cell), cols[ci].width - PAD * 2)));
    const wrappedFoot = footRows.map((r) => r.map((cell, ci) => wrap(String(cell), cols[ci].width - PAD * 2)));

    if (y + HEAD_H + 34 > BOTTOM) {
      doc.addPage();
      header();
    }
    drawHead();

    const drawRow = (cells: string[][], raw: (string | number)[], i: number, kind: "body" | "foot") => {
      const lines = Math.max(...cells.map((c) => c.length));
      const rowH = lines * LINE + 7.5;
      if (y + rowH > BOTTOM) {
        doc.addPage();
        header();
        drawHead();
      }
      if (kind === "foot") {
        doc.setFillColor(238, 233, 221);
        doc.rect(M, y, CW, rowH, "F");
      } else if (i % 2 === 1) {
        doc.setFillColor(248, 246, 240);
        doc.rect(M, y, CW, rowH, "F");
      }
      let rx = M;
      cells.forEach((cellLines, ci) => {
        const c = cols[ci];
        const s = String(raw[ci]);
        if (kind === "foot") {
          doc.setFont("helvetica", "bold");
          doc.setTextColor(...INK);
        } else if (c.header === "Change") {
          doc.setFont("helvetica", "bold");
          if (s.startsWith("+")) doc.setTextColor(...POS);
          else if (s.startsWith("-") || s.startsWith("−")) doc.setTextColor(...NEG);
          else {
            doc.setFont("helvetica", "normal");
            doc.setTextColor(FAINT[0], FAINT[1], FAINT[2]);
          }
        } else {
          doc.setFont("helvetica", ci === 0 && i === 0 ? "bold" : "normal");
          doc.setTextColor(INK[0], INK[1], INK[2]);
        }
        cellLines.forEach((ln, li) => {
          doc.text(ln, c.align === "right" ? rx + c.width - PAD : rx + PAD, y + 13 + li * LINE, {
            align: c.align === "right" ? "right" : "left",
          });
        });
        rx += c.width;
      });
      doc.setDrawColor(228, 222, 210);
      doc.setLineWidth(0.4);
      doc.line(M, y + rowH, M + CW, y + rowH);
      y += rowH;
    };

    wrappedBody.forEach((cells, i) => drawRow(cells, rows[i], i, "body"));
    if (wrappedFoot.length) {
      doc.setDrawColor(...INK);
      doc.setLineWidth(0.9);
      doc.line(M, y, M + CW, y);
      doc.setLineWidth(0.4);
      wrappedFoot.forEach((cells, i) => drawRow(cells, footRows[i], i, "foot"));
    }
    y += 12;
  };

  const coName = inp.coBorrower?.name?.trim() ? ` + ${inp.coBorrower.name.trim()}` : "";

  /* ============ PAGE 1 — Eligibility summary ============ */
  header();
  section("Applicant & Property");
  kv([
    ["Applicant", (inp.name || "—") + coName],
    ["Applicant type", `${inp.applicantType} · ${inp.employment}`],
    ...(inp.coBorrower ? ([["Co-borrower", inp.coBorrower.name || "—"]] as [string, string][]) : []),
    ["Property value", fmtAED(inp.propertyValue)],
    ["Bank valuation", inp.valuation ? fmtAED(inp.valuation) : "Not available"],
    ["Calculation basis", `${fmtAED(res.calcBasis)} (${res.basisLabel})`],
    ["Requested finance", inp.requested > 0 ? fmtAED(inp.requested) : "—"],
  ]);
  y += 8;

  section("Eligibility Summary");
  kv([
    ["Eligible monthly income", `${fmtAED(res.eligibleIncome)}${inp.coBorrower ? " (combined)" : ""}`],
    ...(inp.coBorrower
      ? ([
          ["  · Applicant", fmtAED(res.ownIncome)],
          ["  · Co-borrower", fmtAED(res.coIncome)],
        ] as [string, string][])
      : []),
    ["Existing monthly liabilities", `${fmtAED(res.existingEmis)}${inp.coBorrower ? " (combined)" : ""}`],
    ["Current DBR", fmtPct(res.currentDbr)],
    ["Maximum DBR", fmtPct(res.maxDbr)],
    ["Residual DBR", fmtPct(res.residualDbr)],
  ]);
  y += 8;

  section("Loan Parameters");
  kv([
    ["Actual rate", fmtPct(res.actualRate)],
    ["Load factor", `+${res.loadFactor.toFixed(2)}%`],
    ["Assessment rate", fmtPct(res.assessmentRate)],
    ["LTV applied", `${res.ltvPct}%`],
    ["Current age", `${res.ageNowYears} yrs`],
    ["Processing margin", `${inp.marginMonths} months`],
    ["Maximum tenor", tenorLabel(res.maxTenorMonths)],
  ]);
  y += 8;

  section("MPBF — Eligibility Tests");
  const mpbfRows: [string, string][] = [
    ["DBR / Residual DBR MPBF", fmtAED(res.dbrMpbf)],
    ["LTV MPBF", fmtAED(res.ltvMpbf)],
  ];
  if (res.multiplierCap != null) mpbfRows.push(["Income multiplier cap", fmtAED(res.multiplierCap)]);
  if (res.requested > 0) mpbfRows.push(["Requested finance", fmtAED(res.requested)]);
  kv(mpbfRows);
  y += 4;
  doc.setFillColor(...INK);
  doc.roundedRect(M, y, CW, 46, 4, 4, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(244, 238, 226);
  doc.text("FINAL MPBF", M + 14, y + 29);
  doc.setFontSize(14);
  doc.setTextColor(242, 176, 76);
  doc.text(fmtAED(res.finalMpbf), W - M - 14, y + 29, { align: "right" });
  y += 58;
  kv([
    ["Limited by", res.limitedBy],
    ["Required down payment", fmtAED(res.downPayment)],
    ["Actual LTV", fmtPct(res.actualLtv)],
    ["DBR after proposed mortgage", fmtPct(res.dbrAfter)],
  ]);

  /* ============ PAGE 2 — Supporting calculation ============ */
  header(true);
  const incomeCols: TCol[] = [
    { header: "Source", width: 150 },
    { header: "Frequency", width: 82 },
    { header: "Amount", width: 102, align: "right" },
    { header: "Elig %", width: 56, align: "right" },
    { header: "Monthly equiv.", width: 109, align: "right" },
  ];

  section("Income Breakdown — Applicant");
  wtable(
    incomeCols,
    inp.incomes.length
      ? inp.incomes.map((r) => [r.source, r.frequency, fmtAED(r.amount), `${r.eligiblePct}%`, fmtAED(incomeMonthly(r))])
      : [["No income entered", "", "", "", ""]],
    [["Applicant eligible income", "", "", "", fmtAED(res.ownIncome)]]
  );

  if (inp.coBorrower) {
    section(`Income Breakdown — Co-borrower${inp.coBorrower.name ? ` (${inp.coBorrower.name})` : ""}`);
    wtable(
      incomeCols,
      inp.coBorrower.incomes.length > 0
        ? inp.coBorrower.incomes.map((r) => [r.source, r.frequency, fmtAED(r.amount), `${r.eligiblePct}%`, fmtAED(incomeMonthly(r))])
        : [["No income entered", "", "", "", ""]],
      [
        ["Co-borrower eligible income", "", "", "", fmtAED(res.coIncome)],
        ["Combined eligible income", "", "", "", fmtAED(res.eligibleIncome)],
      ]
    );
  }

  const liabCols: TCol[] = [
    { header: "Liability", width: 128 },
    { header: "Type", width: 86 },
    { header: "Limit / Outstanding", width: 108, align: "right" },
    { header: "Method", width: 96 },
    { header: "Assessed EMI", width: 81, align: "right" },
  ];

  section("Liability Breakdown");
  wtable(
    liabCols,
    inp.liabilities.length
      ? inp.liabilities.map((r) => [r.name, r.type, fmtAED(r.limitOrOutstanding), r.method, fmtAED(liabilityEmi(r))])
      : [["No liabilities declared", "", "", "", ""]],
    [["Existing monthly liabilities", "", "", "", fmtAED(res.ownEmis)]]
  );

  section("Rate, Stress & Tenor");
  kv([
    ["Rate basis", `${fmtPct(res.actualRate)} actual + ${res.loadFactor.toFixed(2)}% load = ${fmtPct(res.assessmentRate)} assessment`],
    ["Age calculation", `${res.ageNowYears}y + ${inp.marginMonths}m margin → final age ${inp.finalAge} → ${tenorLabel(res.remainingMonths)} available`],
    ["Tenor used", tenorLabel(res.maxTenorMonths)],
  ]);
  y += 6;

  section("Calculation Trail");
  doc.setFont("courier", "normal");
  doc.setFontSize(8.5);
  const trailLines: string[] = [];
  for (const line of res.trail) {
    const wrapped = doc.splitTextToSize(line, CW - 30) as string[];
    trailLines.push(...wrapped);
  }
  const trailH = trailLines.length * 12.5 + 17;
  if (y + trailH > BOTTOM) {
    doc.addPage();
    header();
  }
  doc.setFillColor(247, 245, 239);
  doc.setDrawColor(226, 220, 208);
  doc.setLineWidth(0.8);
  doc.roundedRect(M, y, CW, trailH, 3, 3, "FD");
  doc.setTextColor(...INK);
  let ty = y + 16;
  for (const l of trailLines) {
    doc.text(l, M + 14, ty);
    ty += 12.5;
  }
  y += trailH + 12;

  /* ============ PAGES 3–4 — What-if analysis ============ */
  const scenCols = (first: string): TCol[] => [
    { header: first, width: 175 },
    { header: "Current DBR", width: 80, align: "right" },
    { header: "Residual DBR", width: 82, align: "right" },
    { header: "MPBF", width: 100, align: "right" },
    { header: "Change", width: 98, align: "right" },
  ];
  const simpleCols = (first: string, second: string): TCol[] => [
    { header: first, width: 210 },
    { header: second, width: 110, align: "right" },
    { header: "MPBF", width: 110, align: "right" },
    { header: "Change", width: 105, align: "right" },
  ];

  const [liab, rate, tenor, income] = scenarios;

  header(true);
  section("What-If Analysis");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...FAINT);
  const introLines = doc.splitTextToSize(
    `Each scenario re-runs the full calculation with one input changed. Baseline final MPBF: ${fmtAED(res.finalMpbf)} — green deltas add eligibility, red reduce it.`,
    CW
  ) as string[];
  for (const l of introLines) {
    doc.text(l, M, y);
    y += 12;
  }
  y += 8;

  /* headline first: the one line a credit officer should remember */
  if (keyObservation) {
    const lines = doc.splitTextToSize(keyObservation, CW - 26) as string[];
    const boxH = lines.length * 12.5 + 18;
    if (y + boxH > BOTTOM) {
      doc.addPage();
      header();
    }
    doc.setFillColor(251, 246, 236);
    doc.setDrawColor(...AMBER);
    doc.setLineWidth(0.9);
    doc.roundedRect(M, y, CW, boxH, 3, 3, "FD");
    doc.setFillColor(...AMBER);
    doc.rect(M, y, 3.5, boxH, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...AMBER);
    doc.text("KEY OBSERVATION", M + 14, y + 13);
    doc.setFontSize(9);
    doc.setTextColor(...INK);
    let by = y + 26;
    for (const l of lines) {
      doc.text(l, M + 14, by);
      by += 12.5;
    }
    y += boxH + 14;
  }

  if (liab) {
    section(liab.title);
    wtable(scenCols("Scenario"), liab.body);
  }
  if (rate) {
    section(rate.title);
    wtable(simpleCols("Scenario", "Assessment rate"), rate.body);
  }
  if (tenor) {
    section(tenor.title);
    wtable(simpleCols("Scenario", "Tenor"), tenor.body);
  }
  if (income) {
    section(income.title);
    wtable(simpleCols("Scenario", "Eligible income"), income.body);
  }

  /* closing block — kept together on whichever page has room */
  if (y > BOTTOM - 130) {
    doc.addPage();
    header();
  }
  section("Basis & Disclaimer");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...FAINT);
  const disclaimer = doc.splitTextToSize(
    "Prepared with the HFMC eligibility calculator. Figures are indicative, based on the inputs provided and CBUAE-style DBR/LTV limits; the LTV applied and tenor treatment follow the selected assumptions and lender policy may differ. This is not a bank approval, sanction or binding offer. Final eligibility is at the sole discretion of the lender.",
    CW
  ) as string[];
  for (const l of disclaimer) {
    doc.text(l, M, y);
    y += 12;
  }
  y += 14;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...INK);
  doc.text(`Prepared by: ${preparedBy}`, M, y);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...FAINT);
  doc.text(
    new Date().toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }),
    W - M, y, { align: "right" }
  );

  footer();

  const safeName = (inp.name || "applicant").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  doc.save(`HFMC-eligibility-${safeName}.pdf`);
}
