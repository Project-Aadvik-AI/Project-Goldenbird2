import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useProject } from '../lib/project'

type ReportKey = 'expenses' | 'creditors' | 'stock' | 'balances' | 'dpr' | 'prs' | 'attendance' | 'salary' | 'labour_salary' | 'imprest'
  | 'asset_register' | 'asset_docs' | 'asset_maint' | 'asset_loans'

const REPORTS: { key: ReportKey; label: string; help: string }[] = [
  { key: 'expenses', label: 'Expenses by head', help: 'Sum of amounts by expense type, filtered by project + date range.' },
  { key: 'creditors', label: 'Creditors (unpaid by vendor)', help: 'Unpaid expenses grouped by vendor.' },
  { key: 'stock', label: 'Stock on hand', help: 'IN − OUT balance per item for the chosen project.' },
  { key: 'balances', label: 'Per-person cash balances', help: 'For each person: advances received − expenses they paid.' },
  { key: 'dpr', label: 'DPR summary', help: 'Daily progress entries in the range.' },
  { key: 'prs', label: 'Open purchase requests', help: 'PRs with status Open in the range.' },
  { key: 'attendance', label: 'Attendance summary', help: 'Per employee: Present / Absent / Half-day / Leave / Holiday / Week-off counts in the date range.' },
  { key: 'salary', label: 'Salary (payroll)', help: 'Earned salary for the range: pays only for Present (+ half of Half-day) days at per-day rate (monthly salary / days in month). Unmarked/Absent days are not paid. Excludes labour-flagged employees — see the Labour salary report.' },
  { key: 'labour_salary', label: 'Labour salary (daily wage)', help: 'Labour-flagged employees paid by daily wage: rate × days worked (Present + half of Half-day), from Attendance marks in the range. Trade is taken from designation.' },
  { key: 'imprest', label: 'Staff Imprest / Advances', help: 'Employee-wise advances: total given, spent (bills), balance outstanding, settlement status, and aging of unsettled advances.' },
  { key: 'asset_register', label: 'Asset Register', help: 'All company assets: code, category, status, assignment, purchase cost, vehicle details.' },
  { key: 'asset_docs', label: 'Asset Document Expiry', help: 'Every asset document with its expiry date and status (Expired / Expiring in 30 days / Valid). Covers insurance, RC, PUC, fitness, permit, warranty.' },
  { key: 'asset_maint', label: 'Asset Maintenance', help: 'Service and repair history across all assets, with cost totals and next service due dates.' },
  { key: 'asset_loans', label: 'Asset Loans / EMI Due', help: 'Financed assets: loan amount, EMI, total paid, outstanding balance, and loan status.' },
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

  if (report === 'attendance') {
    const [{ data: emps }, { data: att }] = await Promise.all([
      supabase.from('employees').select('id, full_name, emp_code, department'),
      projFilter(supabase.from('attendance').select('employee_id, status, date')).gte('date', from).lte('date', to),
    ])
    const empList = (emps as any[]) ?? []
    const nameById = new Map(empList.map(e => [e.id, e]))
    const norm = (st: string) => (st || '').toLowerCase()
    const map = new Map<string, any>()
    for (const e of empList) {
      map.set(e.id, { Code: e.emp_code || '—', Employee: e.full_name, Department: e.department || '—',
        Present: 0, Absent: 0, 'Half Day': 0, Leave: 0, Holiday: 0, 'Week Off': 0, 'Total Marked': 0 })
    }
    for (const r of (att as any[]) ?? []) {
      const row = map.get(r.employee_id); if (!row) continue
      const st = norm(r.status)
      if (st === 'present') row.Present++
      else if (st === 'absent') row.Absent++
      else if (st === 'half day' || st === 'half-day' || st === 'halfday') row['Half Day']++
      else if (st === 'leave') row.Leave++
      else if (st === 'holiday') row.Holiday++
      else if (st === 'week off' || st === 'week-off' || st === 'weekoff') row['Week Off']++
      row['Total Marked']++
    }
    return [...map.values()]
      .filter(r => !projectId || r['Total Marked'] > 0)
      .sort((a, b) => String(a.Employee).localeCompare(String(b.Employee)))
  }

  if (report === 'salary') {
    const [{ data: emps }, { data: att }, { data: advs }, { data: iexp }] = await Promise.all([
      supabase.from('employees').select('id, full_name, emp_code, department, monthly_salary, is_labour'),
      projFilter(supabase.from('attendance').select('employee_id, status, date')).gte('date', from).lte('date', to),
      supabase.from('advances').select('employee_id, amount, spent_amount, settled'),
      supabase.from('expenses').select('imprest_employee_id, amount, approval_status'),
    ])
    const empList = (emps as any[]) ?? []
    const norm = (st: string) => (st || '').toLowerCase()
    // days in the selected range's month (use the 'from' month for per-day rate, like the payroll panel)
    const d = new Date(from)
    const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
    const map = new Map<string, any>()
    for (const e of empList) {
      if (e.is_labour) continue   // labour is paid by daily wage — see the Labour salary report
      const monthly = Number(e.monthly_salary || 0)
      map.set(e.id, { _monthly: monthly, _id: e.id, Code: e.emp_code || '—', Employee: e.full_name,
        Department: e.department || '—', 'Monthly Salary': monthly,
        Present: 0, Absent: 0, 'Half Day': 0, Paid: 0, _marked: 0 })
    }
    for (const r of (att as any[]) ?? []) {
      const row = map.get(r.employee_id); if (!row) continue
      row._marked++
      const st = norm(r.status)
      if (st === 'present') { row.Present++; row.Paid++ }
      else if (st === 'absent') row.Absent++
      else if (st === 'half day' || st === 'half-day' || st === 'halfday') { row['Half Day']++; row.Paid += 0.5 }
      else if (st === 'leave' || st === 'holiday' || st === 'week off' || st === 'week-off' || st === 'weekoff') row.Paid++
    }
    const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

    // Outstanding imprest per employee = advances given − APPROVED imprest bills (unsettled only)
    const outMap = new Map<string, number>()
    for (const a of (advs as any[]) ?? []) {
      if (a.settled) continue
      const cur = outMap.get(a.employee_id) ?? 0
      outMap.set(a.employee_id, round2(cur + Number(a.amount || 0)))
    }
    for (const x of (iexp as any[]) ?? []) {
      if (!x.imprest_employee_id) continue
      if ((x.approval_status ?? 'Approved') !== 'Approved') continue
      const cur = outMap.get(x.imprest_employee_id) ?? 0
      outMap.set(x.imprest_employee_id, round2(cur - Number(x.amount || 0)))
    }

    return [...map.values()].filter(row => !projectId || row._marked > 0).map(row => {
      const perDay = daysInMonth ? row._monthly / daysInMonth : 0
      // Earned-based: pay ONLY for Present (+ half of Half-day). Unmarked days are NOT paid.
      const paidDays = round2(row.Present + 0.5 * row['Half Day'])
      const earned = round2(perDay * paidDays)
      const { _monthly, Paid, _id, _marked, ...rest } = row
      const outstanding = Math.max(0, round2(outMap.get(row._id) ?? 0))
      const recovery = round2(Math.min(outstanding, earned))
      const netAfter = round2(earned - recovery)
      return { ...rest, 'Per Day': round2(perDay), 'Paid Days': paidDays,
        'Net Payable': earned,
        'Outstanding Imprest': outstanding,
        'Net After Recovery': netAfter }
    }).sort((a, b) => String(a.Employee).localeCompare(String(b.Employee)))
  }

  if (report === 'labour_salary') {
    const [{ data: emps }, { data: att }] = await Promise.all([
      supabase.from('employees').select('id, full_name, emp_code, department, designation, daily_wage_rate').eq('is_labour', true),
      projFilter(supabase.from('attendance').select('employee_id, status, date')).gte('date', from).lte('date', to),
    ])
    const norm = (st: string) => (st || '').toLowerCase()
    const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
    const map = new Map<string, any>()
    for (const e of (emps as any[]) ?? []) {
      map.set(e.id, {
        Code: e.emp_code || '—', Employee: e.full_name, Department: e.department || '—',
        Trade: e.designation || '—', 'Daily Rate': Number(e.daily_wage_rate || 0),
        Present: 0, 'Half Day': 0, _paid: 0, _marked: 0,
      })
    }
    for (const r of (att as any[]) ?? []) {
      const row = map.get(r.employee_id); if (!row) continue
      row._marked++
      const st = norm(r.status)
      if (st === 'present') { row.Present++; row._paid++ }
      else if (st === 'half day' || st === 'half-day' || st === 'halfday') { row['Half Day']++; row._paid += 0.5 }
    }
    return [...map.values()].filter(row => !projectId || row._marked > 0).map(row => {
      const { _paid, _marked, ...rest } = row
      const paidDays = round2(_paid)
      return { ...rest, 'Paid Days': paidDays, 'Wage Payable': round2(row['Daily Rate'] * paidDays) }
    }).sort((a, b) => String(a.Employee).localeCompare(String(b.Employee)))
  }

  if (report === 'imprest') {
    const [{ data: emps }, { data: advs }, { data: iexp }] = await Promise.all([
      supabase.from('employees').select('id, full_name, emp_code'),
      projFilter(supabase.from('advances').select('employee_id, amount, spent_amount, date, settled')),
      projFilter(supabase.from('expenses').select('imprest_employee_id, amount')),
    ])
    const nameById = new Map((emps as any[] ?? []).map(e => [e.id, e]))
    const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
    const today = new Date()
    const map = new Map<string, any>()
    for (const e of (emps as any[]) ?? []) {
      map.set(e.id, { Code: e.emp_code || '—', Employee: e.full_name,
        Given: 0, SpentManual: 0, SpentBills: 0, _oldest: null as Date | null, _anyUnsettled: false })
    }
    for (const a of (advs as any[]) ?? []) {
      const row = map.get(a.employee_id); if (!row) continue
      if (a.settled) continue
      row.Given = round2(row.Given + Number(a.amount || 0))
      row.SpentManual = round2(row.SpentManual + Number(a.spent_amount || 0))
      const bal = Number(a.amount || 0) - Number(a.spent_amount || 0)
      if (bal > 0.009) {
        row._anyUnsettled = true
        const d = a.date ? new Date(a.date) : null
        if (d && (!row._oldest || d < row._oldest)) row._oldest = d
      }
    }
    for (const x of (iexp as any[]) ?? []) {
      if (!x.imprest_employee_id) continue
      const row = map.get(x.imprest_employee_id); if (!row) continue
      row.SpentBills = round2(row.SpentBills + Number(x.amount || 0))
    }
    const rows = [...map.values()].map(r => {
      const spent = round2(r.SpentManual + r.SpentBills)
      const balance = round2(r.Given - spent)
      let ageDays = 0
      if (r._oldest) ageDays = Math.floor((today.getTime() - r._oldest.getTime()) / 86400000)
      const ageBucket = balance <= 0 ? '—' : ageDays > 90 ? '90+ days' : ageDays > 60 ? '60-90 days' : ageDays > 30 ? '30-60 days' : '0-30 days'
      return {
        Code: r.Code, Employee: r.Employee,
        'Advance Given': r.Given, 'Spent (bills)': spent,
        'Balance': balance,
        'Status': balance <= 0.009 ? 'Settled' : 'Outstanding',
        'Aging': ageBucket,
      }
    }).filter(r => r['Advance Given'] > 0 || r['Spent (bills)'] > 0)
      .sort((a, b) => b['Balance'] - a['Balance'])
    return rows
  }

  if (report === 'asset_register') {
    const [{ data: assets }, { data: emps }, { data: projs }] = await Promise.all([
      supabase.from('assets').select('*').eq('archived', false).order('asset_code'),
      supabase.from('employees').select('id, full_name'),
      supabase.from('projects').select('id, name'),
    ])
    const empName = (id: string | null) => (id ? (emps as any[])?.find(e => e.id === id)?.full_name : null) || '—'
    const projName = (id: string | null) => (id ? (projs as any[])?.find(p => p.id === id)?.name : null) || '—'
    return ((assets as any[]) ?? []).map(a => ({
      Code: a.asset_code || '—', Asset: a.name, Category: a.category || '—', Status: a.status,
      'Assigned To': empName(a.assigned_employee_id), 'Project / Site': projName(a.project_id),
      Location: a.location || '—', Vendor: a.vendor || '—',
      'Purchase Date': a.purchase_date || '—', 'Purchase Cost': Number(a.purchase_cost || 0),
      'Vehicle No.': a.vehicle_number || '—', 'Make & Model': a.make_model || '—',
      Chassis: a.chassis_number || '—', Engine: a.engine_number || '—',
      Odometer: a.odometer != null ? Number(a.odometer) : '—',
    }))
  }

  if (report === 'asset_docs') {
    const [{ data: docs }, { data: assets }] = await Promise.all([
      supabase.from('asset_documents').select('*').order('expiry_date', { ascending: true, nullsFirst: false }),
      supabase.from('assets').select('id, name, asset_code, category').eq('archived', false),
    ])
    const aMap = new Map(((assets as any[]) ?? []).map(a => [a.id, a]))
    const today = new Date(); today.setHours(0, 0, 0, 0)
    return ((docs as any[]) ?? [])
      .filter(d => aMap.has(d.asset_id))
      .map(d => {
        const a = aMap.get(d.asset_id)
        let status = 'No expiry', days: number | string = '—'
        if (d.expiry_date) {
          const exp = new Date(d.expiry_date); exp.setHours(0, 0, 0, 0)
          const n = Math.round((exp.getTime() - today.getTime()) / 86400000)
          days = n
          status = n < 0 ? 'EXPIRED' : n <= 30 ? 'Expiring in 30 days' : 'Valid'
        }
        return {
          'Asset Code': a.asset_code || '—', Asset: a.name, Category: a.category || '—',
          'Document': d.doc_type, 'Title / No.': d.title || '—',
          'Issue Date': d.issue_date || '—', 'Expiry Date': d.expiry_date || '—',
          'Days Left': days, Status: status,
        }
      })
      .sort((x, y) => (x.Status === 'EXPIRED' ? -1 : y.Status === 'EXPIRED' ? 1 : 0))
  }

  if (report === 'asset_maint') {
    const [{ data: m }, { data: assets }] = await Promise.all([
      supabase.from('asset_maintenance').select('*').gte('date', from).lte('date', to).order('date', { ascending: false }),
      supabase.from('assets').select('id, name, asset_code'),
    ])
    const aMap = new Map(((assets as any[]) ?? []).map(a => [a.id, a]))
    return ((m as any[]) ?? []).map(r => {
      const a = aMap.get(r.asset_id)
      return {
        Date: r.date, 'Asset Code': a?.asset_code || '—', Asset: a?.name || '—',
        'Service Type': r.service_type || '—', Description: r.description || '—',
        Vendor: r.vendor || '—', Odometer: r.odometer != null ? Number(r.odometer) : '—',
        Cost: Number(r.cost || 0), 'Next Service': r.next_service_date || '—',
      }
    })
  }

  if (report === 'asset_loans') {
    const [{ data: loans }, { data: pays }, { data: assets }] = await Promise.all([
      supabase.from('asset_loans').select('*'),
      supabase.from('asset_loan_payments').select('loan_id, amount'),
      supabase.from('assets').select('id, name, asset_code'),
    ])
    const aMap = new Map(((assets as any[]) ?? []).map(a => [a.id, a]))
    const paidByLoan: Record<string, number> = {}
    for (const p of ((pays as any[]) ?? [])) {
      paidByLoan[p.loan_id] = Math.round(((paidByLoan[p.loan_id] ?? 0) + Number(p.amount || 0)) * 100) / 100
    }
    return ((loans as any[]) ?? []).map(l => {
      const a = aMap.get(l.asset_id)
      const paid = paidByLoan[l.id] ?? 0
      const outstanding = Math.max(0, Math.round((Number(l.loan_amount || 0) - paid) * 100) / 100)
      return {
        'Asset Code': a?.asset_code || '—', Asset: a?.name || '—',
        'Finance Company': l.finance_company || '—',
        'Loan Amount': Number(l.loan_amount || 0), 'EMI': Number(l.emi_amount || 0),
        Frequency: l.emi_frequency || '—',
        'Total Paid': paid, 'Outstanding': outstanding,
        'Start': l.start_date || '—', 'End': l.end_date || '—', Status: l.status,
      }
    }).sort((x, y) => y['Outstanding'] - x['Outstanding'])
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