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