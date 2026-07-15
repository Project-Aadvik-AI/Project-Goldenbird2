import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'

// Reuses the exact parsing approach from ExpenseImport (Excel serial dates,
// fuzzy column matching, chunked insert) — just mapped to labour columns.

type ParsedRow = {
  date: string; worker_name: string; trade: string; skill: string
  gender: string | null; labour_type: string; contractor_name: string | null
  status: string; days_present: number; daily_rate: number; wage: number
  overtime_hours: number; is_night_shift: boolean
  output_qty: number | null; output_unit: string | null; remark: string | null
}

const TRADES = ['Mason', 'Carpenter', 'Bar Bender', 'Electrician', 'Plumber', 'Welder', 'Painter', 'Helper', 'Others']
const SKILLS = ['Skilled', 'Semi-skilled', 'Unskilled', 'Supervisor']
const STATUS_DAYS: Record<string, number> = { 'Present': 1, 'Half Day': 0.5, 'Absent': 0, 'Leave': 0 }

function norm(s: unknown) { return String(s ?? '').trim().toLowerCase() }
function toNum(v: unknown): number {
  if (typeof v === 'number') return isFinite(v) ? v : 0
  const n = parseFloat(String(v ?? '').replace(/[₹,]/g, '').trim())
  return isFinite(n) ? n : 0
}
function toDate(v: unknown): string {
  if (v == null || v === '') return new Date().toISOString().slice(0, 10)
  if (typeof v === 'number') {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000))
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  }
  const s = String(v).trim()
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
function matchOne(v: unknown, list: string[], fallback: string): string {
  const t = norm(v).replace(/\s+/g, '')
  const found = list.find(x => norm(x).replace(/\s+/g, '') === t)
  return found || fallback
}
function matchStatus(v: unknown): string {
  const t = norm(v)
  if (t.includes('half')) return 'Half Day'
  if (t.startsWith('a')) return 'Absent'
  if (t.startsWith('l')) return 'Leave'
  return 'Present'
}
function toBool(v: unknown): boolean {
  const t = norm(v)
  return t === 'yes' || t === 'y' || t === 'true' || t === '1' || t === 'night'
}

export default function LabourImport({ projectId, onClose, onImported }: { projectId: string; onClose: () => void; onImported: () => void }) {
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [skipped, setSkipped] = useState(0)
  const [fileName, setFileName] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  function downloadTemplate() {
    const sample = [
      { Date: '01/07/2026', 'Worker Name': 'Ramesh Kumar', Trade: 'Mason', Skill: 'Skilled', Gender: 'Male', 'Labour Type': 'Contractor', Contractor: 'ABC Contractors', Status: 'Present', 'Days Present': 1, 'Daily Rate': 700, 'Overtime Hours': 2, 'Night Shift': 'No', 'Output Qty': 8, 'Output Unit': 'sqm', Remark: '' },
      { Date: '01/07/2026', 'Worker Name': 'Sita Devi', Trade: 'Helper', Skill: 'Unskilled', Gender: 'Female', 'Labour Type': 'Company', Contractor: '', Status: 'Present', 'Days Present': 1, 'Daily Rate': 450, 'Overtime Hours': 0, 'Night Shift': 'No', 'Output Qty': '', 'Output Unit': '', Remark: '' },
    ]
    const ws = XLSX.utils.json_to_sheet(sample)
    ws['!cols'] = [{ wch: 12 }, { wch: 18 }, { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 12 }, { wch: 16 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 20 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Labour')
    XLSX.writeFile(wb, 'labour_import_template.xlsx')
  }

  function handleFile(f: File) {
    setErr(null); setRows([]); setSkipped(0); setFileName(f.name)
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target?.result as ArrayBuffer), { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const raw: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, { defval: '' })
        if (!raw.length) { setErr('The sheet is empty.'); return }

        const keys = Object.keys(raw[0])
        const findKey = (...names: string[]) => keys.find(k => names.some(n => norm(k).includes(n)))
        const dateK = findKey('date')
        const workerK = findKey('worker', 'name', 'labour', 'mazdoor')
        const tradeK = findKey('trade', 'category')
        const skillK = findKey('skill')
        const genderK = findKey('gender', 'sex')
        const typeK = findKey('labour type', 'type', 'employment')
        const contK = findKey('contractor', 'agency', 'firm')
        const statusK = findKey('status', 'attendance')
        const daysK = findKey('days present', 'days', 'present')
        const rateK = findKey('daily rate', 'rate', 'wage rate')
        const otK = findKey('overtime', 'ot')
        const nightK = findKey('night')
        const outQK = findKey('output qty', 'output quantity', 'qty', 'quantity')
        const outUK = findKey('output unit', 'unit', 'uom')
        const remK = findKey('remark', 'note', 'description')
        if (!workerK) { setErr('No "Worker Name" column found. Download the template to see the expected columns.'); return }

        const parsed: ParsedRow[] = []
        let skip = 0
        for (const r of raw) {
          const worker = String(r[workerK] ?? '').trim()
          if (!worker) { if (Object.values(r).some(v => String(v ?? '').trim())) skip++; continue }
          const status = statusK ? matchStatus(r[statusK]) : 'Present'
          const days = daysK && String(r[daysK] ?? '').trim() ? toNum(r[daysK]) : (STATUS_DAYS[status] ?? 1)
          const rate = rateK ? toNum(r[rateK]) : 0
          const contractor = contK ? String(r[contK] ?? '').trim() : ''
          const type = contractor ? 'Contractor' : (typeK ? matchOne(r[typeK], ['Company', 'Contractor'], 'Company') : 'Company')
          const gender = genderK ? matchOne(r[genderK], ['Male', 'Female'], '') : ''
          const outQ = outQK && String(r[outQK] ?? '').trim() ? toNum(r[outQK]) : null
          const outU = outUK ? String(r[outUK] ?? '').trim() : ''
          parsed.push({
            date: dateK ? toDate(r[dateK]) : new Date().toISOString().slice(0, 10),
            worker_name: worker,
            trade: tradeK ? matchOne(r[tradeK], TRADES, 'Others') : 'Others',
            skill: skillK ? matchOne(r[skillK], SKILLS, 'Unskilled') : 'Unskilled',
            gender: gender || null,
            labour_type: type,
            contractor_name: type === 'Contractor' && contractor ? contractor : null,
            status,
            days_present: days,
            daily_rate: rate,
            wage: days * rate,
            overtime_hours: otK ? toNum(r[otK]) : 0,
            is_night_shift: nightK ? toBool(r[nightK]) : false,
            output_qty: outQ,
            output_unit: outU || null,
            remark: remK && String(r[remK] ?? '').trim() ? String(r[remK]).trim() : null,
          })
        }
        if (!parsed.length) { setErr('No valid rows found — each row needs a Worker Name.'); return }
        setRows(parsed); setSkipped(skip)
      } catch (ex) {
        setErr('Could not read the file. Please upload a valid .xlsx file. ' + String(ex))
      }
    }
    reader.readAsArrayBuffer(f)
  }

  const totalWage = rows.reduce((n, r) => n + r.wage, 0)

  async function importAll() {
    setBusy(true); setErr(null)
    const { data: prof } = await supabase.from('profiles').select('org_id').single()
    const payload = rows.map(r => ({ org_id: prof?.org_id, project_id: projectId, ...r }))
    for (let i = 0; i < payload.length; i += 100) {
      const chunk = payload.slice(i, i + 100)
      const { error } = await supabase.from('labour_attendance').insert(chunk)
      if (error) { setErr(`Import failed (row ${i + 1}): ${error.message}`); setBusy(false); return }
    }
    setBusy(false); onImported()
  }

  return createPortal((
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6 bg-black/70 backdrop-blur-sm overflow-y-auto" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-[#1B1F2A] border border-white/[0.08] rounded-2xl w-full max-w-4xl my-auto shadow-[0px_10px_30px_rgba(0,0,0,0.5)] flex flex-col max-h-[90vh]">
        <div className="p-5 border-b border-white/5 flex items-center justify-between flex-shrink-0">
          <div>
            <h3 className="font-headline text-xl font-semibold text-[#e2e2e8]">Import Labour from Excel</h3>
            <p className="text-[11px] text-[#dcc1ae]/70 mt-0.5">Columns: Date · Worker Name · Trade · Skill · Gender · Labour Type · Contractor · Status · Days Present · Daily Rate · Overtime Hours · Night Shift · Output Qty · Output Unit · Remark</p>
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
              <p className="text-[12px] text-[#dcc1ae]/60 mt-3">Rows without a Worker Name are skipped. Dates work as dd/mm/yyyy or Excel dates. Wage is calculated as Days Present × Daily Rate.</p>
            </div>
          )}

          {err && <div className="text-sm text-red-400 mb-3 p-3 rounded-lg bg-red-500/5 border border-red-500/10">{err}</div>}

          {rows.length > 0 && (
            <>
              <div className="flex items-center justify-between mb-3">
                <div className="text-[13px] text-[#dcc1ae]">
                  <span className="font-semibold text-[#e2e2e8]">{rows.length}</span> labour rows · <span className="font-mono">{fileName}</span>
                  {skipped > 0 && <span className="text-[#dcc1ae]/60"> · {skipped} skipped</span>}
                </div>
                <div className="text-[13px] text-[#dcc1ae]">Total wage: <span className="font-mono font-bold text-[#e2e2e8]">₹{Math.round(totalWage).toLocaleString('en-IN')}</span></div>
              </div>
              <div className="overflow-x-auto rounded-lg border border-white/[0.05] max-h-[45vh]">
                <table className="w-full text-[12px]">
                  <thead className="bg-[#282a2e] sticky top-0"><tr>
                    {['Date', 'Worker', 'Trade', 'Skill', 'Type', 'Status', 'Days', 'Rate', 'Wage'].map(h => <th key={h} className="px-3 py-2 text-left font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>)}
                  </tr></thead>
                  <tbody className="divide-y divide-white/[0.05]">
                    {rows.slice(0, 200).map((r, i) => (
                      <tr key={i}>
                        <td className="px-3 py-1.5 font-mono text-[#dcc1ae] whitespace-nowrap">{r.date}</td>
                        <td className="px-3 py-1.5 text-[#e2e2e8] whitespace-nowrap">{r.worker_name}</td>
                        <td className="px-3 py-1.5 text-[#dcc1ae]">{r.trade}</td>
                        <td className="px-3 py-1.5 text-[#dcc1ae]">{r.skill}</td>
                        <td className="px-3 py-1.5 text-[#dcc1ae] whitespace-nowrap">{r.labour_type === 'Contractor' ? `Contractor${r.contractor_name ? ' · ' + r.contractor_name : ''}` : 'Company'}</td>
                        <td className="px-3 py-1.5">{r.status}</td>
                        <td className="px-3 py-1.5 font-mono text-[#e2e2e8]">{r.days_present}</td>
                        <td className="px-3 py-1.5 font-mono text-[#dcc1ae] text-right">₹{r.daily_rate.toLocaleString('en-IN')}</td>
                        <td className="px-3 py-1.5 font-mono text-[#ffb87b] text-right">₹{Math.round(r.wage).toLocaleString('en-IN')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length > 200 && <div className="p-2 text-center text-[11px] text-[#dcc1ae]/50">Showing first 200 — all {rows.length} will be imported.</div>}
              </div>
            </>
          )}
        </div>

        <div className="p-5 pt-3 flex gap-3 border-t border-white/5 flex-shrink-0">
          <button className="btn btn-ghost flex-1" onClick={onClose}>Cancel</button>
          {rows.length > 0
            ? <button className="btn btn-primary flex-[2]" disabled={busy} onClick={importAll}>{busy ? 'Importing…' : `Import ${rows.length} Rows`}</button>
            : <button className="btn btn-ghost flex-[2]" onClick={() => fileRef.current?.click()}>Choose file</button>}
        </div>
      </div>
    </div>
  ), document.body)
}