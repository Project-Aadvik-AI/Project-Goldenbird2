import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { uploadPrivate, makeObjectPath } from '../lib/storage'
import { PrivateLink } from '../components/PrivateFile'
import { useAuth } from '../lib/auth'
import { useProject } from '../lib/project'
import ExportButtons from '../components/ExportButtons'
import PrintButton from '../components/PrintButton'

type Cat = {
  id: string; name: string; default_party: string
  is_eot_eligible: boolean; kind: string; colour: string
}
const PRIORITIES = ['Low', 'Medium', 'High', 'Critical']
const STATUSES = ['Open', 'In Progress', 'Resolved', 'Closed', 'Cancelled']
const PARTIES = [
  'Client', 'Consultant', 'Vendor', 'Sub-contractor',
  'Us (Internal)', 'Statutory Authority', 'Weather / Force Majeure', 'Unknown',
]

type H = {
  id: string; hindrance_no: string; hindrance_date: string; hindrance_time: string | null
  project_id: string; project_name: string | null
  title: string; description: string | null
  category: string; priority: string
  responsible_party: string; responsible_vendor_name: string | null
  status: string
  expected_resolution: string | null; actual_resolution: string | null
  location: string | null; remarks: string | null
  reported_by_name: string | null; assigned_to_name: string | null; assigned_to: string | null
  closed_by_name: string | null
  age_days: number; delay_days: number | null
  days_overdue: number | null; is_overdue: boolean
  photo_count: number; doc_count: number
  created_at: string
  // EOT — a contractual hindrance is a claim, not a diary entry
  category_id: string | null
  is_eot_claim: boolean
  notified_date: string | null
  notice_ref: string | null
  contract_clause: string | null
  eot_status: string
  eot_days_claimed: number | null
  eot_days_granted: number | null
  work_front: string | null
}
type Ev = {
  id: string; event: string; event_label: string
  from_value: string | null; to_value: string | null; comment: string | null
  actor_name: string | null; created_at: string
}
type Fl = {
  id: string; file_path: string; file_name: string; kind: string; caption: string | null
}
type Day = {
  id: string; log_date: string; day_number: number
  impact: string; men_idle: number | null; machines_idle: number | null
  hours_lost: number | null
  note: string; action_taken: string | null
  logged_by_name: string | null; photo_count: number
}
type Cost = {
  days_logged: number; days_stopped: number; days_slowed: number
  total_men_idle: number; total_machines_idle: number; total_hours_lost: number
  elapsed_days: number; days_not_logged: number
}

const IMPACT: Record<string, string> = {
  'Work Stopped': 'bg-red-500/10 text-red-400 border-red-500/25',
  'Work Slowed': 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  'No Impact Today': 'bg-white/5 text-[#dcc1ae] border-white/10',
  'Resolved Today': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
}

const ST: Record<string, string> = {
  'Open': 'bg-red-500/10 text-red-400 border-red-500/25',
  'In Progress': 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  'Resolved': 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  'Closed': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  'Cancelled': 'bg-white/5 text-[#dcc1ae]/50 border-white/10',
}
const PR: Record<string, string> = {
  'Critical': 'bg-red-500/15 text-red-400 border-red-500/30',
  'High': 'bg-amber-500/10 text-amber-400 border-amber-500/25',
  'Medium': 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  'Low': 'bg-white/5 text-[#dcc1ae] border-white/10',
}
const CAT_ICON: Record<string, string> = {
  'Material Delay': 'local_shipping', 'Labour Shortage': 'group_off',
  'Equipment Breakdown': 'build', 'Drawing Issue': 'draw',
  'Client Delay': 'business', 'Weather': 'thunderstorm',
  'Approval Delay': 'gavel', 'Safety Issue': 'health_and_safety',
  'Utility Issue': 'bolt', 'Other': 'help',
}

export default function Hindrances() {
  const { isAdmin } = useAuth()
  const { activeProject } = useProject()
  const [rows, setRows] = useState<H[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [open, setOpen] = useState<H | null>(null)
  const [fStatus, setFStatus] = useState('')
  const [fCat, setFCat] = useState('')
  const [q, setQ] = useState('')

  async function load() {
    setLoading(true)
    supabase.rpc('hindrance_scan_alerts').then(() => {})
    supabase.rpc('hindrance_scan_unlogged').then(() => {})
    supabase.from('hindrance_needs_log').select('*')
      .then(({ data }) => setNeedsLog((data as any[]) ?? []))
    supabase.from('hindrance_categories').select('*')
      .eq('active', true).order('sort_order')
      .then(({ data }) => setCats((data as Cat[]) ?? []))
    supabase.rpc('eot_scan_notifications', { p_window_days: 14 }).then(() => {})

    let query = supabase.from('hindrance_register').select('*')
      .order('hindrance_date', { ascending: false })
    if (activeProject) query = query.eq('project_id', activeProject.id)

    const { data } = await query
    setRows((data as H[]) ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [activeProject?.id])

  const filtered = useMemo(() => rows.filter(h => {
    if (fStatus && h.status !== fStatus) return false
    if (fCat && h.category !== fCat) return false
    const s = q.trim().toLowerCase()
    if (s && !`${h.hindrance_no} ${h.title} ${h.description ?? ''} ${h.assigned_to_name ?? ''}`
      .toLowerCase().includes(s)) return false
    return true
  }), [rows, fStatus, fCat, q])

  const [needsLog, setNeedsLog] = useState<any[]>([])
  const [cats, setCats] = useState<Cat[]>([])

  const kpi = useMemo(() => ({
    total: rows.length,
    open: rows.filter(h => h.status === 'Open' || h.status === 'In Progress').length,
    closed: rows.filter(h => h.status === 'Closed').length,
    overdue: rows.filter(h => h.is_overdue).length,
    critical: rows.filter(h => h.priority === 'Critical' && ['Open', 'In Progress'].includes(h.status)).length,
    totalDelay: rows.reduce((n, h) => n + Number(h.delay_days || 0), 0),
  }), [rows])

  // who is causing the delays?
  const byParty = useMemo(() => {
    const m: Record<string, { n: number; days: number }> = {}
    for (const h of rows) {
      if (h.status === 'Cancelled') continue
      const p = h.responsible_party
      if (!m[p]) m[p] = { n: 0, days: 0 }
      m[p].n++
      m[p].days += Number(h.delay_days || 0)
    }
    return Object.entries(m).sort((a, b) => b[1].days - a[1].days)
  }, [rows])

  const byCat = useMemo(() => {
    const m: Record<string, number> = {}
    for (const h of rows) {
      if (h.status === 'Cancelled') continue
      m[h.category] = (m[h.category] ?? 0) + 1
    }
    return Object.entries(m).sort((a, b) => b[1] - a[1])
  }, [rows])

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="font-headline text-2xl font-semibold text-[#e2e2e8]">Hindrance Register</h1>
          <p className="text-sm text-[#dcc1ae] mt-0.5">
            Every obstacle that cost you time — who caused it, how long it took, and the evidence.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>report</span>
          Raise a Hindrance
        </button>
      </div>

      {rows.filter(h => h.is_eot_claim && !h.notified_date
                     && !['Closed','Cancelled'].includes(h.status)).length > 0 && (
        <div className="card p-4 mb-4 bg-red-500/10 border-red-500/30">
          <div className="flex items-start gap-2">
            <span className="material-symbols-outlined text-red-400" style={{ fontSize: '20px' }}>gavel</span>
            <div className="flex-1">
              <b className="text-red-400 text-[13px]">
                {rows.filter(h => h.is_eot_claim && !h.notified_date
                               && !['Closed','Cancelled'].includes(h.status)).length}{' '}
                EOT claim(s) — the client has NOT been formally notified
              </b>
              <p className="text-[12px] text-[#dcc1ae] mt-1">
                Most contracts <b className="text-[#e2e2e8]">void an extension-of-time claim</b> if you
                did not notify the client within the stipulated window. Your evidence does not matter
                if the notice was late.
              </p>
              <div className="mt-2 space-y-1">
                {rows.filter(h => h.is_eot_claim && !h.notified_date
                               && !['Closed','Cancelled'].includes(h.status))
                  .slice(0, 5).map(h => (
                    <div key={h.id} className="flex items-center justify-between gap-3 text-[12px]">
                      <span className="text-[#e2e2e8] truncate">
                        {h.title}
                        <span className="text-red-400"> · raised {h.age_days}d ago</span>
                      </span>
                      <button className="text-[#ffb87b] text-[11px] font-semibold uppercase hover:underline whitespace-nowrap"
                        onClick={() => setOpen(h)}>
                        Record the notice
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {needsLog.length > 0 && (
        <div className="card p-4 mb-4 bg-amber-500/5 border-amber-500/25">
          <div className="flex items-start gap-2">
            <span className="material-symbols-outlined text-amber-400" style={{ fontSize: '20px' }}>edit_calendar</span>
            <div className="flex-1">
              <b className="text-amber-400 text-[13px]">
                {needsLog.length} open hindrance(s) have no entry for today
              </b>
              <p className="text-[12px] text-[#dcc1ae] mt-1">
                If it is still stopping work, say so — <b className="text-[#e2e2e8]">every day</b>.
                A gap in the record is a gap in the claim.
              </p>
              <div className="mt-2 space-y-1">
                {needsLog.slice(0, 5).map(n => {
                  const h = rows.find(r => r.id === n.hindrance_id)
                  return (
                    <div key={n.hindrance_id} className="flex items-center justify-between gap-3 text-[12px]">
                      <span className="text-[#e2e2e8] truncate">
                        {n.title}
                        <span className="text-[#dcc1ae]/50"> · open {n.days_open}d</span>
                      </span>
                      {h && (
                        <button className="text-[#ffb87b] text-[11px] font-semibold uppercase hover:underline whitespace-nowrap"
                          onClick={() => setOpen(h)}>
                          Log today
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {kpi.critical > 0 && (
        <div className="card p-3 mb-4 bg-red-500/10 border-red-500/25 flex items-start gap-2">
          <span className="material-symbols-outlined text-red-400" style={{ fontSize: '18px' }}>priority_high</span>
          <div className="text-[13px]">
            <b className="text-red-400">{kpi.critical} CRITICAL hindrance(s) are still open</b>
            <span className="text-[#dcc1ae]"> — these are stopping work.</span>
          </div>
        </div>
      )}
      {kpi.overdue > 0 && (
        <div className="card p-3 mb-4 bg-amber-500/5 border-amber-500/20 flex items-start gap-2">
          <span className="material-symbols-outlined text-amber-400" style={{ fontSize: '18px' }}>schedule</span>
          <div className="text-[13px]">
            <b className="text-amber-400">{kpi.overdue} hindrance(s) are past their expected resolution date</b>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5">
        <K label="Total" value={String(kpi.total)} />
        <K label="Open" value={String(kpi.open)} tone={kpi.open ? 'red' : undefined} />
        <K label="Closed" value={String(kpi.closed)} tone="emerald" />
        <K label="Overdue" value={String(kpi.overdue)} tone={kpi.overdue ? 'amber' : undefined} />
        <K label="Days Lost" value={String(kpi.totalDelay)} big />
      </div>

      {/* who is to blame — the number that matters in a delay claim */}
      {byParty.length > 0 && kpi.totalDelay > 0 && (
        <div className="card p-4 mb-5">
          <div className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider mb-1">
            Days Lost, by Responsible Party
          </div>
          <p className="text-[11px] text-[#dcc1ae]/60 mb-3">
            This is the table you produce when a client disputes a delay claim.
          </p>
          <div className="space-y-2">
            {byParty.filter(([, d]) => d.days > 0).map(([party, d]) => (
              <div key={party} className="flex items-center gap-3">
                <span className="text-[12px] text-[#dcc1ae] w-40 truncate">{party}</span>
                <div className="flex-1 h-2 rounded-full bg-white/[0.06] overflow-hidden">
                  <div className={`h-full rounded-full ${
                    party === 'Us (Internal)' ? 'bg-red-500' : 'bg-[#ff8f00]'}`}
                    style={{ width: `${d.days / kpi.totalDelay * 100}%` }} />
                </div>
                <span className="text-[11px] text-[#dcc1ae]/60 w-14 text-right">{d.n} issue(s)</span>
                <span className="font-mono text-[13px] font-bold text-[#e2e2e8] w-16 text-right">
                  {d.days}d
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* filters */}
      <div className="flex flex-wrap gap-2 items-center mb-4">
        {['', ...STATUSES].map(s => (
          <button key={s || 'all'} onClick={() => setFStatus(s)}
            className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold border ${
              fStatus === s ? (s ? ST[s] : 'bg-[#ff8f00]/10 text-[#ffb87b] border-[#ff8f00]/30')
                : 'text-[#dcc1ae] border-white/[0.08] hover:bg-white/[0.03]'}`}>
            {s || 'All'} ({s ? rows.filter(h => h.status === s).length : rows.length})
          </button>
        ))}
        <select className="input" style={{ maxWidth: 170, padding: '6px 10px', fontSize: '13px' }}
          value={fCat} onChange={e => setFCat(e.target.value)}>
          <option value="">All categories</option>
          {byCat.map(([c, n]) => <option key={c} value={c}>{c} ({n})</option>)}
        </select>
        <input className="input" style={{ maxWidth: 180, padding: '6px 10px', fontSize: '13px' }}
          value={q} onChange={e => setQ(e.target.value)} placeholder="Search…" />
        <div className="ml-auto flex gap-2">
          <ExportButtons filename="hindrance-register" title="Hindrance Register" rows={filtered}
            columns={[
              { header: 'Hindrance No.', get: (r: any) => r.hindrance_no },
              { header: 'Date', get: (r: any) => r.hindrance_date },
              { header: 'Time', get: (r: any) => r.hindrance_time || '—' },
              { header: 'Project', get: (r: any) => r.project_name || '—' },
              { header: 'Title', get: (r: any) => r.title },
              { header: 'Description', get: (r: any) => r.description || '—' },
              { header: 'Category', get: (r: any) => r.category },
              { header: 'Priority', get: (r: any) => r.priority },
              { header: 'Responsible Party', get: (r: any) => r.responsible_party },
              { header: 'Vendor', get: (r: any) => r.responsible_vendor_name || '—' },
              { header: 'Reported By', get: (r: any) => r.reported_by_name || '—' },
              { header: 'Assigned To', get: (r: any) => r.assigned_to_name || '—' },
              { header: 'Status', get: (r: any) => r.status },
              { header: 'Expected Resolution', get: (r: any) => r.expected_resolution || '—' },
              { header: 'Actual Resolution', get: (r: any) => r.actual_resolution || '—' },
              { header: 'Age (days)', get: (r: any) => Number(r.age_days) },
              { header: 'Days Lost', get: (r: any) => r.delay_days ?? '—' },
              { header: 'Days Overdue', get: (r: any) => r.days_overdue ?? '—' },
              { header: 'Location', get: (r: any) => r.location || '—' },
              { header: 'Photos', get: (r: any) => Number(r.photo_count) },
              { header: 'Documents', get: (r: any) => Number(r.doc_count) },
              { header: 'Remarks', get: (r: any) => r.remarks || '—' },
            ]} />
          <PrintButton />
        </div>
      </div>

      <div className="card overflow-hidden overflow-x-auto">
        {loading ? <div className="p-6 text-[#dcc1ae] text-sm">Loading…</div> : (
          <table className="w-full text-sm">
            <thead className="bg-[#282a2e]"><tr>
              {['Hindrance', 'Category', 'Responsible', 'Assigned To', 'Expected', 'Age', 'Status', ''].map(h => (
                <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr></thead>
            <tbody className="divide-y divide-white/[0.05]">
              {filtered.map(h => (
                <tr key={h.id}
                  className={`hover:bg-white/[0.02] cursor-pointer ${
                    h.is_overdue ? 'bg-red-500/[0.05]' : ''}`}
                  onClick={() => setOpen(h)}>
                  <td className="px-4 py-2.5 max-w-[240px]">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[#e2e2e8] font-semibold truncate">{h.title}</span>
                      {h.priority === 'Critical' && (
                        <span className="material-symbols-outlined text-red-400 shrink-0"
                          style={{ fontSize: '14px' }}>priority_high</span>
                      )}
                    </div>
                    <div className="text-[10px] font-mono text-[#dcc1ae]/50">
                      {h.hindrance_no} · {h.hindrance_date}
                      {h.photo_count > 0 && ` · ${h.photo_count} photo(s)`}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5 text-[12px] text-[#dcc1ae]">
                      <span className="material-symbols-outlined text-[#dcc1ae]/50"
                        style={{ fontSize: '15px' }}>{CAT_ICON[h.category] ?? 'help'}</span>
                      <span className="truncate">{h.category}</span>
                    </div>
                    <span className={`inline-block mt-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border ${PR[h.priority]}`}>
                      {h.priority}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-[12px]">
                    <span className={h.responsible_party === 'Us (Internal)' ? 'text-red-400' : 'text-[#dcc1ae]'}>
                      {h.responsible_party}
                    </span>
                    {h.responsible_vendor_name && (
                      <div className="text-[10px] text-[#dcc1ae]/50">{h.responsible_vendor_name}</div>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-[12px] text-[#dcc1ae]">
                    {h.assigned_to_name || <span className="text-amber-400">unassigned</span>}
                  </td>
                  <td className={`px-4 py-2.5 font-mono text-[12px] whitespace-nowrap ${
                    h.is_overdue ? 'text-red-400 font-bold' : 'text-[#dcc1ae]'}`}>
                    {h.expected_resolution || '—'}
                    {h.is_overdue && <div className="text-[10px]">{h.days_overdue}d late</div>}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-right whitespace-nowrap">
                    <span className="text-[#e2e2e8]">{h.age_days}d</span>
                    {h.delay_days != null && (
                      <div className="text-[10px] text-amber-400">{h.delay_days}d lost</div>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border whitespace-nowrap ${ST[h.status]}`}>
                      {h.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <span className="material-symbols-outlined text-[#dcc1ae]/40" style={{ fontSize: '18px' }}>chevron_right</span>
                  </td>
                </tr>
              ))}
              {!filtered.length && <tr><td colSpan={8} className="px-4 py-12 text-center text-[#dcc1ae]/60 text-sm">
                No hindrances. That is either very good news, or nobody is recording them.
              </td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {showForm && <HinForm onClose={() => setShowForm(false)}
        onSaved={() => { setShowForm(false); load() }} />}
      {open && <HinDetail h={open} onClose={() => setOpen(null)}
        onChanged={() => { setOpen(null); load() }} />}
    </div>
  )
}

// =====================================================================
//  DETAIL + TIMELINE
// =====================================================================
function HinDetail({ h, onClose, onChanged }: {
  h: H; onClose: () => void; onChanged: () => void
}) {
  const [events, setEvents] = useState<Ev[]>([])
  const [files, setFiles] = useState<Fl[]>([])
  const [days, setDays] = useState<Day[]>([])
  const [cost, setCost] = useState<Cost | null>(null)
  const [showLog, setShowLog] = useState(false)
  const [people, setPeople] = useState<{ id: string; full_name: string }[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const [status, setStatus] = useState(h.status)
  const [assignedTo, setAssignedTo] = useState(h.assigned_to ?? '')
  const [expected, setExpected] = useState(h.expected_resolution ?? '')
  const [remarks, setRemarks] = useState(h.remarks ?? '')

  useEffect(() => {
    (async () => {
      const [{ data: e }, { data: f }, { data: p }, { data: d }, { data: c }] = await Promise.all([
        supabase.from('hindrance_timeline').select('*')
          .eq('hindrance_id', h.id).order('created_at'),
        supabase.from('hindrance_files').select('*').eq('hindrance_id', h.id),
        supabase.from('profiles').select('id, full_name').order('full_name'),
        supabase.from('hindrance_daily_log').select('*')
          .eq('hindrance_id', h.id).order('log_date', { ascending: false }),
        supabase.from('hindrance_cost').select('*')
          .eq('hindrance_id', h.id).maybeSingle(),
      ])
      setEvents((e as Ev[]) ?? [])
      setFiles((f as Fl[]) ?? [])
      setPeople((p as any[]) ?? [])
      setDays((d as Day[]) ?? [])
      setCost(c as Cost)
    })()
  }, [h.id])

  async function reload() {
    const [{ data: d }, { data: c }, { data: e }] = await Promise.all([
      supabase.from('hindrance_daily_log').select('*')
        .eq('hindrance_id', h.id).order('log_date', { ascending: false }),
      supabase.from('hindrance_cost').select('*').eq('hindrance_id', h.id).maybeSingle(),
      supabase.from('hindrance_timeline').select('*')
        .eq('hindrance_id', h.id).order('created_at'),
    ])
    setDays((d as Day[]) ?? [])
    setCost(c as Cost)
    setEvents((e as Ev[]) ?? [])
  }

  async function save() {
    if (status === 'Cancelled' && !remarks.trim()) {
      setErr('Give a reason for cancelling.'); return
    }
    setBusy(true); setErr(null)
    const { error } = await supabase.from('hindrances').update({
      status,
      assigned_to: assignedTo || null,
      expected_resolution: expected || null,
      remarks: remarks || null,
      cancel_reason: status === 'Cancelled' ? remarks : null,
    }).eq('id', h.id)
    setBusy(false)
    if (error) { setErr(error.message); return }
    onChanged()
  }

  const photos = files.filter(f => f.kind === 'Photo')
  const docs = files.filter(f => f.kind === 'Document')

  return createPortal((
    <div className="fixed inset-0 z-[100] flex items-start justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto" onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="bg-[#1B1F2A] border border-white/[0.08] rounded-2xl w-full max-w-2xl my-6 shadow-[0px_10px_30px_rgba(0,0,0,0.5)]">
        <div className="px-5 py-4 border-b border-white/[0.06] flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-headline text-lg font-semibold text-[#e2e2e8]">{h.title}</h3>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${ST[h.status]}`}>
                {h.status}
              </span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${PR[h.priority]}`}>
                {h.priority}
              </span>
            </div>
            <p className="text-[12px] text-[#dcc1ae] mt-0.5">
              <span className="font-mono">{h.hindrance_no}</span> · {h.hindrance_date}
              {h.hindrance_time && ` ${h.hindrance_time.slice(0, 5)}`}
              {h.project_name && ` · ${h.project_name}`}
            </p>
          </div>
          <div className="flex gap-2">
            <PrintButton title={h.hindrance_no} />
            <button className="text-[#dcc1ae] hover:text-white" onClick={onClose}>
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
        </div>

        <div className="p-5 space-y-5">
          {h.is_overdue && (
            <div className="card p-3 bg-red-500/10 border-red-500/25 text-[12px] text-red-400">
              <b>{h.days_overdue} day(s) past the expected resolution date.</b>
            </div>
          )}

          {h.description && (
            <div>
              <Sec>What happened</Sec>
              <p className="text-[13px] text-[#dcc1ae] whitespace-pre-wrap">{h.description}</p>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Info label="Category" v={h.category} />
            <Info label="Responsible" v={h.responsible_party}
              red={h.responsible_party === 'Us (Internal)'} />
            <Info label="Reported By" v={h.reported_by_name ?? '—'} />
            <Info label="Days Open" v={`${h.age_days}d`} />
            {h.location && <Info label="Location" v={h.location} />}
            {h.responsible_vendor_name && <Info label="Vendor" v={h.responsible_vendor_name} />}
            {h.actual_resolution && <Info label="Resolved" v={h.actual_resolution} />}
            {h.delay_days != null && <Info label="Days Lost" v={`${h.delay_days}d`} amber />}
          </div>

          {/* photos */}
          {photos.length > 0 && (
            <div>
              <Sec>Photos ({photos.length})</Sec>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {photos.map(f => (
                  <PrivateLink key={f.id} bucket="hindrance-files" path={f.file_path}
                    className="block rounded-lg border border-white/[0.08] p-2 hover:bg-white/[0.03] text-center">
                    <span className="material-symbols-outlined text-[#ffb87b]" style={{ fontSize: '22px' }}>image</span>
                    <div className="text-[10px] text-[#dcc1ae] truncate mt-0.5">
                      {f.caption || f.file_name}
                    </div>
                  </PrivateLink>
                ))}
              </div>
            </div>
          )}

          {docs.length > 0 && (
            <div>
              <Sec>Documents ({docs.length})</Sec>
              <div className="space-y-1">
                {docs.map(f => (
                  <PrivateLink key={f.id} bucket="hindrance-files" path={f.file_path}
                    className="flex items-center gap-2 text-[12px] text-[#ffb87b] hover:underline">
                    <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>description</span>
                    {f.file_name}
                  </PrivateLink>
                ))}
              </div>
            </div>
          )}

          {/* update it */}
          {h.status !== 'Closed' && h.status !== 'Cancelled' && (
            <div className="pt-4 border-t border-white/[0.06]">
              <Sec>Update</Sec>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <F label="Status">
                  <select className="input" value={status} onChange={e => setStatus(e.target.value)}>
                    {STATUSES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </F>
                <F label="Assigned To">
                  <select className="input" value={assignedTo} onChange={e => setAssignedTo(e.target.value)}>
                    <option value="">— Nobody —</option>
                    {people.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                  </select>
                </F>
                <F label="Expected Resolution">
                  <input type="date" className="input" value={expected}
                    onChange={e => setExpected(e.target.value)} />
                </F>
              </div>
              <div className="mt-3">
                <F label={status === 'Cancelled' ? 'Reason for cancelling *' : 'Remarks'}>
                  <input className="input" value={remarks} onChange={e => setRemarks(e.target.value)} />
                </F>
              </div>

              {expected !== (h.expected_resolution ?? '') && h.expected_resolution && (
                <p className="text-[11px] text-amber-400 mt-2">
                  You are moving the expected date. That slip will be recorded in the timeline.
                </p>
              )}

              {err && <div className="text-sm text-red-400 mt-2">{err}</div>}
              <button className="btn btn-primary mt-3" disabled={busy} onClick={save}>
                {busy ? 'Saving…' : 'Save Update'}
              </button>
            </div>
          )}

          {/* ---- THE DAILY RECORD — this is the evidence ---- */}
          <div className="pt-4 border-t border-white/[0.06]">
            <div className="flex items-center justify-between mb-3">
              <div>
                <span className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider">
                  Daily Record
                </span>
                <p className="text-[11px] text-[#dcc1ae]/60 mt-0.5">
                  Still not resolved? Log another day. Do not raise a second hindrance.
                </p>
              </div>
              {!['Closed', 'Cancelled'].includes(h.status) && (
                <button className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '12px' }}
                  onClick={() => setShowLog(true)}>
                  <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>edit_calendar</span>
                  Log Today
                </button>
              )}
            </div>

            {cost && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                <Mini label="Days Blocked" v={String(cost.elapsed_days)} amber />
                <Mini label="Days Logged" v={`${cost.days_logged} / ${cost.elapsed_days}`}
                  red={cost.days_not_logged > 0} />
                <Mini label="Work Stopped" v={`${cost.days_stopped}d`} />
                <Mini label="Men Idle (total)" v={String(cost.total_men_idle)} />
              </div>
            )}

            {cost && cost.days_not_logged > 0 && (
              <div className="card p-2.5 mb-3 bg-red-500/5 border-red-500/20 text-[12px] text-red-400">
                <b>{cost.days_not_logged} day(s) have no entry.</b>
                <span className="text-[#dcc1ae]">
                  {' '}Those days cannot be claimed — there is no record they cost you anything.
                </span>
              </div>
            )}

            {days.length > 0 ? (
              <div className="rounded-lg border border-white/[0.08] overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-[#282a2e]"><tr>
                    {['Day', 'Date', 'Impact', 'Idle', 'What happened'].map(x => (
                      <th key={x} className="px-3 py-2 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{x}</th>
                    ))}
                  </tr></thead>
                  <tbody className="divide-y divide-white/[0.04]">
                    {days.map(d => (
                      <tr key={d.id} className="hover:bg-white/[0.02]">
                        <td className="px-3 py-2 font-mono text-[12px] font-bold text-[#ffb87b]">
                          {d.day_number}
                        </td>
                        <td className="px-3 py-2 font-mono text-[12px] text-[#dcc1ae] whitespace-nowrap">
                          {d.log_date}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border whitespace-nowrap ${IMPACT[d.impact]}`}>
                            {d.impact}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-[11px] text-[#dcc1ae] whitespace-nowrap">
                          {d.men_idle ? `${d.men_idle} men` : ''}
                          {d.machines_idle ? `${d.men_idle ? ' · ' : ''}${d.machines_idle} m/c` : ''}
                          {!d.men_idle && !d.machines_idle && '—'}
                        </td>
                        <td className="px-3 py-2 text-[12px] text-[#e2e2e8] max-w-[220px]">
                          <div className="truncate" title={d.note}>{d.note}</div>
                          {d.action_taken && (
                            <div className="text-[10px] text-[#dcc1ae]/60 truncate">→ {d.action_taken}</div>
                          )}
                          <div className="text-[10px] text-[#dcc1ae]/40">{d.logged_by_name}</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-white/[0.12] p-4 text-center">
                <p className="text-[12px] text-[#dcc1ae]/70">
                  No daily entries yet. If this is still blocking work,
                  <b className="text-[#dcc1ae]"> log it every day</b> — that record is your evidence.
                </p>
              </div>
            )}
          </div>

          {/* the timeline */}
          <div className="pt-4 border-t border-white/[0.06]">
            <Sec>Timeline</Sec>
            <div className="relative pl-5">
              <div className="absolute left-[5px] top-1 bottom-1 w-px bg-white/[0.08]" />
              {events.map(e => (
                <div key={e.id} className="relative pb-4 last:pb-0">
                  <div className={`absolute -left-5 top-1 h-3 w-3 rounded-full border-2 bg-[#1B1F2A] ${
                    e.event === 'created' ? 'border-blue-400'
                      : e.event === 'resolved' ? 'border-emerald-400'
                      : e.event === 'closed' ? 'border-emerald-400'
                      : e.event === 'cancelled' ? 'border-red-400'
                      : 'border-[#ff8f00]/50'}`} />
                  <div className="text-[13px] text-[#e2e2e8]">
                    {e.event_label}
                    {e.from_value && e.to_value && (
                      <span className="text-[#dcc1ae]">
                        : <span className="text-red-400/70">{e.from_value}</span>
                        {' → '}
                        <span className="text-emerald-400/80">{e.to_value}</span>
                      </span>
                    )}
                    {!e.from_value && e.to_value && (
                      <span className="text-[#dcc1ae]">: {e.to_value}</span>
                    )}
                  </div>
                  {e.comment && (
                    <div className="text-[12px] text-[#dcc1ae] italic">"{e.comment}"</div>
                  )}
                  <div className="text-[11px] text-[#dcc1ae]/50">
                    {e.actor_name ?? 'Someone'} · {new Date(e.created_at).toLocaleString('en-IN', {
                      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {showLog && <DayLogForm h={h} onClose={() => setShowLog(false)}
        onSaved={() => { setShowLog(false); reload() }} />}
    </div>
  ), document.body)
}

// =====================================================================
//  LOG ANOTHER DAY
//
//  One hindrance, many days. "Cement still not here" on day 4 is not a
//  new hindrance — it is day 4 of the same one.
// =====================================================================
function DayLogForm({ h, onClose, onSaved }: {
  h: H; onClose: () => void; onSaved: () => void
}) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [impact, setImpact] = useState('Work Stopped')
  const [note, setNote] = useState('')
  const [action, setAction] = useState('')
  const [men, setMen] = useState('')
  const [machines, setMachines] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!note.trim()) { setErr('Say what happened today. A blank entry proves nothing.'); return }

    setBusy(true); setErr(null)
    const { error } = await supabase.rpc('log_hindrance_day', {
      p_hindrance: h.id,
      p_note: note.trim(),
      p_impact: impact,
      p_date: date,
      p_men: Number(men) || null,
      p_machines: Number(machines) || null,
      p_hours: null,
      p_action: action || null,
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    onSaved()
  }

  return createPortal((
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <form onClick={e => e.stopPropagation()} onSubmit={save}
        className="bg-[#1B1F2A] border border-white/[0.08] rounded-2xl w-full max-w-md p-5 shadow-[0px_10px_30px_rgba(0,0,0,0.5)]">
        <h3 className="font-headline text-lg font-semibold text-[#e2e2e8] mb-1">Log Another Day</h3>
        <p className="text-[12px] text-[#dcc1ae] mb-4">
          <b className="text-[#e2e2e8]">{h.title}</b>
          <br />Raised {h.hindrance_date} · open {h.age_days} day(s)
        </p>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <F label="Date">
              <input type="date" className="input" value={date}
                onChange={e => setDate(e.target.value)} max={new Date().toISOString().slice(0, 10)} />
            </F>
            <F label="Impact today *">
              <select className="input" value={impact} onChange={e => setImpact(e.target.value)}>
                <option>Work Stopped</option>
                <option>Work Slowed</option>
                <option>No Impact Today</option>
                <option>Resolved Today</option>
              </select>
            </F>
          </div>

          <F label="What happened today? *">
            <textarea className="input" rows={3} value={note} onChange={e => setNote(e.target.value)}
              placeholder="Land still not handed over. Spoke to the SDM's office — they say the survey is pending." />
          </F>

          <F label="What did we do about it?">
            <input className="input" value={action} onChange={e => setAction(e.target.value)}
              placeholder="Reminder letter sent, ref AAD/2026/044" />
          </F>

          <div className="grid grid-cols-2 gap-3">
            <F label="Men idle">
              <input className="input mono text-right" inputMode="numeric" value={men}
                onChange={e => setMen(e.target.value.replace(/[^\d]/g, ''))} />
            </F>
            <F label="Machines idle">
              <input className="input mono text-right" inputMode="numeric" value={machines}
                onChange={e => setMachines(e.target.value.replace(/[^\d]/g, ''))} />
            </F>
          </div>

          {impact === 'Resolved Today' && (
            <div className="card p-2.5 bg-emerald-500/5 border-emerald-500/20 text-[12px] text-emerald-400">
              This will mark the hindrance <b>Resolved</b>, dated {date}.
            </div>
          )}

          <p className="text-[11px] text-[#dcc1ae]/50">
            Counting idle men and machines is what turns "we lost time" into a number
            you can actually claim.
          </p>
        </div>

        {err && <div className="text-sm text-red-400 mt-3">{err}</div>}
        <div className="flex gap-2 mt-5">
          <button type="button" className="btn btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary flex-[2]" disabled={busy}>
            {busy ? 'Saving…' : 'Log This Day'}
          </button>
        </div>
      </form>
    </div>
  ), document.body)
}

// =====================================================================
//  RAISE A HINDRANCE
// =====================================================================
function HinForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { activeProject } = useProject()
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([])
  const [people, setPeople] = useState<{ id: string; full_name: string }[]>([])
  const [vendors, setVendors] = useState<{ id: string; name: string }[]>([])

  const [cats, setCats] = useState<Cat[]>([])
  const [projectId, setProjectId] = useState(activeProject?.id ?? '')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [time, setTime] = useState(new Date().toTimeString().slice(0, 5))
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [priority, setPriority] = useState('Medium')
  const [party, setParty] = useState('Unknown')
  const [vendorId, setVendorId] = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  const [expected, setExpected] = useState('')
  const [location, setLocation] = useState('')
  const [photos, setPhotos] = useState<File[]>([])
  const [docs, setDocs] = useState<File[]>([])
  const [workFront, setWorkFront] = useState('')
  const [notifiedDate, setNotifiedDate] = useState('')
  const [noticeRef, setNoticeRef] = useState('')
  const [clause, setClause] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const selCat = cats.find(c => c.id === categoryId) ?? null

  useEffect(() => {
    (async () => {
      const [{ data: p }, { data: u }, { data: v }, { data: c }] = await Promise.all([
        supabase.from('projects').select('id, name').eq('status', 'Active').order('name'),
        supabase.from('profiles').select('id, full_name').order('full_name'),
        supabase.from('acc_parties').select('id, name')
          .in('party_type', ['Vendor', 'Both']).eq('status', 'Active').order('name'),
        supabase.from('hindrance_categories').select('*')
          .eq('active', true).order('sort_order'),
      ])
      setProjects((p as any[]) ?? [])
      setPeople((u as any[]) ?? [])
      setVendors((v as any[]) ?? [])
      setCats((c as Cat[]) ?? [])
    })()
  }, [])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!projectId) { setErr('Which project?'); return }
    if (!title.trim()) { setErr('What is the problem?'); return }
    if (!categoryId) { setErr('Which category?'); return }

    setBusy(true); setErr(null)

    const { data: u } = await supabase.auth.getUser()
    const uid = u?.user?.id
    const { data: prof } = await supabase.from('profiles')
      .select('org_id').eq('id', uid ?? '').maybeSingle()

    const { data: no, error: nErr } = await supabase.rpc('next_hindrance_no')
    if (nErr) { setErr(nErr.message); setBusy(false); return }

    const { data: h, error } = await supabase.from('hindrances').insert({
      org_id: prof?.org_id,
      project_id: projectId,
      hindrance_no: no,
      hindrance_date: date,
      hindrance_time: time || null,
      title: title.trim(),
      description: description || null,
      category_id: categoryId || null,
      category: selCat?.name ?? 'Other',
      priority,
      responsible_party: party,
      work_front: workFront || null,
      notified_date: notifiedDate || null,
      notice_ref: noticeRef || null,
      contract_clause: clause || null,
      eot_status: notifiedDate ? 'Notified' : 'Not Claimed',
      responsible_vendor: party === 'Vendor' ? (vendorId || null) : null,
      reported_by: uid,
      assigned_to: assignedTo || null,
      expected_resolution: expected || null,
      location: location || null,
      status: 'Open',
      created_by: uid,
    }).select('id').single()

    if (error) { setErr(error.message); setBusy(false); return }
    const hid = (h as any).id

    // photos and documents
    const all = [
      ...photos.map(f => ({ f, kind: 'Photo' })),
      ...docs.map(f => ({ f, kind: 'Document' })),
    ]
    for (const { f, kind } of all) {
      const path = makeObjectPath(prof?.org_id, f, 'hindrances')
      const { path: stored, error: upErr } = await uploadPrivate('hindrance-files', path, f)
      if (upErr) continue
      await supabase.from('hindrance_files').insert({
        org_id: prof?.org_id, hindrance_id: hid,
        file_path: stored ?? null, file_name: f.name,
        mime_type: f.type, file_size: f.size,
        kind, uploaded_by: uid,
      })
    }

    setBusy(false)
    onSaved()
  }

  return createPortal((
    <div className="fixed inset-0 z-[100] flex items-start justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto" onClick={onClose}>
      <form onClick={e => e.stopPropagation()} onSubmit={save}
        className="bg-[#1B1F2A] border border-white/[0.08] rounded-2xl w-full max-w-2xl my-6 shadow-[0px_10px_30px_rgba(0,0,0,0.5)]">
        <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between sticky top-0 bg-[#1B1F2A] z-10">
          <div>
            <h3 className="font-headline text-lg font-semibold text-[#e2e2e8]">Raise a Hindrance</h3>
            <p className="text-[11px] text-[#dcc1ae]/60">
              Record it now, with photos. This is your evidence if the delay is disputed later.
            </p>
          </div>
          <button type="button" className="text-[#dcc1ae] hover:text-white" onClick={onClose}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="p-5 space-y-4">
          <F label="What is the problem? *">
            <input className="input" value={title} onChange={e => setTitle(e.target.value)}
              placeholder="Cement delivery 3 days late — slab pour stopped" autoFocus />
          </F>

          <F label="What happened?">
            <textarea className="input" rows={3} value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Be specific. Dates, quantities, who you spoke to, what they said." />
          </F>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="sm:col-span-2">
              <F label="Project *">
                <select className="input" value={projectId} onChange={e => setProjectId(e.target.value)}>
                  <option value="">— Select —</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </F>
            </div>
            <F label="Date">
              <input type="date" className="input" value={date} onChange={e => setDate(e.target.value)} />
            </F>
            <F label="Time">
              <input type="time" className="input" value={time} onChange={e => setTime(e.target.value)} />
            </F>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <F label="Category *">
              <select className="input" value={categoryId}
                onChange={e => {
                  setCategoryId(e.target.value)
                  const c = cats.find(x => x.id === e.target.value)
                  if (c) setParty(c.default_party)
                }}>
                <option value="">— Select —</option>
                {['Contractual', 'External', 'Site'].map(kind => {
                  const group = cats.filter(c => c.kind === kind)
                  if (!group.length) return null
                  return (
                    <optgroup key={kind} label={
                      kind === 'Contractual' ? 'Contractual — the client failed an obligation'
                        : kind === 'External' ? 'External — nobody\'s fault'
                        : 'Site — ours to fix'
                    }>
                      {group.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name}{c.is_eot_eligible ? ' (EOT)' : ''}
                        </option>
                      ))}
                    </optgroup>
                  )
                })}
              </select>
              {selCat?.is_eot_eligible && (
                <p className="text-[11px] text-amber-400 mt-1">
                  This entitles you to an <b>Extension of Time</b>. Notify the client formally,
                  and record the notice date.
                </p>
              )}
            </F>
            <F label="Priority">
              <select className="input" value={priority} onChange={e => setPriority(e.target.value)}>
                {PRIORITIES.map(p => <option key={p}>{p}</option>)}
              </select>
            </F>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <F label="Whose fault is it? *">
              <select className="input" value={party} onChange={e => setParty(e.target.value)}>
                {PARTIES.map(p => <option key={p}>{p}</option>)}
              </select>
              <p className="text-[11px] text-[#dcc1ae]/50 mt-1">
                This is the field that decides a delay claim. Be honest — including when it is us.
              </p>
            </F>
            {party === 'Vendor' && (
              <F label="Which vendor?">
                <select className="input" value={vendorId} onChange={e => setVendorId(e.target.value)}>
                  <option value="">— Select —</option>
                  {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </F>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <F label="Assign To">
              <select className="input" value={assignedTo} onChange={e => setAssignedTo(e.target.value)}>
                <option value="">— Nobody yet —</option>
                {people.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </select>
            </F>
            <F label="Expected Resolution">
              <input type="date" className="input" value={expected}
                onChange={e => setExpected(e.target.value)} />
            </F>
            <F label="Location">
              <input className="input" value={location} onChange={e => setLocation(e.target.value)}
                placeholder="Block A, 3rd floor" />
            </F>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <F label="Photos">
              <input type="file" multiple className="input" accept="image/*"
                onChange={e => setPhotos(Array.from(e.target.files ?? []))} />
              {photos.length > 0 && (
                <p className="text-[11px] text-[#dcc1ae]/60 mt-1">{photos.length} photo(s)</p>
              )}
            </F>
            <F label="Documents">
              <input type="file" multiple className="input" accept=".pdf,.doc,.docx,.xlsx"
                onChange={e => setDocs(Array.from(e.target.files ?? []))} />
              {docs.length > 0 && (
                <p className="text-[11px] text-[#dcc1ae]/60 mt-1">{docs.length} file(s)</p>
              )}
            </F>
          </div>

          {selCat?.is_eot_eligible && (
            <div className="card p-4 bg-amber-500/[0.06] border-amber-500/25">
              <div className="flex items-center gap-2 mb-3">
                <span className="material-symbols-outlined text-amber-400" style={{ fontSize: '18px' }}>gavel</span>
                <span className="text-[12px] font-bold text-amber-400 uppercase tracking-wider">
                  Extension of Time
                </span>
              </div>
              <p className="text-[12px] text-[#dcc1ae] mb-3">
                This is the client failing a contractual obligation. It entitles you to more time —
                but <b className="text-[#e2e2e8]">only if you notify them formally, in writing,
                within the contract window</b>. A late notice voids the claim, however good your
                evidence is.
              </p>

              <div className="grid grid-cols-2 gap-3">
                <F label="Notice Date">
                  <input type="date" className="input" value={notifiedDate}
                    onChange={e => setNotifiedDate(e.target.value)} />
                  <p className="text-[10px] text-[#dcc1ae]/50 mt-1">
                    Leave blank if not sent yet — the system will nag you daily.
                  </p>
                </F>
                <F label="Notice / Letter Ref">
                  <input className="input mono" value={noticeRef}
                    onChange={e => setNoticeRef(e.target.value)} placeholder="AAD/NALCO/2026/012" />
                </F>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-3">
                <F label="Contract Clause">
                  <input className="input" value={clause}
                    onChange={e => setClause(e.target.value)} placeholder="Clause 8.4" />
                </F>
                <F label="Work Front Blocked">
                  <input className="input" value={workFront}
                    onChange={e => setWorkFront(e.target.value)}
                    placeholder="Ch. 2+400 to 3+100, embankment" />
                </F>
              </div>
            </div>
          )}

          {priority === 'Critical' && (
            <div className="card p-2.5 bg-red-500/5 border-red-500/20 text-[12px] text-red-400">
              A <b>Critical</b> hindrance notifies Head Office immediately.
            </div>
          )}
        </div>

        {err && <div className="px-5 pb-2 text-sm text-red-400">{err}</div>}
        <div className="px-5 py-4 border-t border-white/[0.06] flex gap-2">
          <button type="button" className="btn btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary flex-[2]" disabled={busy}>
            {busy ? 'Saving…' : 'Raise Hindrance'}
          </button>
        </div>
      </form>
    </div>
  ), document.body)
}

function Sec({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider mb-2 pb-1 border-b border-white/[0.06]">{children}</div>
}
function Mini({ label, v, red, amber }: { label: string; v: string; red?: boolean; amber?: boolean }) {
  return (
    <div className="rounded-lg bg-white/[0.03] border border-white/[0.05] p-2.5">
      <div className="text-[10px] text-[#dcc1ae]/60 uppercase tracking-wider">{label}</div>
      <div className={`font-mono text-[15px] font-bold mt-0.5 ${
        red ? 'text-red-400' : amber ? 'text-amber-400' : 'text-[#e2e2e8]'}`}>{v}</div>
    </div>
  )
}
function Info({ label, v, red, amber }: { label: string; v: string; red?: boolean; amber?: boolean }) {
  return (
    <div>
      <div className="text-[10px] text-[#dcc1ae]/60 uppercase tracking-wider">{label}</div>
      <div className={`text-[13px] font-semibold mt-0.5 ${
        red ? 'text-red-400' : amber ? 'text-amber-400' : 'text-[#e2e2e8]'}`}>{v}</div>
    </div>
  )
}
function K({ label, value, tone, big }: {
  label: string; value: string; tone?: 'red' | 'amber' | 'emerald'; big?: boolean
}) {
  const c = tone === 'red' ? 'text-red-400' : tone === 'amber' ? 'text-amber-400'
    : tone === 'emerald' ? 'text-emerald-400' : 'text-[#e2e2e8]'
  return (
    <div className={`card p-3 ${big ? 'border-[#ff8f00]/25 bg-[#ff8f00]/[0.04]' : ''}`}>
      <div className="text-[10px] text-[#dcc1ae]/60 uppercase tracking-wider mb-1">{label}</div>
      <div className={`font-mono ${big ? 'text-[21px]' : 'text-[19px]'} font-bold ${big ? 'text-[#ffb87b]' : c}`}>
        {value}
      </div>
    </div>
  )
}
function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider block mb-1">{label}</span>{children}</label>
}