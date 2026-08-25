import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { MortgageInput, MortgageResult } from "./mortgage";
import { fmtAED, fmtPct, incomeMonthly, liabilityEmi, tenorLabel } from "./mortgage";

const INK: [number, number, number] = [17, 26, 30];
const FAINT: [number, number, number] = [110, 122, 126];
const AMBER: [number, number, number] = [198, 138, 40];
const RULE: [number, number, number] = [220, 214, 200];

export interface PdfScenarioTable {
  title: string;
  head: string[];
  body: (string | number)[][];
}

export function generateMortgagePdf(
  inp: MortgageInput,
  res: MortgageResult,
  scenarios: PdfScenarioTable[],
  preparedBy: string
) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const M = 48;
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
    doc.text(`Preliminary assessment · not a bank approval or binding offer · ${new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}`, M, 52);
    doc.text(`Page ${page}`, W - M, 52, { align: "right" });
    y = 100;
  };

  const section = (title: string) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(...AMBER);
    doc.text(title.toUpperCase(), M, y);
    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.6);
    doc.line(M, y + 6, W - M, y + 6);
    y += 18;
  };

  const kv = (rows: [string, string][], x = M, startY?: number) => {
    let yy = startY ?? y;
    doc.setFontSize(9.5);
    for (const [k, v] of rows) {
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...FAINT);
      doc.text(k, x, yy);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...INK);
      doc.text(v, x + 210, yy);
      yy += 15;
    }
    return yy;
  };

  /* ---------- page 1 — eligibility summary ---------- */
  header(1);
  section("Applicant & Property");
  y = kv([
    ["Applicant", inp.name || "—"],
    ["Applicant type", `${inp.applicantType} · ${inp.employment}`],
    ["Property value", fmtAED(inp.propertyValue)],
    ["Bank valuation", inp.valuation ? fmtAED(inp.valuation) : "Not available"],
    ["Calculation basis", `${fmtAED(res.calcBasis)} (${res.basisLabel})`],
    ["Requested finance", inp.requested > 0 ? fmtAED(inp.requested) : "—"],
  ]);
  y += 10;

  section("Eligibility Summary");
  y = kv([
    ["Eligible monthly income", fmtAED(res.eligibleIncome)],
    ["Existing monthly liabilities", fmtAED(res.existingEmis)],
    ["Current DBR", fmtPct(res.currentDbr)],
    ["Maximum DBR", fmtPct(res.maxDbr)],
    ["Residual DBR", fmtPct(res.residualDbr)],
    ["Actual rate", fmtPct(res.actualRate)],
    ["Stress load factor", `+${res.loadFactor.toFixed(2)}%`],
    ["Assessment rate", fmtPct(res.assessmentRate)],
    ["Current age", `${res.ageNowYears} yrs`],
    ["Processing margin", `${inp.marginMonths} months`],
    ["Maximum tenor", tenorLabel(res.maxTenorMonths)],
  ]);
  y += 10;

  section("MPBF");
  const mpbfRows: [string, string][] = [
    ["DBR / Residual DBR MPBF", fmtAED(res.dbrMpbf)],
    ["LTV MPBF", fmtAED(res.ltvMpbf)],
  ];
  if (res.multiplierCap != null) mpbfRows.push(["Income multiplier cap", fmtAED(res.multiplierCap)]);
  if (res.requested > 0) mpbfRows.push(["Requested finance", fmtAED(res.requested)]);
  y = kv(mpbfRows);
  y += 4;
  doc.setFillColor(...INK);
  doc.roundedRect(M, y, W - 2 * M, 46, 4, 4, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(244, 238, 226);
  doc.text("FINAL MPBF", M + 14, y + 29);
  doc.setFontSize(14);
  doc.setTextColor(242, 176, 76);
  doc.text(fmtAED(res.finalMpbf), W - M - 14, y + 29, { align: "right" });
  y += 60;
  y = kv([
    ["Limited by", res.limitedBy],
    ["Required down payment", fmtAED(res.downPayment)],
    ["Actual LTV", fmtPct(res.actualLtv)],
    ["DBR after proposed mortgage", fmtPct(res.dbrAfter)],
  ]);

  /* ---------- page 2 — supporting calculation ---------- */
  header(2);
  section("Income Breakdown");
  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M },
    head: [["Source", "Frequency", "Amount", "Eligible %", "Monthly equivalent"]],
    body: inp.incomes.map((r) => [r.source, r.frequency, fmtAED(r.amount), `${r.eligiblePct}%`, fmtAED(incomeMonthly(r))]),
    foot: [["Eligible monthly income", "", "", "", fmtAED(res.eligibleIncome)]],
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 5, textColor: INK },
    headStyles: { fillColor: INK, textColor: [244, 238, 226], fontStyle: "bold" },
    footStyles: { fillColor: [240, 236, 226], textColor: INK, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [249, 247, 242] },
    theme: "plain",
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 16;

  section("Liability Breakdown");
  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M },
    head: [["Liability", "Type", "Limit / Outstanding", "Method", "Assessed EMI"]],
    body: inp.liabilities.length
      ? inp.liabilities.map((r) => [r.name, r.type, fmtAED(r.limitOrOutstanding), r.method, fmtAED(liabilityEmi(r))])
      : [["No liabilities declared", "", "", "", ""]],
    foot: [["Existing monthly liabilities", "", "", "", fmtAED(res.existingEmis)]],
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 5, textColor: INK },
    headStyles: { fillColor: INK, textColor: [244, 238, 226], fontStyle: "bold" },
    footStyles: { fillColor: [240, 236, 226], textColor: INK, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [249, 247, 242] },
    theme: "plain",
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 16;

  section("Rate, Stress & Tenor");
  y = kv([
    ["Rate basis", `${fmtPct(res.actualRate)} actual + ${res.loadFactor.toFixed(2)}% load = ${fmtPct(res.assessmentRate)} assessment`],
    ["Age calculation", `${res.ageNowYears}y current + ${inp.marginMonths}m margin → final age ${inp.finalAge} → ${tenorLabel(res.remainingMonths)} available`],
    ["Tenor used", tenorLabel(res.maxTenorMonths)],
  ]);
  y += 8;

  section("Calculation Trail");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...INK);
  for (const line of res.trail) {
    const wrapped = doc.splitTextToSize(line, W - 2 * M) as string[];
    for (const w of wrapped) {
      doc.text(w, M + 6, y);
      y += 13;
    }
  }

  /* ---------- page 3 — what-if ---------- */
  header(3);
  for (const s of scenarios) {
    section(s.title);
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M },
      head: [s.head],
      body: s.body,
      styles: { font: "helvetica", fontSize: 8.5, cellPadding: 5, textColor: INK },
      headStyles: { fillColor: INK, textColor: [244, 238, 226], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [249, 247, 242] },
      theme: "plain",
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 14;
    if (y > 720) {
      doc.addPage();
      header(doc.getNumberOfPages());
    }
  }
  y += 6;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.setTextColor(...FAINT);
  doc.text(
    "Prepared with the HFMC eligibility calculator. Figures are indicative, based on inputs provided and current CBUAE-style DBR/LTV limits; final eligibility is at the sole discretion of the lender.",
    M, y, { maxWidth: W - 2 * M }
  );
  y += 26;
  doc.setFont("helvetica", "normal");
  doc.text(`Prepared by: ${preparedBy}`, M, y);

  const safeName = (inp.name || "applicant").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  doc.save(`HFMC-eligibility-${safeName}.pdf`);
}
