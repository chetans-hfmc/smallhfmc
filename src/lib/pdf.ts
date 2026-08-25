import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { MortgageInput, MortgageResult } from "./mortgage";
import { fmtAED, fmtPct, incomeMonthly, liabilityEmi, tenorLabel } from "./mortgage";

/* palette */
const INK: [number, number, number] = [23, 32, 36];
const BODY: [number, number, number] = [44, 52, 56];
const FAINT: [number, number, number] = [120, 128, 130];
const AMBER: [number, number, number] = [168, 110, 26];
const AMBER_BRIGHT: [number, number, number] = [242, 176, 76];
const LINE: [number, number, number] = [222, 216, 202];
const PAPER: [number, number, number] = [250, 248, 243];

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
  const W = 595.28;
  const H = 841.89;
  const M = 44;
  const CW = W - 2 * M;
  let y = 0;

  /* ---------- chrome ---------- */

  const drawHeader = () => {
    doc.setFillColor(...INK);
    doc.rect(0, 0, W, 64, "F");
    doc.setFillColor(...AMBER_BRIGHT);
    doc.rect(0, 64, W, 2.5, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(244, 238, 226);
    doc.text("HFMC — Mortgage Eligibility Assessment", M, 29);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(168, 166, 158);
    doc.text("Preliminary assessment · not a bank approval or binding offer", M, 45);
    doc.text(
      new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" }),
      W - M, 45, { align: "right" }
    );
    y = 88;
  };

  const drawFooter = () => {
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.6);
    doc.line(M, H - 38, W - M, H - 38);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...FAINT);
    doc.text("HFMC Mortgage Calculator · indicative figures only · final eligibility at lender's discretion", M, H - 26);
  };

  const newPage = () => {
    doc.addPage();
    drawHeader();
  };

  const ensure = (h: number) => {
    if (y + h > H - 70) newPage();
  };

  const sectionTitle = (t: string) => {
    ensure(36);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(...AMBER);
    doc.text(t.toUpperCase(), M, y);
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.7);
    doc.line(M, y + 5, W - M, y + 5);
    y += 17;
  };

  /* ---------- table primitive ---------- */

  const table = (opts: {
    head?: (string | number)[][];
    body: (string | number)[][];
    foot?: (string | number)[][];
    rightFrom?: number; // right-align + bold numeric columns from this index
    colWidths?: Record<number, number>;
  }) => {
    ensure(30);
    const pageAtStart = doc.getNumberOfPages();
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M, top: 86, bottom: 64 },
      head: opts.head,
      body: opts.body,
      foot: opts.foot,
      styles: { font: "helvetica", fontSize: 8.8, cellPadding: 5.5, textColor: BODY, lineColor: LINE, lineWidth: 0.5 },
      headStyles: { fillColor: INK, textColor: [244, 238, 226], fontStyle: "bold", fontSize: 8, halign: "left" },
      footStyles: { fillColor: PAPER, textColor: INK, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [251, 249, 245] },
      columnStyles: {
        ...(opts.colWidths ?? {}),
        ...(opts.rightFrom != null
          ? Object.fromEntries(
              Array.from({ length: (opts.head?.[0]?.length ?? opts.body[0]?.length ?? 0) - opts.rightFrom }, (_, i) => [
                opts.rightFrom! + i,
                { halign: "right" as const, fontStyle: "bold" as const, textColor: INK },
              ])
            )
          : {}),
      },
      theme: "grid",
      didDrawPage: (data) => {
        // continuation pages created by a long table need the document header
        if (doc.getNumberOfPages() > pageAtStart && data.pageNumber > 1) drawHeader();
      },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 16;
  };

  /* ---------- key/value rows ---------- */

  const kvTable = (rows: [string, string][]) =>
    table({
      body: rows,
      colWidths: { 0: 205 },
      rightFrom: 1,
    });

  /* ================= PAGE 1 — eligibility summary ================= */

  drawHeader();

  sectionTitle("Applicant & Property");
  kvTable([
    ["Applicant", inp.name || "—"],
    ["Applicant type", `${inp.applicantType}  ·  ${inp.employment}`],
    ["Property value", fmtAED(inp.propertyValue)],
    ["Bank valuation", inp.valuation ? fmtAED(inp.valuation) : "Not available"],
    ["Calculation basis", `${fmtAED(res.calcBasis)}  (${res.basisLabel})`],
    ["Requested finance", inp.requested > 0 ? fmtAED(inp.requested) : "—"],
  ]);

  sectionTitle("Eligibility Summary");
  kvTable([
    ["Eligible monthly income", fmtAED(res.eligibleIncome)],
    ["Existing monthly liabilities", fmtAED(res.existingEmis)],
    ["Current DBR", fmtPct(res.currentDbr)],
    ["Maximum DBR (CBUAE)", fmtPct(res.maxDbr)],
    ["Residual DBR", fmtPct(res.residualDbr)],
  ]);

  sectionTitle("Loan Parameters");
  kvTable([
    ["Actual / contract rate", fmtPct(res.actualRate)],
    ["Stress load factor", `+ ${res.loadFactor.toFixed(2)}%`],
    ["Assessment rate", fmtPct(res.assessmentRate)],
    ["Current age", `${res.ageNowYears} years`],
    ["Age processing margin", `${inp.marginMonths} months`],
    ["Maximum tenor used", tenorLabel(res.maxTenorMonths)],
  ]);

  sectionTitle("MPBF — Eligibility Tests");
  const mpbfBody: (string | number)[][] = [
    ["DBR / Residual DBR MPBF", fmtAED(res.dbrMpbf)],
    [`LTV MPBF  (${fmtAED(res.calcBasis)} × ${res.ltvPct}%)`, fmtAED(res.ltvMpbf)],
  ];
  if (res.multiplierCap != null) mpbfBody.push(["Income multiplier cap", fmtAED(res.multiplierCap)]);
  if (res.requested > 0) mpbfBody.push(["Requested finance", fmtAED(res.requested)]);
  table({ head: [["Eligibility test", "Maximum finance"]], body: mpbfBody, rightFrom: 1 });

  /* final MPBF banner */
  ensure(86);
  doc.setFillColor(...INK);
  doc.roundedRect(M, y, CW, 44, 3, 3, "F");
  doc.setFillColor(...AMBER_BRIGHT);
  doc.rect(M, y, 4, 44, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(244, 238, 226);
  doc.text("FINAL MPBF", M + 16, y + 27);
  doc.setFontSize(14.5);
  doc.setTextColor(...AMBER_BRIGHT);
  doc.text(fmtAED(res.finalMpbf), W - M - 16, y + 27, { align: "right" });
  y += 58;

  kvTable([
    ["Limited by", res.limitedBy],
    ["Required down payment", fmtAED(res.downPayment)],
    ["Actual LTV", fmtPct(res.actualLtv)],
    ["Proposed mortgage EMI (actual rate)", `${fmtAED(res.newEmi)} / month`],
    ["DBR after proposed mortgage", fmtPct(res.dbrAfter)],
  ]);

  /* ================= PAGE 2 — supporting calculation ================= */

  newPage();

  sectionTitle("Income Breakdown");
  table({
    head: [["Source", "Frequency", "Amount", "Eligible %", "Monthly equivalent"]],
    body: inp.incomes.length
      ? inp.incomes.map((r) => [r.source, r.frequency, fmtAED(r.amount), `${r.eligiblePct}%`, fmtAED(incomeMonthly(r))])
      : [["No income entered", "", "", "", ""]],
    foot: [["Eligible monthly income", "", "", "", fmtAED(res.eligibleIncome)]],
    rightFrom: 2,
    colWidths: { 0: 150, 1: 78, 3: 62 },
  });

  sectionTitle("Liability Breakdown");
  table({
    head: [["Liability", "Type", "Limit / Outstanding", "Method", "Assessed EMI"]],
    body: inp.liabilities.length
      ? inp.liabilities.map((r) => [r.name, r.type, fmtAED(r.limitOrOutstanding), r.method, fmtAED(liabilityEmi(r))])
      : [["No liabilities declared", "", "", "", fmtAED(0)]],
    foot: [["Existing monthly liabilities", "", "", "", fmtAED(res.existingEmis)]],
    rightFrom: 2,
    colWidths: { 0: 140, 1: 92, 3: 96 },
  });

  sectionTitle("Rate, Stress & Tenor");
  kvTable([
    ["Assessment basis", `${fmtPct(res.actualRate)} actual  +  ${res.loadFactor.toFixed(2)}% load  =  ${fmtPct(res.assessmentRate)} assessment`],
    [
      "Age calculation",
      `${res.ageNowYears}y now  +  ${inp.marginMonths}m margin  →  final age ${inp.finalAge}  →  ${tenorLabel(res.remainingMonths)} available`,
    ],
    ["Tenor used", `${tenorLabel(res.maxTenorMonths)}${inp.tenorOverrideMonths ? " (manual override)" : " (age-constrained)"}`],
    ["LTV applied", `${res.ltvPct}% — ${inp.applicantType}${res.calcBasis > 5000000 ? ", property above AED 5M band" : ", property up to AED 5M band"}`],
  ]);

  sectionTitle("Calculation Trail");
  ensure(res.trail.length * 14 + 26);
  doc.setFont("courier", "normal");
  doc.setFontSize(8.2);
  const wrapped: string[] = [];
  for (const line of res.trail) wrapped.push(...(doc.splitTextToSize(line, CW - 26) as string[]));
  const boxH = wrapped.length * 12 + 18;
  ensure(boxH + 10);
  doc.setFillColor(246, 243, 235);
  doc.setDrawColor(...LINE);
  doc.roundedRect(M, y, CW, boxH, 3, 3, "FD");
  doc.setTextColor(...BODY);
  wrapped.forEach((ln, i) => doc.text(ln, M + 13, y + 16 + i * 12));
  y += boxH + 16;

  /* ================= PAGE 3+ — what-if analysis ================= */

  newPage();
  for (const s of scenarios) {
    sectionTitle(s.title);
    table({
      head: [s.head],
      body: s.body,
      rightFrom: 1,
      colWidths: { 0: 170 },
    });
    y += 2;
  }

  ensure(70);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(7.8);
  doc.setTextColor(...FAINT);
  const disc = doc.splitTextToSize(
    "These figures are indicative and based solely on the inputs provided, CBUAE-style DBR/LTV limits and the lender age policy selected. They do not constitute a bank approval, sanction or binding offer. Final eligibility, pricing and tenor are at the sole discretion of the lender.",
    CW
  ) as string[];
  disc.forEach((ln) => {
    doc.text(ln, M, y);
    y += 10.5;
  });
  y += 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...INK);
  doc.text(`Prepared by: ${preparedBy}`, M, y);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...FAINT);
  doc.text(new Date().toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }), W - M, y, { align: "right" });

  /* ---------- footers on every page ---------- */
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i += 1) {
    doc.setPage(i);
    drawFooter();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...FAINT);
    doc.text(`Page ${i} of ${pages}`, W - M, H - 26, { align: "right" });
  }

  const safeName = (inp.name || "applicant").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  doc.save(`HFMC-eligibility-${safeName}.pdf`);
}
