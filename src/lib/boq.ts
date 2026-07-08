// ============================================================
// BOQ rate build-up — exact, documented, 2-decimal currency math.
// Rate build-up (per unit):
//   base      = material + labour + equipment           (direct cost)
//   overhead  = base × overhead% / 100
//   profit    = (base + overhead) × profit% / 100
//   subtotal  = base + overhead + profit
//   tax       = subtotal × tax% / 100
//   finalRate = subtotal + tax                           (rounded 2dp)
//   amount    = quantity × finalRate                     (rounded 2dp)
// ============================================================

export type RateInputs = {
  material_rate: number
  labour_rate: number
  equipment_rate: number
  overhead_pct: number
  profit_pct: number
  tax_pct: number
}

// Round to 2 decimals safely (values well within JS safe-integer range).
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

export function computeFinalRate(r: RateInputs): number {
  const base = num(r.material_rate) + num(r.labour_rate) + num(r.equipment_rate)
  const overhead = base * num(r.overhead_pct) / 100
  const profit = (base + overhead) * num(r.profit_pct) / 100
  const subtotal = base + overhead + profit
  const tax = subtotal * num(r.tax_pct) / 100
  return round2(subtotal + tax)
}

export function computeAmount(quantity: number, finalRate: number): number {
  return round2(num(quantity) * num(finalRate))
}

export function breakdown(r: RateInputs) {
  const base = num(r.material_rate) + num(r.labour_rate) + num(r.equipment_rate)
  const overhead = round2(base * num(r.overhead_pct) / 100)
  const profit = round2((base + overhead) * num(r.profit_pct) / 100)
  const subtotal = round2(base + overhead + profit)
  const tax = round2(subtotal * num(r.tax_pct) / 100)
  const finalRate = round2(subtotal + tax)
  return { base: round2(base), overhead, profit, subtotal, tax, finalRate }
}

export function inr(n: number): string {
  return '₹' + round2(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''))
  return isFinite(n) ? n : 0
}

// ---- Measurement take-off (TDS) ----
// Line quantity = nos × (each non-blank dimension). Blank/0 dims are skipped
// (treated as 1), so one sheet flexes to count / length / area / volume.
export function lineQty(nos: number, length: number, width: number, height: number): number {
  const n = nos && nos > 0 ? nos : 1
  let q = n
  for (const d of [length, width, height]) {
    if (d && d > 0) q *= d
  }
  return round2(q)
}

// Sheet total with optional waste %.
export function sheetTotal(lines: { nos: number; length: number; width: number; height: number }[], wastePct = 0): number {
  const sub = lines.reduce((sum, l) => sum + lineQty(l.nos, l.length, l.width, l.height), 0)
  return round2(sub * (1 + (wastePct || 0) / 100))
}

// ---- Bid Adjustment (government / e-tender BOQ) ----
export type BidType = 'less' | 'excess'

// Quoted Rate = BOQ Total × factor, where factor is (100−p)/100 for LESS, (100+p)/100 for EXCESS.
// Percentage 0 => At Par (factor 1). Returns null for invalid input (negative / non-numeric).
export function quotedRate(boqTotal: number, type: BidType, pct: number): number | null {
  const total = Number(boqTotal)
  const p = Number(pct)
  if (!isFinite(total) || !isFinite(p) || p < 0) return null
  const factor = p === 0 ? 1 : type === 'less' ? (100 - p) / 100 : (100 + p) / 100
  return round2(total * factor)
}

// Amount to Indian-numbering words (Crore / Lakh / Thousand), with paise.
export function amountInWords(num: number): string {
  const n = round2(num)
  const rupees = Math.floor(n)
  const paise = Math.round((n - rupees) * 100)
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']
  const two = (x: number) => x < 20 ? ones[x] : tens[Math.floor(x / 10)] + (x % 10 ? ' ' + ones[x % 10] : '')
  const three = (x: number) => (Math.floor(x / 100) ? ones[Math.floor(x / 100)] + ' Hundred' + (x % 100 ? ' ' : '') : '') + (x % 100 ? two(x % 100) : '')
  function toWords(x: number): string {
    if (x === 0) return 'Zero'
    let str = ''
    const crore = Math.floor(x / 10000000); x %= 10000000
    const lakh = Math.floor(x / 100000); x %= 100000
    const thousand = Math.floor(x / 1000); x %= 1000
    if (crore) str += three(crore) + ' Crore '
    if (lakh) str += two(lakh) + ' Lakh '
    if (thousand) str += two(thousand) + ' Thousand '
    if (x) str += three(x)
    return str.trim()
  }
  let w = 'INR ' + toWords(rupees)
  if (paise > 0) w += ' and ' + two(paise) + ' Paise'
  return w + ' Only'
}