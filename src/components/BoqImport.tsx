import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import { round2, computeAmount, inr } from '../lib/boq'

type ParsedRow = {
  item_code: string | null; description: string; unit: string | null
  quantity: number; rate: number; category: string | null; amount: number
}

// Accepts flexible header names (case-insensitive) so minor variations still work.
const HEADER_ALIASES: Record<string, string> = {
  'item code': 'item_code', 'code': 'item_code', 'sl no': 'item_code', 'sl. no': 'item_code', 'sr no': 'item_code',
  'description': 'description', 'item description': 'description', 'particulars': 'description',
  'unit': 'unit', 'units': 'unit', 'uom': 'unit',
  'quantity': 'quantity', 'qty': 'quantity',
  'rate': 'rate', 'estimated rate': 'rate', 'rate in rs': 'rate', 'estimated rate in rs': 'rate',
  'category': 'category', 'schedule': 'category',
}

function normHeader(h: string): string | null {
  const key = String(h ?? '').trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.:]/g, '').trim()
  return HEADER_ALIASES[key] ?? null
}
function toNum(v: unknown): number {
  if (typeof v === 'number') return isFinite(v) ? v : 0
  const n = parseFloat(String(v ?? '').replace(/,/g, '').trim())
  return isFinite(n) ? n : 0
}

export default function BoqImport({ boqId, onClose, onImported }: { boqId: string; onClose: () => void; onImported: () => void }) {
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [skipped, setSkipped] = useState(0)
  const [fileName, setFileName] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  function handleFile(f: File) {
    setErr(null); setRows([]); setSkipped(0); setFileName(f.name)
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const matrix: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false })
        if (!matrix.length) { setErr('The sheet appears to be empty.'); return }

        // find the header row: the first row where we can map at least description + quantity + rate
        let headerIdx = -1, colMap: Record<number, string> = {}
        for (let i = 0; i < Math.min(matrix.length, 15); i++) {
          const map: Record<number, string> = {}
          matrix[i].forEach((cell, ci) => { const m = normHeader(String(cell)); if (m) map[ci] = m })
          const fields = Object.values(map)
          if (fields.includes('description') && fields.includes('quantity') && fields.includes('rate')) {
            headerIdx = i; colMap = map; break
          }
        }
        if (headerIdx === -1) {
          setErr('Could not find the header row. Make sure row 1 has: Item Code, Description, Unit, Quantity, Rate, Category.')
          return
        }

        const parsed: ParsedRow[] = []
        let skip = 0
        for (let i = headerIdx + 1; i < matrix.length; i++) {
          const r = matrix[i]
          const get = (field: string) => {
            const ci = Object.keys(colMap).find(k => colMap[Number(k)] === field)
            return ci !== undefined ? r[Number(ci)] : undefined
          }
          const description = String(get('description') ?? '').trim()
          const quantity = toNum(get('quantity'))
          const rate = toNum(get('rate'))
          // skip rows without a real priced line (headers, blanks, sub-totals)
          if (!description || quantity <= 0 || rate <= 0) { if (description || quantity || rate) skip++; continue }
          parsed.push({
            item_code: (String(get('item_code') ?? '').trim() || null),
            description, unit: (String(get('unit') ?? '').trim() || null),
            quantity: round2(quantity), rate: round2(rate),
            category: (String(get('category') ?? '').trim() || null),
            amount: computeAmount(quantity, rate),
          })
        }
        if (!parsed.length) { setErr('No valid line items found (rows need Description + Quantity + Rate).'); return }
        setRows(parsed); setSkipped(skip)
      } catch (ex) {
        setErr('Could not read the file. Make sure it is a valid .xlsx file. ' + String(ex))
      }
    }
    reader.readAsArrayBuffer(f)
  }

  const total = round2(rows.reduce((n, r) => n + r.amount, 0))

  async function importAll() {
    setBusy(true); setErr(null)
    const { data: prof } = await supabase.from('profiles').select('org_id').single()
    const payload = rows.map((r, idx) => ({
      org_id: prof?.org_id, boq_id: boqId, sort_order: idx,
      item_code: r.item_code, category: r.category, description: r.description,
      unit: r.unit, quantity: r.quantity,
      material_rate: 0, labour_rate: 0, equipment_rate: 0,
      overhead_pct: 0, profit_pct: 0, tax_pct: 0,
      final_rate: r.rate, amount: r.amount,
    }))
    // insert in chunks of 100 (large BOQs)
    for (let i = 0; i < payload.length; i += 100) {
      const chunk = payload.slice(i, i + 100)
      const { error } = await supabase.from('boq_items').insert(chunk)
      if (error) { setErr(`Import failed at row ${i + 1}: ${error.message}`); setBusy(false); return }
    }
    setBusy(false); onImported()
  }

  return createPortal((
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6 bg-black/70 backdrop-blur-sm overflow-y-auto" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-[#1B1F2A] border border-white/[0.08] rounded-2xl w-full max-w-3xl my-auto shadow-[0px_10px_30px_rgba(0,0,0,0.5)] flex flex-col max-h-[90vh]">
        <div className="p-5 border-b border-white/5 flex items-center justify-between flex-shrink-0">
          <div>
            <h3 className="font-headline text-xl font-semibold text-[#e2e2e8]">Import BOQ from Excel</h3>
            <p className="text-[11px] text-[#dcc1ae]/70 mt-0.5">Columns needed (row 1): Item Code · Description · Unit · Quantity · Rate · Category</p>
          </div>
          <button className="text-[#dcc1ae] hover:text-white" onClick={onClose}><span className="material-symbols-outlined">close</span></button>
        </div>

        <div className="p-5 overflow-y-auto">
          {!rows.length && (
            <div className="text-center py-8">
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
              <button className="btn btn-primary" onClick={() => fileRef.current?.click()}>
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>upload_file</span> Choose Excel File
              </button>
              <p className="text-[12px] text-[#dcc1ae]/60 mt-3">Rows without a Quantity and Rate (section headers, blanks) are skipped automatically.<br/>Amount is recomputed as Quantity × Rate for accuracy.</p>
            </div>
          )}

          {err && <div className="text-sm text-red-400 mb-3 p-3 rounded-lg bg-red-500/5 border border-red-500/10">{err}</div>}

          {rows.length > 0 && (
            <>
              <div className="flex items-center justify-between mb-3">
                <div className="text-[13px] text-[#dcc1ae]">
                  <span className="font-semibold text-[#e2e2e8]">{rows.length}</span> items found in <span className="font-mono">{fileName}</span>
                  {skipped > 0 && <span className="text-[#dcc1ae]/60"> · {skipped} rows skipped</span>}
                </div>
                <div className="text-[13px] text-[#dcc1ae]">Total: <span className="font-mono font-bold text-[#e2e2e8]">{inr(total)}</span></div>
              </div>
              <div className="overflow-x-auto rounded-lg border border-white/[0.05] max-h-[45vh]">
                <table className="w-full text-[12px]">
                  <thead className="bg-[#282a2e] sticky top-0"><tr>
                    {['Code', 'Description', 'Unit', 'Qty', 'Rate', 'Amount'].map(h => <th key={h} className="px-3 py-2 text-left font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>)}
                  </tr></thead>
                  <tbody className="divide-y divide-white/[0.05]">
                    {rows.slice(0, 200).map((r, i) => (
                      <tr key={i}>
                        <td className="px-3 py-1.5 font-mono text-[#dcc1ae]">{r.item_code || '—'}</td>
                        <td className="px-3 py-1.5 text-[#e2e2e8] max-w-[280px] truncate" title={r.description}>{r.description}</td>
                        <td className="px-3 py-1.5 text-[#dcc1ae]">{r.unit || '—'}</td>
                        <td className="px-3 py-1.5 font-mono text-[#dcc1ae] text-right">{r.quantity}</td>
                        <td className="px-3 py-1.5 font-mono text-[#dcc1ae] text-right">{r.rate}</td>
                        <td className="px-3 py-1.5 font-mono text-[#e2e2e8] text-right">{Number(r.amount).toLocaleString('en-IN')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length > 200 && <div className="p-2 text-center text-[11px] text-[#dcc1ae]/50">Showing first 200 of {rows.length} — all will be imported.</div>}
              </div>
            </>
          )}
        </div>

        <div className="p-5 pt-3 flex gap-3 border-t border-white/5 flex-shrink-0">
          <button className="btn btn-ghost flex-1" onClick={onClose}>Cancel</button>
          {rows.length > 0
            ? <button className="btn btn-primary flex-[2]" disabled={busy} onClick={importAll}>{busy ? 'Importing…' : `Import ${rows.length} Items`}</button>
            : <button className="btn btn-ghost flex-[2]" onClick={() => fileRef.current?.click()}>Choose a different file</button>}
        </div>
      </div>
    </div>
  ), document.body)
}