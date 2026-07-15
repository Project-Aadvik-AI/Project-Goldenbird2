import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useProject, NoProjectPrompt } from '../lib/project'
import { useWorkspace } from '../lib/workspace'
import ExportButtons from '../components/ExportButtons'
import PrintButton from '../components/PrintButton'

/* ───────────────────────── Types & constants ───────────────────────── */

type LabourRow = {
  id: string
  date: string
  project_id: string | null
  worker_name: string
  skill: string | null
  days_present: number | null
  daily_rate: number | null
  wage: number | null
  remark: string | null
  trade: string | null
  gender: string | null
  labour_type: string | null
  contractor_name: string | null
  status: string | null
  overtime_hours: number | null
  is_night_shift: boolean | null
  output_qty: number | null
  output_unit: string | null
}

type Requirement = {
  id: string
  project_id: string | null
  contractor_name: string | null
  trade: string | null
  required_count: number
}

const TRADES = ['Mason', 'Carpenter', 'Bar Bender', 'Electrician', 'Plumber', 'Welder', 'Painter', 'Helper', 'Others'] as const

// Alert thresholds — tune these to your site's expectations.
const LOW_ATTENDANCE_PCT = 75   // today's attendance below this % → warn
const SHORTAGE_PCT = 70         // today's strength below this % of the 7-day average → warn
const OT_HOURS_ALERT = 3        // a worker logging more overtime than this today → flag

/* ───────────────────────── Date helpers ───────────────────────── */

const iso = (d: Date) => d.toISOString().slice(0, 10)
function addDays(d: string, n: number) { const x = new Date(d + 'T00:00:00'); x.setDate(x.getDate() + n); return iso(x) }
function fmtDate(d: string) {
  const x = new Date(d + 'T00:00:00')
  return x.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}
function fmtShort(d: string) {
  const x = new Date(d + 'T00:00:00')
  return x.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
}
function monthKey(d: string) { return d.slice(0, 7) }
function monthLabel(k: string) {
  const x = new Date(k + '-01T00:00:00')
  return x.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })
}

/* ───────────────────────── Row-level maths ───────────────────────── */

// A worker's status for a day. Legacy rows (no status) fall back to days_present.
function statusOf(r: LabourRow): 'Present' | 'Half Day' | 'Absent' | 'Leave' {
  if (r.status === 'Present' || r.status === 'Half Day' || r.status === 'Absent' || r.status === 'Leave') return r.status
  const dp = Number(r.days_present ?? 0)
  if (dp >= 1) return 'Present'
  if (dp > 0) return 'Half Day'
  return 'Absent'
}
// Man-days contributed (Present = 1, Half Day = 0.5, else 0).
function manDays(r: LabourRow): number {
  const s = statusOf(r)
  return s === 'Present' ? 1 : s === 'Half Day' ? 0.5 : 0
}
function tradeOf(r: LabourRow): string { return (r.trade && r.trade.trim()) || 'Others' }
function typeOf(r: LabourRow): 'Company' | 'Contractor' { return r.labour_type === 'Contractor' ? 'Contractor' : 'Company' }
function contractorOf(r: LabourRow): string { return (r.contractor_name && r.contractor_name.trim()) || 'Company / Direct' }
function isSkilled(r: LabourRow): boolean { return !!r.skill && r.skill !== 'Unskilled' }

/* ───────────────────────── Small UI atoms ───────────────────────── */

function Kpi({ label, value, sub, tone = 'text', accent }: { label: string; value: string | number; sub?: string; tone?: string; accent?: string }) {
  return (
    <div className="card p-3.5 flex flex-col justify-between min-h-[92px]" style={accent ? { borderLeft: `2px solid ${accent}` } : undefined}>
      <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--faint)' }}>{label}</span>
      <div>
        <div className="font-mono text-[26px] font-bold leading-none" style={{ color: tone }}>{value}</div>
        {sub && <div className="text-[10px] mt-1" style={{ color: 'var(--text-2)' }}>{sub}</div>}
      </div>
    </div>
  )
}

function Section({ title, subtitle, right, children }: { title: string; subtitle?: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="card overflow-hidden mb-5">
      <div className="px-4 py-3 border-b flex items-center justify-between gap-3 flex-wrap" style={{ borderColor: 'var(--line)' }}>
        <div>
          <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{title}</div>
          {subtitle && <div className="text-[11px]" style={{ color: 'var(--faint)' }}>{subtitle}</div>}
        </div>
        {right}
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

// Horizontal bar list (project / trade / contractor distribution).
function BarList({ rows, unit = '' }: { rows: { label: string; value: number }[]; unit?: string }) {
  const max = Math.max(1, ...rows.map(r => r.value))
  if (!rows.length) return <div className="text-[12px] py-4 text-center" style={{ color: 'var(--faint)' }}>No data in this window.</div>
  return (
    <div className="space-y-2.5">
      {rows.map(r => (
        <div key={r.label}>
          <div className="flex items-center justify-between text-[12px] mb-1">
            <span style={{ color: 'var(--text)' }}>{r.label}</span>
            <span className="font-mono" style={{ color: 'var(--text-2)' }}>{r.value.toLocaleString('en-IN')}{unit}</span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--line)' }}>
            <div className="h-full rounded-full" style={{ width: `${(r.value / max) * 100}%`, background: 'var(--accent)' }} />
          </div>
        </div>
      ))}
    </div>
  )
}

// Tiny SVG line/area chart for trends.
function LineChart({ points, height = 130 }: { points: { label: string; value: number }[]; height?: number }) {
  if (points.length < 2) return <div className="text-[12px] py-6 text-center" style={{ color: 'var(--faint)' }}>Not enough data to plot a trend yet.</div>
  const W = 640, H = height, padL = 8, padR = 8, padT = 10, padB = 18
  const max = Math.max(1, ...points.map(p => p.value))
  const stepX = (W - padL - padR) / (points.length - 1)
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / max)
  const x = (i: number) => padL + stepX * i
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ')
  const area = `${line} L ${x(points.length - 1).toFixed(1)} ${H - padB} L ${x(0).toFixed(1)} ${H - padB} Z`
  const labelEvery = Math.ceil(points.length / 8)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }} preserveAspectRatio="none">
      <path d={area} fill="var(--accent)" opacity="0.12" />
      <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      {points.map((p, i) => (
        <circle key={i} cx={x(i)} cy={y(p.value)} r="2" fill="var(--accent)" />
      ))}
      {points.map((p, i) => (i % labelEvery === 0 || i === points.length - 1) ? (
        <text key={'t' + i} x={x(i)} y={H - 5} fontSize="9" textAnchor="middle" fill="var(--faint)">{p.label}</text>
      ) : null)}
    </svg>
  )
}

// Simple vertical-bar chart for weekly / monthly trends.
function ColChart({ points, height = 130 }: { points: { label: string; value: number }[]; height?: number }) {
  const max = Math.max(1, ...points.map(p => p.value))
  if (!points.length) return <div className="text-[12px] py-6 text-center" style={{ color: 'var(--faint)' }}>No data yet.</div>
  return (
    <div className="flex items-end gap-1.5" style={{ height }}>
      {points.map((p, i) => (
        <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
          <div className="w-full rounded-t" title={`${p.label}: ${p.value}`}
            style={{ height: `${(p.value / max) * 100}%`, minHeight: p.value > 0 ? 3 : 0, background: 'var(--accent)', opacity: 0.85 }} />
          <div className="text-[8px] mt-1 whitespace-nowrap" style={{ color: 'var(--faint)' }}>{p.label}</div>
        </div>
      ))}
    </div>
  )
}

/* ───────────────────────── Page ───────────────────────── */

type ReportKey = 'daily' | 'attendance' | 'monthly' | 'contractor' | 'productivity'

export default function LabourDashboard() {
  const { activeProject, projects } = useProject()
  const { inHeadOffice } = useWorkspace()

  const [rows, setRows] = useState<LabourRow[]>([])
  const [reqs, setReqs] = useState<Requirement[]>([])
  const [loading, setLoading] = useState(true)
  const [asOf, setAsOf] = useState(iso(new Date()))     // snapshot date (cards / daily status / daily report)
  const [drill, setDrill] = useState('')                // Head-Office drill-down into one project ('' = all)
  const [report, setReport] = useState<ReportKey>('daily')

  // Discard responses for a project the user has since left (the app's standard guard).
  const pRef = useRef<string | null>(activeProject?.id ?? null)
  pRef.current = activeProject?.id ?? null

  async function load() {
    const p = activeProject?.id ?? null
    setLoading(true)
    // Pull ~13 months so daily(30d) / weekly(12w) / monthly(12m) trends all have data.
    const from = addDays(iso(new Date()), -400)

    let q = supabase.from('labour_attendance').select('*').gte('date', from).order('date', { ascending: false }).limit(20000)
    if (activeProject) q = q.eq('project_id', activeProject.id)   // project workspace → scoped. Head Office → all (RLS enforces).
    const { data } = await q

    let rq = supabase.from('labour_requirements').select('id, project_id, contractor_name, trade, required_count')
    if (activeProject) rq = rq.eq('project_id', activeProject.id)
    const { data: rqData } = await rq

    if (pRef.current !== p) return   // stale response — a project switch happened while waiting

    setRows((data as LabourRow[]) ?? [])
    setReqs((rqData as Requirement[]) ?? [])
    setLoading(false)
  }

  useEffect(() => { load() /* eslint-disable-next-line */ }, [activeProject?.id])

  // Real-time: refresh automatically whenever labour deployment changes.
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null
    const bump = () => { if (t) clearTimeout(t); t = setTimeout(() => load(), 400) }
    const ch = supabase
      .channel('labour-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'labour_attendance' }, bump)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'labour_requirements' }, bump)
      .subscribe()
    return () => { if (t) clearTimeout(t); supabase.removeChannel(ch) }
    /* eslint-disable-next-line */
  }, [activeProject?.id])

  const projName = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of projects) m.set(p.id, p.name)
    return m
  }, [projects])

  // Head-Office drill-down filter (client-side).
  const scoped = useMemo(() => drill ? rows.filter(r => r.project_id === drill) : rows, [rows, drill])

  // Rows on the snapshot date.
  const dayRows = useMemo(() => scoped.filter(r => r.date === asOf), [scoped, asOf])

  /* ── Summary cards (muster snapshot for `asOf`) ── */
  const cards = useMemo(() => {
    const total = dayRows.length
    let present = 0, half = 0, absent = 0, leave = 0
    let skilled = 0, unskilled = 0, contractor = 0, company = 0, male = 0, female = 0
    for (const r of dayRows) {
      const s = statusOf(r)
      if (s === 'Present') present++
      else if (s === 'Half Day') half++
      else if (s === 'Absent') absent++
      else if (s === 'Leave') leave++
      if (isSkilled(r)) skilled++; else unskilled++
      if (typeOf(r) === 'Contractor') contractor++; else company++
      if ((r.gender || '') === 'Male') male++
      else if ((r.gender || '') === 'Female') female++
    }
    return {
      total, presentHeads: present + half, absent, leave, half, present,
      skilled, unskilled, contractor, company, male, female,
    }
  }, [dayRows])

  /* ── Daily status (snapshot) ── */
  const daily = useMemo(() => {
    let ot = 0, otHrs = 0, night = 0
    for (const r of dayRows) {
      if (Number(r.overtime_hours ?? 0) > 0) { ot++; otHrs += Number(r.overtime_hours) }
      if (r.is_night_shift) night++
    }
    return { present: cards.present, absent: cards.absent, half: cards.half, ot, otHrs, night }
  }, [dayRows, cards])

  /* ── Attendance summary (today / week / month, relative to `asOf`) ── */
  function attendanceWindow(fromDate: string, toDate: string) {
    const inWin = scoped.filter(r => r.date >= fromDate && r.date <= toDate)
    const total = inWin.length
    const present = inWin.filter(r => { const s = statusOf(r); return s === 'Present' || s === 'Half Day' }).length
    const pct = total ? Math.round((present / total) * 100) : 0
    return { total, present, pct }
  }
  const att = useMemo(() => {
    const today = attendanceWindow(asOf, asOf)
    const week = attendanceWindow(addDays(asOf, -6), asOf)
    const month = attendanceWindow(asOf.slice(0, 7) + '-01', asOf)
    return { today, week, month }
  }, [scoped, asOf])

  /* ── Distribution (last 7 days man-days, relative to `asOf`) ── */
  const dist = useMemo(() => {
    const win = scoped.filter(r => r.date >= addDays(asOf, -6) && r.date <= asOf)
    const byProject = new Map<string, number>()
    const byTrade = new Map<string, number>()
    const byContractor = new Map<string, number>()
    for (const r of win) {
      const md = manDays(r)
      const pn = r.project_id ? (projName.get(r.project_id) || 'Unknown project') : 'Unassigned'
      byProject.set(pn, (byProject.get(pn) ?? 0) + md)
      byTrade.set(tradeOf(r), (byTrade.get(tradeOf(r)) ?? 0) + md)
      byContractor.set(contractorOf(r), (byContractor.get(contractorOf(r)) ?? 0) + md)
    }
    const toRows = (m: Map<string, number>) =>
      [...m.entries()].map(([label, value]) => ({ label, value: Math.round(value * 10) / 10 })).sort((a, b) => b.value - a.value)
    // Trades: keep the canonical order, drop empties.
    const tradeRows = TRADES.map(t => ({ label: t, value: Math.round((byTrade.get(t) ?? 0) * 10) / 10 })).filter(r => r.value > 0)
    return { project: toRows(byProject), trade: tradeRows, contractor: toRows(byContractor) }
  }, [scoped, asOf, projName])

  /* ── Trend charts ── */
  const dailyTrend = useMemo(() => {
    const pts: { label: string; value: number }[] = []
    for (let i = 29; i >= 0; i--) {
      const d = addDays(asOf, -i)
      const heads = scoped.filter(r => r.date === d && manDays(r) > 0).length
      pts.push({ label: fmtShort(d), value: heads })
    }
    return pts
  }, [scoped, asOf])

  const weeklyTrend = useMemo(() => {
    const pts: { label: string; value: number }[] = []
    for (let w = 11; w >= 0; w--) {
      const end = addDays(asOf, -w * 7)
      const start = addDays(end, -6)
      const md = scoped.filter(r => r.date >= start && r.date <= end).reduce((s, r) => s + manDays(r), 0)
      pts.push({ label: fmtShort(start), value: Math.round(md) })
    }
    return pts
  }, [scoped, asOf])

  const monthlyTrend = useMemo(() => {
    const keys: string[] = []
    const base = new Date(asOf + 'T00:00:00')
    for (let m = 11; m >= 0; m--) {
      const d = new Date(base.getFullYear(), base.getMonth() - m, 1)
      keys.push(iso(d).slice(0, 7))
    }
    const agg = new Map<string, number>()
    for (const r of scoped) { const k = monthKey(r.date); agg.set(k, (agg.get(k) ?? 0) + manDays(r)) }
    return keys.map(k => ({ label: monthLabel(k), value: Math.round(agg.get(k) ?? 0) }))
  }, [scoped, asOf])

  /* ── Productivity (this month, relative to `asOf`) ── */
  const prod = useMemo(() => {
    const from = asOf.slice(0, 7) + '-01'
    const win = scoped.filter(r => r.date >= from && r.date <= asOf)
    const presentMD = win.reduce((s, r) => s + manDays(r), 0)
    const totalHeads = win.length
    const wage = win.reduce((s, r) => s + Number(r.wage ?? 0), 0)
    const output = win.reduce((s, r) => s + Number(r.output_qty ?? 0), 0)
    const workers = new Set(win.map(r => r.worker_name)).size
    const utilization = totalHeads ? Math.round((presentMD / totalHeads) * 100) : 0
    const costPerManDay = presentMD ? wage / presentMD : 0
    const productivity = presentMD ? output / presentMD : 0    // output per man-day
    const outputPerWorker = workers ? output / workers : 0
    const hasOutput = output > 0
    return { presentMD, wage, output, workers, utilization, costPerManDay, productivity, outputPerWorker, hasOutput }
  }, [scoped, asOf])

  /* ── Alerts ── */
  const alerts = useMemo(() => {
    const out: { tone: 'red' | 'amber'; icon: string; text: string }[] = []
    // Missing attendance
    if (dayRows.length === 0) {
      out.push({ tone: 'amber', icon: 'event_busy', text: `No labour recorded for ${fmtDate(asOf)}. Attendance may be pending.` })
    } else {
      // Low attendance
      if (att.today.pct < LOW_ATTENDANCE_PCT) {
        out.push({ tone: 'amber', icon: 'trending_down', text: `Low attendance today — ${att.today.pct}% present (below ${LOW_ATTENDANCE_PCT}%).` })
      }
      // Labour shortage vs trailing 7-day average strength
      const prevDays: number[] = []
      for (let i = 1; i <= 7; i++) {
        const d = addDays(asOf, -i)
        prevDays.push(scoped.filter(r => r.date === d && manDays(r) > 0).length)
      }
      const nonZero = prevDays.filter(v => v > 0)
      const avg = nonZero.length ? nonZero.reduce((a, b) => a + b, 0) / nonZero.length : 0
      const todayHeads = dailyTrend[dailyTrend.length - 1]?.value ?? 0
      if (avg > 0 && todayHeads < avg * (SHORTAGE_PCT / 100)) {
        out.push({ tone: 'red', icon: 'groups', text: `Possible labour shortage — ${todayHeads} on site vs ~${Math.round(avg)} average (last 7 days).` })
      }
      // Excess overtime
      if (daily.ot > 0) {
        const heavy = dayRows.filter(r => Number(r.overtime_hours ?? 0) > OT_HOURS_ALERT).length
        if (heavy > 0) out.push({ tone: 'amber', icon: 'more_time', text: `Excess overtime — ${heavy} worker(s) logged more than ${OT_HOURS_ALERT}h today.` })
      }
    }
    // Contractor manpower below requirement (only if targets are set)
    for (const req of reqs) {
      if (drill && req.project_id !== drill) continue
      const have = dayRows.filter(r => {
        if (req.contractor_name && contractorOf(r) !== req.contractor_name) return false
        if (req.trade && tradeOf(r) !== req.trade) return false
        return manDays(r) > 0
      }).length
      if (have < req.required_count) {
        const who = req.contractor_name || 'Project'
        const what = req.trade ? ` ${req.trade}` : ''
        out.push({ tone: 'red', icon: 'engineering', text: `${who}${what} below requirement — ${have} on site vs ${req.required_count} required.` })
      }
    }
    return out
  }, [dayRows, att, scoped, asOf, dailyTrend, daily, reqs, drill])

  /* ── Reports (feed ExportButtons + a preview table) ── */
  const reportData = useMemo(() => {
    // Daily labour report — one line per worker for the snapshot date.
    const daily: { cols: { header: string; get: (r: any) => string | number }[]; rows: any[]; title: string; file: string; dateField?: string } = {
      title: `Daily Labour Report — ${fmtDate(asOf)}`,
      file: 'daily_labour_report',
      rows: dayRows.map(r => ({
        date: r.date, worker: r.worker_name, trade: tradeOf(r), skill: r.skill || '—',
        type: typeOf(r), contractor: r.contractor_name || '—', gender: r.gender || '—',
        status: statusOf(r), ot: Number(r.overtime_hours ?? 0), night: r.is_night_shift ? 'Yes' : 'No',
        rate: Number(r.daily_rate ?? 0), wage: Number(r.wage ?? 0),
        output: r.output_qty != null ? `${r.output_qty} ${r.output_unit || ''}`.trim() : '—',
      })),
      cols: [
        { header: 'Date', get: (r: any) => r.date }, { header: 'Worker', get: (r: any) => r.worker },
        { header: 'Trade', get: (r: any) => r.trade }, { header: 'Skill', get: (r: any) => r.skill },
        { header: 'Type', get: (r: any) => r.type }, { header: 'Contractor', get: (r: any) => r.contractor },
        { header: 'Gender', get: (r: any) => r.gender }, { header: 'Status', get: (r: any) => r.status },
        { header: 'OT Hrs', get: (r: any) => r.ot }, { header: 'Night', get: (r: any) => r.night },
        { header: 'Rate (INR)', get: (r: any) => r.rate }, { header: 'Wage (INR)', get: (r: any) => r.wage },
        { header: 'Output', get: (r: any) => r.output },
      ],
    }

    // Attendance report — one line per date.
    const byDate = new Map<string, LabourRow[]>()
    for (const r of scoped) { const a = byDate.get(r.date) ?? []; a.push(r); byDate.set(r.date, a) }
    const attRows = [...byDate.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([date, rs]) => {
      let p = 0, h = 0, ab = 0, lv = 0
      for (const r of rs) { const s = statusOf(r); if (s === 'Present') p++; else if (s === 'Half Day') h++; else if (s === 'Absent') ab++; else lv++ }
      const total = rs.length
      const pct = total ? Math.round(((p + h) / total) * 100) : 0
      return { date, total, present: p, half: h, absent: ab, leave: lv, pct }
    })
    const attendance = {
      title: 'Attendance Report', file: 'attendance_report', dateField: 'date',
      rows: attRows,
      cols: [
        { header: 'Date', get: (r: any) => r.date }, { header: 'Total', get: (r: any) => r.total },
        { header: 'Present', get: (r: any) => r.present }, { header: 'Half Day', get: (r: any) => r.half },
        { header: 'Absent', get: (r: any) => r.absent }, { header: 'Leave', get: (r: any) => r.leave },
        { header: 'Attendance %', get: (r: any) => r.pct },
      ],
    }

    // Monthly labour report — one line per worker for the snapshot month.
    const mFrom = asOf.slice(0, 7) + '-01'
    const mWin = scoped.filter(r => r.date >= mFrom && r.date <= asOf)
    const byWorker = new Map<string, LabourRow[]>()
    for (const r of mWin) { const a = byWorker.get(r.worker_name) ?? []; a.push(r); byWorker.set(r.worker_name, a) }
    const monRows = [...byWorker.entries()].map(([worker, rs]) => ({
      worker,
      trade: tradeOf(rs[0]), skill: rs[0].skill || '—', type: typeOf(rs[0]),
      contractor: rs[0].contractor_name || '—',
      manDays: Math.round(rs.reduce((s, r) => s + manDays(r), 0) * 10) / 10,
      ot: Math.round(rs.reduce((s, r) => s + Number(r.overtime_hours ?? 0), 0) * 10) / 10,
      wage: Math.round(rs.reduce((s, r) => s + Number(r.wage ?? 0), 0)),
    })).sort((a, b) => b.manDays - a.manDays)
    const monthly = {
      title: `Monthly Labour Report — ${monthLabel(asOf.slice(0, 7))}`, file: 'monthly_labour_report',
      rows: monRows,
      cols: [
        { header: 'Worker', get: (r: any) => r.worker }, { header: 'Trade', get: (r: any) => r.trade },
        { header: 'Skill', get: (r: any) => r.skill }, { header: 'Type', get: (r: any) => r.type },
        { header: 'Contractor', get: (r: any) => r.contractor }, { header: 'Man-Days', get: (r: any) => r.manDays },
        { header: 'OT Hrs', get: (r: any) => r.ot }, { header: 'Wage (INR)', get: (r: any) => r.wage },
      ],
    }

    // Contractor labour report — one line per contractor for the snapshot month.
    const byContractor = new Map<string, LabourRow[]>()
    for (const r of mWin) { const k = contractorOf(r); const a = byContractor.get(k) ?? []; a.push(r); byContractor.set(k, a) }
    const conRows = [...byContractor.entries()].map(([contractor, rs]) => ({
      contractor,
      workers: new Set(rs.map(r => r.worker_name)).size,
      manDays: Math.round(rs.reduce((s, r) => s + manDays(r), 0) * 10) / 10,
      ot: Math.round(rs.reduce((s, r) => s + Number(r.overtime_hours ?? 0), 0) * 10) / 10,
      wage: Math.round(rs.reduce((s, r) => s + Number(r.wage ?? 0), 0)),
      trades: [...new Set(rs.map(tradeOf))].join(', '),
    })).sort((a, b) => b.manDays - a.manDays)
    const contractor = {
      title: `Contractor Labour Report — ${monthLabel(asOf.slice(0, 7))}`, file: 'contractor_labour_report',
      rows: conRows,
      cols: [
        { header: 'Contractor', get: (r: any) => r.contractor }, { header: 'Workers', get: (r: any) => r.workers },
        { header: 'Man-Days', get: (r: any) => r.manDays }, { header: 'OT Hrs', get: (r: any) => r.ot },
        { header: 'Wage (INR)', get: (r: any) => r.wage }, { header: 'Trades', get: (r: any) => r.trades },
      ],
    }

    // Productivity report — one line per date for the snapshot month.
    const prodRows = attRows.filter(r => r.date >= mFrom).map(a => {
      const rs = byDate.get(a.date) ?? []
      const md = rs.reduce((s, r) => s + manDays(r), 0)
      const wage = rs.reduce((s, r) => s + Number(r.wage ?? 0), 0)
      const output = rs.reduce((s, r) => s + Number(r.output_qty ?? 0), 0)
      return {
        date: a.date, manDays: Math.round(md * 10) / 10, wage: Math.round(wage),
        output: Math.round(output * 100) / 100,
        costPerMD: md ? Math.round(wage / md) : 0,
        outPerMD: md ? Math.round((output / md) * 100) / 100 : 0,
      }
    })
    const productivity = {
      title: `Productivity Report — ${monthLabel(asOf.slice(0, 7))}`, file: 'productivity_report', dateField: 'date',
      rows: prodRows,
      cols: [
        { header: 'Date', get: (r: any) => r.date }, { header: 'Man-Days', get: (r: any) => r.manDays },
        { header: 'Wage (INR)', get: (r: any) => r.wage }, { header: 'Output', get: (r: any) => r.output },
        { header: 'Cost / Man-Day (INR)', get: (r: any) => r.costPerMD }, { header: 'Output / Man-Day', get: (r: any) => r.outPerMD },
      ],
    }

    return { daily, attendance, monthly, contractor, productivity }
  }, [scoped, dayRows, asOf])

  const activeReport = reportData[report]

  /* ── Guards ── */
  // Site engineers must be inside their project (matches every other module).
  if (!inHeadOffice && !activeProject) return <NoProjectPrompt />

  const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN')
  const scopeLabel = activeProject ? activeProject.name : (drill ? (projName.get(drill) || 'Project') : 'All projects')

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
        <div>
          <h1 className="font-headline text-2xl font-semibold" style={{ color: 'var(--text)' }}>Labour Status Dashboard</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-2)' }}>
            {scopeLabel} · live from attendance &amp; deployment
            <span className="inline-flex items-center gap-1 ml-2 align-middle">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> <span className="text-[11px]" style={{ color: 'var(--faint)' }}>real-time</span>
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap no-print">
          {/* Head Office can drill into one project; site engineers are already scoped. */}
          {inHeadOffice && (
            <select className="input" style={{ minWidth: 170 }} value={drill} onChange={e => setDrill(e.target.value)}>
              <option value="">All projects</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          <input className="input" type="date" value={asOf} max={iso(new Date())} onChange={e => setAsOf(e.target.value)} style={{ minWidth: 150 }} />
          <button className="btn btn-ghost" onClick={() => load()} title="Refresh">
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>refresh</span>
          </button>
          <PrintButton title={`Labour Dashboard — ${scopeLabel}`} />
        </div>
      </div>

      {loading && !rows.length ? (
        <div className="card p-8 text-center text-sm" style={{ color: 'var(--text-2)' }}>Loading labour data…</div>
      ) : (
        <>
          {/* Alerts */}
          {alerts.length > 0 && (
            <div className="mb-5 space-y-2">
              {alerts.map((a, i) => (
                <div key={i} className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg border text-[13px]"
                  style={{
                    borderColor: a.tone === 'red' ? 'rgba(248,113,113,0.3)' : 'rgba(251,191,36,0.3)',
                    background: a.tone === 'red' ? 'rgba(248,113,113,0.07)' : 'rgba(251,191,36,0.07)',
                    color: a.tone === 'red' ? '#f87171' : '#f59e0b',
                  }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>{a.icon}</span>
                  <span>{a.text}</span>
                </div>
              ))}
            </div>
          )}

          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-5">
            <Kpi label="Total Labour" value={cards.total} sub={fmtDate(asOf)} tone="var(--text)" accent="#ff8f00" />
            <Kpi label="Present" value={cards.presentHeads} sub={cards.half ? `${cards.half} half-day` : 'on site'} tone="#34d399" accent="#34d399" />
            <Kpi label="Absent" value={cards.absent} tone="#f87171" accent="#f87171" />
            <Kpi label="On Leave" value={cards.leave} tone="#38bdf8" accent="#38bdf8" />
            <Kpi label="Skilled" value={cards.skilled} tone="var(--text)" />
            <Kpi label="Unskilled" value={cards.unskilled} tone="var(--text)" />
            <Kpi label="Contractor" value={cards.contractor} tone="#a78bfa" accent="#a78bfa" />
            <Kpi label="Company" value={cards.company} tone="var(--text)" />
            <Kpi label="Male" value={cards.male} tone="var(--text)" />
            <Kpi label="Female" value={cards.female} tone="#f472b6" accent="#f472b6" />
          </div>

          {/* Attendance summary + Daily status */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-0">
            <Section title="Attendance Summary" subtitle="present ÷ deployed">
              <div className="grid grid-cols-3 gap-3">
                {[
                  { k: 'Today', v: att.today },
                  { k: 'This Week', v: att.week },
                  { k: 'This Month', v: att.month },
                ].map(x => (
                  <div key={x.k} className="rounded-lg border p-3 text-center" style={{ borderColor: 'var(--line)' }}>
                    <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--faint)' }}>{x.k}</div>
                    <div className="font-mono text-[24px] font-bold leading-none" style={{ color: x.v.pct >= LOW_ATTENDANCE_PCT ? '#34d399' : '#f59e0b' }}>{x.v.pct}%</div>
                    <div className="text-[11px] mt-1" style={{ color: 'var(--text-2)' }}>{x.v.present} / {x.v.total}</div>
                  </div>
                ))}
              </div>
            </Section>

            <Section title="Daily Labour Status" subtitle={fmtDate(asOf)}>
              <div className="grid grid-cols-5 gap-2 text-center">
                {[
                  { k: 'Present', v: daily.present, c: '#34d399' },
                  { k: 'Absent', v: daily.absent, c: '#f87171' },
                  { k: 'Half Day', v: daily.half, c: '#f59e0b' },
                  { k: 'Overtime', v: daily.ot, c: '#a78bfa', sub: daily.otHrs ? `${daily.otHrs}h` : '' },
                  { k: 'Night', v: daily.night, c: '#38bdf8' },
                ].map(x => (
                  <div key={x.k} className="rounded-lg border p-2.5" style={{ borderColor: 'var(--line)' }}>
                    <div className="font-mono text-[22px] font-bold leading-none" style={{ color: x.c }}>{x.v}</div>
                    <div className="text-[9px] font-bold uppercase tracking-wider mt-1" style={{ color: 'var(--faint)' }}>{x.k}</div>
                    {x.sub && <div className="text-[9px]" style={{ color: 'var(--text-2)' }}>{x.sub}</div>}
                  </div>
                ))}
              </div>
            </Section>
          </div>

          {/* Productivity */}
          <Section title="Productivity" subtitle={`this month · ${monthLabel(asOf.slice(0, 7))}`}>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Kpi label="Utilization" value={`${prod.utilization}%`} sub="man-days ÷ deployed" tone="#34d399" />
              <Kpi label="Cost / Labour" value={inr(prod.costPerManDay)} sub="per man-day" tone="var(--text)" />
              <Kpi label="Productivity" value={prod.hasOutput ? (Math.round(prod.productivity * 100) / 100).toString() : '—'} sub="output / man-day" tone="var(--text)" />
              <Kpi label="Output / Labour" value={prod.hasOutput ? (Math.round(prod.outputPerWorker * 100) / 100).toString() : '—'} sub="per worker" tone="var(--text)" />
            </div>
            {!prod.hasOutput && (
              <div className="text-[11px] mt-3" style={{ color: 'var(--faint)' }}>
                Add an <b>Output</b> quantity when recording labour to unlock productivity &amp; output-per-labour figures.
              </div>
            )}
          </Section>

          {/* Distribution */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <Section title="Labour by Project" subtitle="man-days · last 7 days"><BarList rows={dist.project} /></Section>
            <Section title="Labour by Trade" subtitle="man-days · last 7 days"><BarList rows={dist.trade} /></Section>
            <Section title="Labour by Contractor" subtitle="man-days · last 7 days"><BarList rows={dist.contractor} /></Section>
          </div>

          {/* Trend charts */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <Section title="Daily Labour Trend" subtitle="head-count · last 30 days"><LineChart points={dailyTrend} /></Section>
            <Section title="Weekly Labour Trend" subtitle="man-days · last 12 weeks"><ColChart points={weeklyTrend} /></Section>
            <Section title="Monthly Labour Trend" subtitle="man-days · last 12 months"><ColChart points={monthlyTrend} /></Section>
          </div>

          {/* Reports */}
          <Section
            title="Reports"
            subtitle="preview · export to Excel / PDF · print"
            right={
              <div className="flex items-center gap-2 flex-wrap no-print">
                <select className="input" style={{ minWidth: 200 }} value={report} onChange={e => setReport(e.target.value as ReportKey)}>
                  <option value="daily">Daily Labour Report</option>
                  <option value="attendance">Attendance Report</option>
                  <option value="monthly">Monthly Labour Report</option>
                  <option value="contractor">Contractor Labour Report</option>
                  <option value="productivity">Productivity Report</option>
                </select>
                <ExportButtons
                  filename={activeReport.file}
                  title={activeReport.title}
                  rows={activeReport.rows}
                  columns={activeReport.cols as any}
                  dateField={(activeReport as any).dateField}
                />
              </div>
            }
          >
            <div className="overflow-x-auto">
              <div className="text-[12px] font-semibold mb-2" style={{ color: 'var(--text)' }}>{activeReport.title}</div>
              <table className="w-full text-[12px]">
                <thead>
                  <tr>
                    {activeReport.cols.map(c => (
                      <th key={c.header} className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider whitespace-nowrap border-b"
                        style={{ color: 'var(--faint)', borderColor: 'var(--line)' }}>{c.header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activeReport.rows.slice(0, 60).map((r: any, i: number) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--line-soft)' }}>
                      {activeReport.cols.map(c => (
                        <td key={c.header} className="px-3 py-1.5 whitespace-nowrap" style={{ color: 'var(--text)' }}>{c.get(r)}</td>
                      ))}
                    </tr>
                  ))}
                  {!activeReport.rows.length && (
                    <tr><td colSpan={activeReport.cols.length} className="px-3 py-8 text-center" style={{ color: 'var(--faint)' }}>No data for this report.</td></tr>
                  )}
                </tbody>
              </table>
              {activeReport.rows.length > 60 && (
                <div className="text-[11px] mt-2" style={{ color: 'var(--faint)' }}>Showing first 60 rows · export for the full report.</div>
              )}
            </div>
          </Section>
        </>
      )}
    </div>
  )
}