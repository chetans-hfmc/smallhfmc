/* Affordability engine — LTV + DBR + EMI + age/tenure caps in one answer.
   Pure functions; the store persists every run for audit. */

export interface CalcInput {
  monthlyIncome: number;
  otherIncome: number;
  existingEmis: number;
  age: number;
  employmentType: "Salaried" | "Self-Employed";
  propertyValue: number;
  bank: string;
  interestRate: number | null; // null → fall back to bank desk rate
  tenureYears: number | null; // null → 25, capped by age
}

export interface CalcResult {
  applicableLtv: number;
  maxLoanByLtv: number;
  maxDbrPct: number;
  availableDbrEmi: number;
  maxLoanByDbr: number;
  maxTenureByAge: number;
  tenureUsed: number;
  rateUsed: number;
  finalEligibleLoan: number;
  estimatedEmi: number;
  eligible: boolean;
  binding: "LTV" | "DBR" | "NONE";
}

export const BANK_RATES: Record<string, number> = {
  HDFC: 8.35,
  ICICI: 8.4,
  SBI: 8.3,
  Axis: 8.5,
  Kotak: 8.55,
  "LIC HFL": 8.45,
  "PNB HFL": 8.6,
  "Bajaj Finserv": 8.75,
};
export const DEFAULT_RATE = 8.5;

const DBR_CAP = 50; // % of gross monthly income
const RETIREMENT: Record<CalcInput["employmentType"], number> = { Salaried: 60, "Self-Employed": 65 };
const MIN_TICKET = 500000; // ₹5L

export function ltvFor(propertyValue: number): number {
  if (propertyValue <= 7500000) return 80;
  if (propertyValue <= 15000000) return 75;
  return 70;
}

const round1k = (n: number) => Math.max(0, Math.round(n / 1000) * 1000);

export function computeAffordability(input: CalcInput): CalcResult {
  const gross = Math.max(0, input.monthlyIncome) + Math.max(0, input.otherIncome);
  const applicableLtv = ltvFor(input.propertyValue);
  const maxLoanByLtv = round1k((input.propertyValue * applicableLtv) / 100);

  const availableDbrEmi = (gross * DBR_CAP) / 100 - Math.max(0, input.existingEmis);

  const maxTenureByAge = RETIREMENT[input.employmentType] - input.age;
  const requested = input.tenureYears ?? 25;
  const tenureUsed = Math.max(1, Math.min(requested, Math.min(maxTenureByAge, 30)));

  const rateUsed = input.interestRate ?? BANK_RATES[input.bank] ?? DEFAULT_RATE;
  const r = rateUsed / 1200;
  const n = tenureUsed * 12;
  const pow = Math.pow(1 + r, n);
  const annuity = r > 0 ? (pow - 1) / (r * pow) : n; // present-value factor

  const maxLoanByDbr = availableDbrEmi > 0 ? round1k(availableDbrEmi * annuity) : 0;

  let finalEligibleLoan = 0;
  let binding: CalcResult["binding"] = "NONE";
  if (availableDbrEmi > 0 && maxTenureByAge >= 5) {
    finalEligibleLoan = Math.min(maxLoanByLtv, maxLoanByDbr);
    binding = maxLoanByDbr <= maxLoanByLtv ? "DBR" : "LTV";
  }

  const eligible = finalEligibleLoan >= MIN_TICKET;
  const estimatedEmi = finalEligibleLoan > 0 ? Math.round(finalEligibleLoan / annuity) : 0;

  return {
    applicableLtv,
    maxLoanByLtv,
    maxDbrPct: DBR_CAP,
    availableDbrEmi: Math.round(availableDbrEmi),
    maxLoanByDbr,
    maxTenureByAge,
    tenureUsed,
    rateUsed,
    finalEligibleLoan,
    estimatedEmi,
    eligible,
    binding,
  };
}

export function defaultRateFor(bank: string): number {
  return BANK_RATES[bank] ?? DEFAULT_RATE;
}
