import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useProject } from '../lib/project'

type ReportKey = 'expenses' | 'creditors' | 'stock' | 'balances' | 'dpr' | 'prs'

const REPORTS: { key: ReportKey; label: string; help: string }[] = [
  { key: 'expenses', label: 'Expenses by head', help: 'Sum of amounts by expense type, filtered by project + date range.' },
  { key: 'creditors', label: 'Creditors (unpaid by vendor)', help: 'Unpaid expenses grouped by vendor.' },
  { key: 'stock', label: 'Stock on hand', help: 'IN − OUT balance per item for the chosen project.' },
  { key: 'balances', label: 'Per-person cash balances', help: 'For each person: advances received − expenses they paid.' },
  { key: 'dpr', label: 'DPR summary', help: 'Daily progress entries in the range.' },
  { key: 'prs', label: 'Open purchase requests', help: 'PRs with status Open in the range.' },
]

export default function AdminReports() {
  const { isAdmin } = useAuth()
  const { projects } = useProject()
  const today = new Date().toISOString().slice(0, 10)
  const monthStart = today.slice(0, 8) + '01'

  const [report, setReport] = useState<ReportKey>('expenses')
  const [projectId, setProjectId] = useState<string>('')
  const [from, setFrom] = useState<string>(monthStart)
  const [to, setTo] = useState<string>(today)
  const [rows, setRows] = useState<Record<string, any>[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const projName = projects.find(p => p.id === projectId)?.name

  async function run() {
    setLoading(true); setErr(null); setRows([])
    try {
      const data = await runReport(report, projectId, from, to)
      setRows(data)
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { setRows([]) }, [report, projectId, from, to])

  const columns = useMemo(() => rows[0] ? Object.keys(rows[0]) : [], [rows])

  function exportExcel() {
    if (!rows.length) return
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, report.slice(0, 30))
    const name = fileName('xlsx')
    XLSX.writeFile(wb, name)
  }

  function exportPDF() {
    if (!rows.length) return
    const w = window.open('', '_blank')
    if (!w) return
    const meta = `${REPORTS.find(r => r.key === report)?.label} · ${projName || 'All Projects'} · ${from} → ${to}`
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${meta}</title>
      <style>
        body{font-family:Arial,sans-serif;padding:24px;color:#111;font-size:12px}
        h1{font-size:18px;margin:0 0 4px} .muted{color:#666;font-size:11px;margin-bottom:16px}
        table{border-collapse:collapse;width:100%;font-size:11px}
        th,td{border:1px solid #ddd;padding:6px 8px;text-align:left}
        th{background:#f4f4f4;font-weight:700;text-transform:uppercase;font-size:10px;letter-spacing:.5px}
        tr:nth-child(even) td{background:#fafafa}
        @media print{@page{size:landscape}}
      </style></head><body>
      <h1>${REPORTS.find(r => r.key === report)?.label}</h1>
      <div class="muted">${projName || 'All Projects'} · ${from} to ${to} · Generated ${new Date().toLocaleString()}</div>
      <table><thead><tr>${columns.map(c => `<th>${escapeHtml(c)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(r => `<tr>${columns.map(c => `<td>${escapeHtml(String(r[c] ?? ''))}</td>`).join('')}</tr>`).join('')}</tbody></table>
      <script>window.onload=()=>{setTimeout(()=>window.print(),300)}</script>
      </body></html>`
    w.document.write(html); w.document.close()
  }

  function fileName(ext: string) {
    const stub = `${report}_${(projName || 'all').replace(/\W+/g, '_')}_${from}_${to}`
    return `${stub}.${ext}`
  }

  if (!isAdmin) return (
    <div className="card p-8 text-center max-w-md mx-auto mt-8">
      <span className="material-symbols-outlined text-red-400" style={{ fontSize: '32px' }}>lock</span>
      <p className="text-sm text-[#dcc1ae] mt-2">Admin only.</p>
    </div>
  )

  const activeReport = REPORTS.find(r => r.key === report)!

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-headline text-2xl font-semibold text-[#e2e2e8]">Reports & Export</h1>
        <p className="text-sm text-[#dcc1ae] mt-0.5">Pull data across projects and export to Excel or PDF</p>
      </div>

      <div className="card p-5 mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <L label="Report">
            <select className="input" value={report} onChange={e => setReport(e.target.value as ReportKey)}>
              {REPORTS.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
            </select>
          </L>
          <L label="Project">
            <select className="input" value={projectId} onChange={e => setProjectId(e.target.value)}>
              <option value="">All Projects</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </L>
          <L label="From"><input className="input" type="date" value={from} onChange={e => setFrom(e.target.value)} /></L>
          <L label="To"><input className="input" type="date" value={to} onChange={e => setTo(e.target.value)} /></L>
        </div>
        <p className="text-[11px] text-[#dcc1ae]/60 mt-2">{activeReport.help}</p>
        <div className="flex gap-2 mt-4 flex-wrap">
          <button className="btn btn-primary" onClick={run} disabled={loading}>
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>play_arrow</span>
            {loading ? 'Running…' : 'Run Report'}
          </button>
          <button className="btn btn-ghost" onClick={exportExcel} disabled={!rows.length}>
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>table_view</span>
            Excel
          </button>
          <button className="btn btn-ghost" onClick={exportPDF} disabled={!rows.length}>
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>picture_as_pdf</span>
            PDF
          </button>
        </div>
        {err && <div className="mt-3 text-sm text-red-400">{err}</div>}
      </div>

      <div className="card overflow-hidden overflow-x-auto">
        {rows.length ? (
          <table className="w-full text-sm">
            <thead className="bg-[#282a2e]">
              <tr>
                {columns.map(c => (
                  <th key={c} className="px-4 py-3 text-left text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {rows.map((r, i) => (
                <tr key={i} className="hover:bg-white/[0.02]">
                  {columns.map(c => {
                    const v = r[c]
                    const isNum = typeof v === 'number'
                    return <td key={c} className={`px-4 py-3 ${isNum ? 'font-mono text-[#e2e2e8]' : 'text-[#dcc1ae]'}`}>{isNum ? v.toLocaleString('en-IN') : String(v ?? '—')}</td>
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-10 text-center text-[#dcc1ae]/60 text-sm">
            {loading ? 'Loading…' : 'Choose a report and click Run.'}
          </div>
        )}
      </div>
    </div>
  )
}

async function runReport(report: ReportKey, projectId: string, from: string, to: string): Promise<Record<string, any>[]> {
  const projFilter = (q: any) => projectId ? q.eq('project_id', projectId) : q
  const dateFilter = (q: any, col: string) => q.gte(col, from).lte(col, to)

  if (report === 'expenses') {
    const { data } = await dateFilter(projFilter(supabase.from('expenses').select('expense_type, amount')), 'date')
    const map = new Map<string, { count: number; amount: number }>()
    for (const r of (data as any[]) ?? []) {
      const key = r.expense_type || 'Other'
      const cur = map.get(key) ?? { count: 0, amount: 0 }
      cur.count += 1; cur.amount += Number(r.amount || 0)
      map.set(key, cur)
    }
    return [...map.entries()].map(([type, v]) => ({ Type: type, Entries: v.count, Amount: v.amount }))
      .sort((a, b) => b.Amount - a.Amount)
  }

  if (report === 'creditors') {
    const { data } = await dateFilter(projFilter(supabase.from('expenses').select('vendor, amount, payment_status, date')), 'date')
    const rows = ((data as any[]) ?? []).filter(r => (r.payment_status || '').toLowerCase().includes('credit'))
    const map = new Map<string, number>()
    for (const r of rows) {
      const v = r.vendor || 'Unknown'
      map.set(v, (map.get(v) ?? 0) + Number(r.amount || 0))
    }
    return [...map.entries()].map(([Vendor, Unpaid]) => ({ Vendor, Unpaid }))
      .sort((a, b) => b.Unpaid - a.Unpaid)
  }

  if (report === 'stock') {
    const { data } = await projFilter(supabase.from('store_ledger').select('item, unit, direction, qty, value'))
    const map = new Map<string, { unit: string; in_qty: number; out_qty: number; in_value: number }>()
    for (const r of (data as any[]) ?? []) {
      const key = r.item || '—'
      const cur = map.get(key) ?? { unit: r.unit || '', in_qty: 0, out_qty: 0, in_value: 0 }
      if ((r.direction || '').toUpperCase() === 'IN') { cur.in_qty += Number(r.qty || 0); cur.in_value += Number(r.value || 0) }
      else cur.out_qty += Number(r.qty || 0)
      map.set(key, cur)
    }
    return [...map.entries()].map(([Item, v]) => ({
      Item, Unit: v.unit, IN: v.in_qty, OUT: v.out_qty, Balance: v.in_qty - v.out_qty, 'IN Value': v.in_value,
    })).sort((a, b) => a.Item.localeCompare(b.Item))
  }

  if (report === 'balances') {
    const [{ data: adv }, { data: exp }] = await Promise.all([
      dateFilter(projFilter(supabase.from('advances').select('person, amount')), 'date'),
      dateFilter(projFilter(supabase.from('expenses').select('paid_by, amount, payment_status')), 'date'),
    ])
    const map = new Map<string, { received: number; spent: number }>()
    for (const r of (adv as any[]) ?? []) {
      const k = r.person || 'Unknown'
      const cur = map.get(k) ?? { received: 0, spent: 0 }
      cur.received += Number(r.amount || 0); map.set(k, cur)
    }
    for (const r of (exp as any[]) ?? []) {
      if ((r.payment_status || '').toLowerCase().includes('credit')) continue
      const k = r.paid_by || 'Unknown'
      const cur = map.get(k) ?? { received: 0, spent: 0 }
      cur.spent += Number(r.amount || 0); map.set(k, cur)
    }
    return [...map.entries()].map(([Person, v]) => ({
      Person, Received: v.received, Spent: v.spent, Balance: v.received - v.spent,
    })).sort((a, b) => b.Balance - a.Balance)
  }

  if (report === 'dpr') {
    const { data } = await dateFilter(projFilter(supabase.from('dpr').select('date, item, today_qty, cumulative_qty, unit, remark')), 'date')
    return ((data as any[]) ?? []).map(r => ({
      Date: r.date, Item: r.item, Today: Number(r.today_qty || 0), Cumulative: Number(r.cumulative_qty || 0), Unit: r.unit || '', Remark: r.remark || '',
    })).sort((a, b) => a.Date.localeCompare(b.Date))
  }

  if (report === 'prs') {
    const { data } = await dateFilter(projFilter(supabase.from('purchase_requests').select('date, pr_no, material, qty, unit, vendor, needed_by, status')), 'date')
    return ((data as any[]) ?? []).filter(r => (r.status || '').toLowerCase() === 'open').map(r => ({
      Date: r.date, 'PR No': r.pr_no || '', Material: r.material, Qty: Number(r.qty || 0), Unit: r.unit || '',
      Vendor: r.vendor || '', 'Needed By': r.needed_by || '', Status: r.status,
    }))
  }

  return []
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!))
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider block mb-1">{label}</span>
      {children}
    </label>
  )
}