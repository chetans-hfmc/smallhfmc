import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { MortgageInput, MortgageResult } from "./mortgage";
import { fmtAED, fmtPct, incomeMonthly, liabilityEmi, tenorLabel } from "./mortgage";

const INK: [number, number, number] = [17, 26, 30];
const FAINT: [number, number, number] = [110, 122, 126];
const AMBER: [number, number, number] = [198, 138, 40];
const RULE: [number, number, number] = [220, 214, 200];
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

  const header = (page: number) => {
    doc.setFillColor(...INK);
    doc.rect(0, 0, W, 76, "F");
    doc.setFillColor(...AMBER);
    doc.rect(0, 76, W, 3, "F");
    doc.setTextColor(244, 238, 226);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.text("HFMC — Mortgage Eligibility Assessment", M, 34);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(180, 176, 166);
    doc.text(
      `Preliminary assessment · not a bank approval or binding offer · ${new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}`,
      M, 52
    );
    doc.text(`Page ${page}`, W - M, 52, { align: "right" });
    y = 100;
  };

  const section = (title: string) => {
    if (y > BOTTOM - 40) {
      doc.addPage();
      header(doc.getNumberOfPages());
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(...AMBER);
    doc.text(title.toUpperCase(), M, y);
    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.6);
    doc.line(M, y + 6, W - M, y + 6);
    y += 18;
  };

  const kv = (rows: [string, string][]) => {
    doc.setFontSize(9.5);
    for (const [k, v] of rows) {
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...FAINT);
      doc.text(k, M, y);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...INK);
      doc.text(v, M + 215, y);
      y += 15;
    }
  };

  /* custom clean table for what-if pages */
  const wtable = (cols: TCol[], rows: (string | number)[][]) => {
    const headH = 19;
    const rowH = 16.5;
    const needed = headH + rows.length * rowH + 4;
    if (y + needed > BOTTOM) {
      doc.addPage();
      header(doc.getNumberOfPages());
    }
    // header band
    doc.setFillColor(...INK);
    doc.rect(M, y, CW, headH, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(244, 238, 226);
    let x = M;
    for (const c of cols) {
      doc.text(c.header, c.align === "right" ? x + c.width - 7 : x + 7, y + 12.5, {
        align: c.align === "right" ? "right" : "left",
      });
      x += c.width;
    }
    y += headH;
    // rows
    rows.forEach((r, i) => {
      if (y + rowH > BOTTOM) {
        doc.addPage();
        header(doc.getNumberOfPages());
      }
      if (i % 2 === 1) {
        doc.setFillColor(249, 247, 242);
        doc.rect(M, y, CW, rowH, "F");
      }
      let rx = M;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      r.forEach((cell, ci) => {
        const c = cols[ci];
        const s = String(cell);
        const isChange = c.header === "Change";
        if (isChange) {
          if (s.startsWith("+")) doc.setTextColor(POS[0], POS[1], POS[2]);
          else if (s.startsWith("-")) doc.setTextColor(NEG[0], NEG[1], NEG[2]);
          else doc.setTextColor(FAINT[0], FAINT[1], FAINT[2]);
        } else if (ci === 0 && i === 0) {
          doc.setFont("helvetica", "bold");
          doc.setTextColor(INK[0], INK[1], INK[2]);
        } else {
          doc.setTextColor(INK[0], INK[1], INK[2]);
        }
        doc.text(s, c.align === "right" ? rx + c.width - 7 : rx + 7, y + 11.5, { align: c.align === "right" ? "right" : "left" });
        if (ci === 0 && i === 0) doc.setFont("helvetica", "normal");
        rx += c.width;
      });
      doc.setDrawColor(...RULE);
      doc.setLineWidth(0.4);
      doc.line(M, y + rowH, M + CW, y + rowH);
      y += rowH;
    });
    y += 10;
  };

  const coName = inp.coBorrower?.name?.trim() ? ` + ${inp.coBorrower.name.trim()}` : "";

  /* ============ PAGE 1 — Eligibility summary ============ */
  header(1);
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
  header(2);
  section("Income Breakdown — Applicant");
  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M },
    head: [["Source", "Frequency", "Amount", "Elig %", "Monthly"]],
    body: inp.incomes.map((r) => [r.source, r.frequency, fmtAED(r.amount), `${r.eligiblePct}%`, fmtAED(incomeMonthly(r))]),
    foot: [["Applicant eligible income", "", "", "", fmtAED(res.ownIncome)]],
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 5, textColor: INK },
    headStyles: { fillColor: INK, textColor: [244, 238, 226], fontStyle: "bold" },
    footStyles: { fillColor: [240, 236, 226], textColor: INK, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [249, 247, 242] },
    theme: "plain",
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 14;

  if (inp.coBorrower) {
    section(`Income Breakdown — Co-borrower${inp.coBorrower.name ? ` (${inp.coBorrower.name})` : ""}`);
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M },
      head: [["Source", "Frequency", "Amount", "Elig %", "Monthly"]],
      body:
        inp.coBorrower.incomes.length > 0
          ? inp.coBorrower.incomes.map((r) => [r.source, r.frequency, fmtAED(r.amount), `${r.eligiblePct}%`, fmtAED(incomeMonthly(r))])
          : [["No income entered", "", "", "", ""]],
      foot: [
        ["Co-borrower eligible income", "", "", "", fmtAED(res.coIncome)],
        ["Combined eligible income", "", "", "", fmtAED(res.eligibleIncome)],
      ],
      styles: { font: "helvetica", fontSize: 8.5, cellPadding: 5, textColor: INK },
      headStyles: { fillColor: INK, textColor: [244, 238, 226], fontStyle: "bold" },
      footStyles: { fillColor: [240, 236, 226], textColor: INK, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [249, 247, 242] },
      theme: "plain",
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 14;
  }

  section("Liability Breakdown");
  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M },
    head: [["Liability", "Type", "Limit / Outstanding", "Method", "Assessed EMI"]],
    body: inp.liabilities.length
      ? inp.liabilities.map((r) => [r.name, r.type, fmtAED(r.limitOrOutstanding), r.method, fmtAED(liabilityEmi(r))])
      : [["No liabilities declared", "", "", "", ""]],
    foot: [["Existing monthly liabilities", "", "", "", fmtAED(res.ownEmis)]],
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 5, textColor: INK },
    headStyles: { fillColor: INK, textColor: [244, 238, 226], fontStyle: "bold" },
    footStyles: { fillColor: [240, 236, 226], textColor: INK, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [249, 247, 242] },
    theme: "plain",
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 14;

  section("Rate, Stress & Tenor");
  kv([
    ["Rate basis", `${fmtPct(res.actualRate)} actual + ${res.loadFactor.toFixed(2)}% load = ${fmtPct(res.assessmentRate)} assessment`],
    ["Age calculation", `${res.ageNowYears}y + ${inp.marginMonths}m margin → final age ${inp.finalAge} → ${tenorLabel(res.remainingMonths)} available`],
    ["Tenor used", tenorLabel(res.maxTenorMonths)],
  ]);
  y += 6;

  section("Calculation Trail");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...INK);
  for (const line of res.trail) {
    const wrapped = doc.splitTextToSize(line, CW) as string[];
    for (const w of wrapped) {
      doc.text(w, M + 6, y);
      y += 13;
    }
  }

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

  header(3);
  section("What-If Analysis");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...FAINT);
  doc.text(
    "Each scenario re-runs the full calculation with one input changed, so the DBR, residual DBR and final MPBF shown are consistent end-to-end.",
    M, y, { maxWidth: CW }
  );
  y += 22;

  if (liab) {
    section(liab.title);
    wtable(scenCols("Scenario"), liab.body);
  }
  if (rate) {
    section(rate.title);
    wtable(simpleCols("Scenario", "Assessment rate"), rate.body);
  }

  doc.addPage();
  header(4);
  if (tenor) {
    section(tenor.title);
    wtable(simpleCols("Scenario", "Tenor"), tenor.body);
  }
  if (income) {
    section(income.title);
    wtable(simpleCols("Scenario", "Eligible income"), income.body);
  }

  if (keyObservation) {
    section("Key Observation");
    doc.setFillColor(251, 246, 236);
    doc.setDrawColor(...AMBER);
    doc.setLineWidth(0.8);
    const lines = doc.splitTextToSize(keyObservation, CW - 24) as string[];
    const boxH = lines.length * 12.5 + 16;
    doc.roundedRect(M, y, CW, boxH, 3, 3, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...INK);
    let by = y + 15;
    for (const l of lines) {
      doc.text(l, M + 12, by);
      by += 12.5;
    }
    y += boxH + 12;
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

  const safeName = (inp.name || "applicant").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  doc.save(`HFMC-eligibility-${safeName}.pdf`);
}
