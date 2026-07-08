import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'

type ParsedRow = {
  date: string; expense_type: string; amount: number
  vendor: string | null; payment_status: string; paid_by: string | null; remark: string | null
}

const TYPES = ['Salary', 'Repair', 'Fooding', 'Material', 'Fuel', 'Transport', 'Other']

function norm(s: unknown) { return String(s ?? '').trim().toLowerCase() }
function toNum(v: unknown): number {
  if (typeof v === 'number') return isFinite(v) ? v : 0
  const n = parseFloat(String(v ?? '').replace(/[₹,]/g, '').trim())
  return isFinite(n) ? n : 0
}
// Excel serial date or text → yyyy-mm-dd
function toDate(v: unknown): string {
  if (v == null || v === '') return new Date().toISOString().slice(0, 10)
  if (typeof v === 'number') {
    // Excel serial (days since 1899-12-30)
    const d = new Date(Math.round((v - 25569) * 86400 * 1000))
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  }
  const s = String(v).trim()
  // try dd/mm/yyyy or dd-mm-yyyy
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/)
  if (m) {
    let [, dd, mm, yy] = m
    if (yy.length === 2) yy = '20' + yy
    return `${yy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`
  }
  const d = new Date(s)
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  return new Date().toISOString().slice(0, 10)
}
function matchType(v: unknown): string {
  const t = norm(v)
  const found = TYPES.find(x => norm(x) === t)
  return found || (t ? String(v).trim() : 'Other')
}
function matchStatus(v: unknown): string {
  return norm(v).includes('credit') ? 'Credit' : 'Paid'
}

export default function ExpenseImport({ projectId, onClose, onImported }: { projectId: string; onClose: () => void; onImported: () => void }) {
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [skipped, setSkipped] = useState(0)
  const [fileName, setFileName] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  function downloadTemplate() {
    const sample = [
      { Date: '01/07/2026', Type: 'Material', Amount: 15000, Vendor: 'ABC Traders', 'Payment Status': 'Paid', 'Paid By': 'Ramesh', Remark: 'Cement bags' },
      { Date: '02/07/2026', Type: 'Fuel', Amount: 3000, Vendor: 'HP Pump', 'Payment Status': 'Credit', 'Paid By': '', Remark: 'Diesel' },
    ]
    const ws = XLSX.utils.json_to_sheet(sample)
    ws['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 30 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Expenses')
    XLSX.writeFile(wb, 'expenses_import_template.xlsx')
  }

  function handleFile(f: File) {
    setErr(null); setRows([]); setSkipped(0); setFileName(f.name)
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target?.result as ArrayBuffer), { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const raw: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, { defval: '' })
        if (!raw.length) { setErr('Sheet khaali hai.'); return }

        const keys = Object.keys(raw[0])
        const findKey = (...names: string[]) => keys.find(k => names.some(n => norm(k).includes(n)))
        const dateK = findKey('date', 'dinank', 'tareekh')
        const typeK = findKey('type', 'head', 'category', 'expense')
        const amtK = findKey('amount', 'rs', 'rupee', 'value', 'total')
        const venK = findKey('vendor', 'party', 'supplier', 'shop')
        const statusK = findKey('payment status', 'status', 'paid/credit')
        const paidByK = findKey('paid by', 'paidby', 'person', 'by')
        const remK = findKey('remark', 'note', 'description', 'detail')
        if (!amtK) { setErr('"Amount" column nahi mila. Template dekhein — Date, Type, Amount, Vendor, Payment Status, Paid By, Remark.'); return }

        const parsed: ParsedRow[] = []
        let skip = 0
        for (const r of raw) {
          const amount = toNum(r[amtK])
          if (amount <= 0) { if (Object.values(r).some(v => String(v ?? '').trim())) skip++; continue }
          const status = statusK ? matchStatus(r[statusK]) : 'Paid'
          parsed.push({
            date: dateK ? toDate(r[dateK]) : new Date().toISOString().slice(0, 10),
            expense_type: typeK ? matchType(r[typeK]) : 'Other',
            amount,
            vendor: venK && String(r[venK] ?? '').trim() ? String(r[venK]).trim() : null,
            payment_status: status,
            paid_by: status === 'Paid' && paidByK && String(r[paidByK] ?? '').trim() ? String(r[paidByK]).trim() : null,
            remark: remK && String(r[remK] ?? '').trim() ? String(r[remK]).trim() : null,
          })
        }
        if (!parsed.length) { setErr('Koi valid expense nahi mila (har row mein Amount > 0 chahiye).'); return }
        setRows(parsed); setSkipped(skip)
      } catch (ex) {
        setErr('File padh nahi paaye. Valid .xlsx file upload karein. ' + String(ex))
      }
    }
    reader.readAsArrayBuffer(f)
  }

  const total = rows.reduce((n, r) => n + r.amount, 0)

  async function importAll() {
    setBusy(true); setErr(null)
    const { data: prof } = await supabase.from('profiles').select('org_id').single()
    const payload = rows.map(r => ({ org_id: prof?.org_id, project_id: projectId, ...r, bill_photo: null }))
    for (let i = 0; i < payload.length; i += 100) {
      const chunk = payload.slice(i, i + 100)
      const { error } = await supabase.from('expenses').insert(chunk)
      if (error) { setErr(`Import fail (row ${i + 1}): ${error.message}`); setBusy(false); return }
    }
    setBusy(false); onImported()
  }

  return createPortal((
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6 bg-black/70 backdrop-blur-sm overflow-y-auto" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-[#1B1F2A] border border-white/[0.08] rounded-2xl w-full max-w-3xl my-auto shadow-[0px_10px_30px_rgba(0,0,0,0.5)] flex flex-col max-h-[90vh]">
        <div className="p-5 border-b border-white/5 flex items-center justify-between flex-shrink-0">
          <div>
            <h3 className="font-headline text-xl font-semibold text-[#e2e2e8]">Import Expenses from Excel</h3>
            <p className="text-[11px] text-[#dcc1ae]/70 mt-0.5">Columns: Date · Type · Amount · Vendor · Payment Status · Paid By · Remark</p>
          </div>
          <button className="text-[#dcc1ae] hover:text-white" onClick={onClose}><span className="material-symbols-outlined">close</span></button>
        </div>

        <div className="p-5 overflow-y-auto">
          {!rows.length && (
            <div className="text-center py-8">
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
              <div className="flex items-center justify-center gap-2">
                <button className="btn btn-ghost" onClick={downloadTemplate}>
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>download</span> Template
                </button>
                <button className="btn btn-primary" onClick={() => fileRef.current?.click()}>
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>upload_file</span> Choose Excel File
                </button>
              </div>
              <p className="text-[12px] text-[#dcc1ae]/60 mt-3">Amount ke bina rows automatically skip ho jayengi. Date dd/mm/yyyy ya Excel date, dono chalti hain.</p>
            </div>
          )}

          {err && <div className="text-sm text-red-400 mb-3 p-3 rounded-lg bg-red-500/5 border border-red-500/10">{err}</div>}

          {rows.length > 0 && (
            <>
              <div className="flex items-center justify-between mb-3">
                <div className="text-[13px] text-[#dcc1ae]">
                  <span className="font-semibold text-[#e2e2e8]">{rows.length}</span> expenses · <span className="font-mono">{fileName}</span>
                  {skipped > 0 && <span className="text-[#dcc1ae]/60"> · {skipped} skipped</span>}
                </div>
                <div className="text-[13px] text-[#dcc1ae]">Total: <span className="font-mono font-bold text-[#e2e2e8]">₹{total.toLocaleString('en-IN')}</span></div>
              </div>
              <div className="overflow-x-auto rounded-lg border border-white/[0.05] max-h-[45vh]">
                <table className="w-full text-[12px]">
                  <thead className="bg-[#282a2e] sticky top-0"><tr>
                    {['Date', 'Type', 'Amount', 'Vendor', 'Status', 'Paid By', 'Remark'].map(h => <th key={h} className="px-3 py-2 text-left font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>)}
                  </tr></thead>
                  <tbody className="divide-y divide-white/[0.05]">
                    {rows.slice(0, 200).map((r, i) => (
                      <tr key={i}>
                        <td className="px-3 py-1.5 font-mono text-[#dcc1ae] whitespace-nowrap">{r.date}</td>
                        <td className="px-3 py-1.5 text-[#e2e2e8]">{r.expense_type}</td>
                        <td className="px-3 py-1.5 font-mono text-[#e2e2e8] text-right">₹{r.amount.toLocaleString('en-IN')}</td>
                        <td className="px-3 py-1.5 text-[#dcc1ae]">{r.vendor || '—'}</td>
                        <td className="px-3 py-1.5">{r.payment_status}</td>
                        <td className="px-3 py-1.5 text-[#dcc1ae]">{r.paid_by || '—'}</td>
                        <td className="px-3 py-1.5 text-[#dcc1ae] max-w-[160px] truncate" title={r.remark || ''}>{r.remark || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length > 200 && <div className="p-2 text-center text-[11px] text-[#dcc1ae]/50">Pehle 200 dikha rahe — sabhi {rows.length} import honge.</div>}
              </div>
            </>
          )}
        </div>

        <div className="p-5 pt-3 flex gap-3 border-t border-white/5 flex-shrink-0">
          <button className="btn btn-ghost flex-1" onClick={onClose}>Cancel</button>
          {rows.length > 0
            ? <button className="btn btn-primary flex-[2]" disabled={busy} onClick={importAll}>{busy ? 'Importing…' : `Import ${rows.length} Expenses`}</button>
            : <button className="btn btn-ghost flex-[2]" onClick={() => fileRef.current?.click()}>Choose file</button>}
        </div>
      </div>
    </div>
  ), document.body)
}