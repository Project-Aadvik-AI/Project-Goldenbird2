import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useProject } from '../lib/project'
import ExportButtons from '../components/ExportButtons'
import PrintButton from '../components/PrintButton'

const inr = (n: number) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })
const q = (n: number) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 })

type WOProg = {
  wo_id: string; wo_no: string | null; wo_status: string
  party_id: string; vendor_name: string; vendor_code: string | null
  project_name: string | null; start_date: string | null; end_date: string | null
  boq_lines: number
  assigned_value: number; completed_value: number; pending_value: number
  progress_pct: number
  lines_complete: number; lines_in_progress: number; lines_not_started: number
  lines_late: number; worst_delay_days: number | null
  contract_overdue_days: number | null
}
type Line = {
  wo_id: string; wo_no: string | null; vendor_name: string
  boq_item_id: string; boq_description: string; unit: string | null
  boq_quantity: number; assigned_qty: number; agreed_rate: number
  completed_qty: number; pending_qty: number; progress_pct: number
  assigned_value: number; completed_value: number
  target_date: string | null; days_late: number | null
}
type Period = {
  vendor_name: string; wo_no: string | null; project_name: string | null
  period: string; period_type: string
  entries: number; qty_done: number; value_done: number
}

type Tab = 'contracts' | 'lines' | 'timeline'
type Grain = 'Daily' | 'Weekly' | 'Monthly'

export default function VendorProgress() {
  const { isAdmin } = useAuth()
  const { activeProject } = useProject()
  const [tab, setTab] = useState<Tab>('contracts')
  const [grain, setGrain] = useState<Grain>('Weekly')
  const [wos, setWos] = useState<WOProg[]>([])
  const [lines, setLines] = useState<Line[]>([])
  const [periods, setPeriods] = useState<Period[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      setLoading(true)
      supabase.rpc('vendor_scan_progress_alerts').then(() => {})

      const [w, l, p] = await Promise.all([
        supabase.from('wo_progress').select('*')
          .eq('project_id', activeProject?.id ?? '')
          .order('progress_pct'),
        supabase.from('vendor_progress_lines').select('*')
          .eq('project_id', activeProject?.id ?? '')
          .order('progress_pct'),
        supabase.from('vendor_progress_daily').select('*')
          .eq('project_id', activeProject?.id ?? '')
          .order('period', { ascending: false }),
      ])
      setWos((w.data as WOProg[]) ?? [])
      setLines((l.data as Line[]) ?? [])
      setPeriods((p.data as Period[]) ?? [])
      setLoading(false)
    })()
  }, [activeProject?.id])

  const kpi = useMemo(() => {
    const assigned = wos.reduce((n, w) => n + Number(w.assigned_value || 0), 0)
    const done = wos.reduce((n, w) => n + Number(w.completed_value || 0), 0)
    return {
      assigned, done, pending: assigned - done,
      pct: assigned > 0 ? Math.round(done / assigned * 100) : 0,
      behind: wos.filter(w => w.contract_overdue_days != null).length,
      lateLines: wos.reduce((n, w) => n + Number(w.lines_late || 0), 0),
    }
  }, [wos])

  const shownPeriods = useMemo(() =>
    periods.filter(p => p.period_type === grain), [periods, grain])

  if (loading) return <div className="p-8 text-center text-[#dcc1ae] text-sm">Loading…</div>

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-headline text-2xl font-semibold text-[#e2e2e8]">Vendor Progress</h1>
        <p className="text-sm text-[#dcc1ae] mt-0.5">
          Measured from the Measurement Book — nothing is typed in. Progress is by <b>value</b>,
          not line count.
        </p>
      </div>

      {!wos.length && (
        <div className="card p-6 text-center">
          <span className="material-symbols-outlined text-[#dcc1ae]/40" style={{ fontSize: '36px' }}>link_off</span>
          <p className="text-[14px] text-[#e2e2e8] font-semibold mt-2">No work orders are linked to BOQ items yet</p>
          <p className="text-[13px] text-[#dcc1ae] mt-1 max-w-lg mx-auto">
            Progress is derived from the BOQ. Open a Work Order, add the BOQ items the vendor is
            contracted to do, and their progress will appear here automatically as the Measurement
            Book is approved.
          </p>
        </div>
      )}

      {wos.length > 0 && (
        <>
          {kpi.behind > 0 && (
            <div className="card p-3 mb-4 bg-red-500/5 border-red-500/20 flex items-start gap-2">
              <span className="material-symbols-outlined text-red-400" style={{ fontSize: '18px' }}>schedule</span>
              <div className="text-[13px]">
                <b className="text-red-400">{kpi.behind} contract(s) are past their end date and unfinished</b>
                <span className="text-[#dcc1ae]"> — {inr(kpi.pending)} of work still pending.</span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <K label="Work Assigned" value={inr(kpi.assigned)} />
            <K label="Work Completed" value={inr(kpi.done)} tone="emerald" />
            <K label="Work Pending" value={inr(kpi.pending)} tone={kpi.pending ? 'amber' : undefined} />
            <K label="Late Lines" value={String(kpi.lateLines)} tone={kpi.lateLines ? 'red' : 'emerald'} />
          </div>

          {/* overall progress */}
          <div className="card p-4 mb-5">
            <div className="flex items-center justify-between text-[13px] mb-2">
              <span className="text-[#dcc1ae]">Overall vendor progress</span>
              <span className="font-mono text-[18px] font-bold text-[#e2e2e8]">{kpi.pct}%</span>
            </div>
            <div className="h-3 rounded-full bg-white/[0.06] overflow-hidden">
              <div className={`h-full rounded-full transition-all ${
                kpi.pct >= 80 ? 'bg-emerald-500' : kpi.pct >= 50 ? 'bg-[#ff8f00]' : 'bg-amber-500'}`}
                style={{ width: `${kpi.pct}%` }} />
            </div>
            <div className="flex justify-between text-[11px] text-[#dcc1ae]/60 mt-1.5">
              <span>{inr(kpi.done)} done</span>
              <span>{inr(kpi.pending)} to go</span>
            </div>
          </div>

          <div className="flex gap-1 mb-4 flex-wrap items-center">
            {([['contracts', `Contracts (${wos.length})`],
               ['lines', `BOQ Lines (${lines.length})`],
               ['timeline', 'Progress Over Time']] as [Tab, string][]).map(([k, label]) => (
              <button key={k} onClick={() => setTab(k)}
                className={`px-3.5 py-2 rounded-lg text-[13px] font-semibold border ${
                  tab === k ? 'bg-[#ff8f00]/10 text-[#ffb87b] border-[#ff8f00]/30'
                            : 'text-[#dcc1ae] border-white/[0.08] hover:bg-white/[0.03]'}`}>
                {label}
              </button>
            ))}
            {tab === 'timeline' && (
              <div className="flex gap-1 ml-2">
                {(['Daily', 'Weekly', 'Monthly'] as Grain[]).map(g => (
                  <button key={g} onClick={() => setGrain(g)}
                    className={`px-2.5 py-1.5 rounded text-[12px] font-semibold ${
                      grain === g ? 'bg-white/[0.08] text-[#e2e2e8]' : 'text-[#dcc1ae] hover:bg-white/[0.03]'}`}>
                    {g}
                  </button>
                ))}
              </div>
            )}
          </div>

          {tab === 'contracts' && <Contracts rows={wos} />}
          {tab === 'lines' && <Lines rows={lines} />}
          {tab === 'timeline' && <Timeline rows={shownPeriods} grain={grain} />}
        </>
      )}
    </div>
  )
}

// ---------------- Contracts ----------------
function Contracts({ rows }: { rows: WOProg[] }) {
  return (
    <div className="card overflow-hidden overflow-x-auto">
      <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
        <span className="text-sm font-semibold text-[#e2e2e8]">Progress by Work Order</span>
        <ExportButtons filename="vendor-progress" title="Vendor Progress" rows={rows}
          columns={[
            { header: 'Work Order', get: (r: any) => r.wo_no || '—' },
            { header: 'Vendor', get: (r: any) => r.vendor_name },
            { header: 'Project', get: (r: any) => r.project_name || '—' },
            { header: 'Status', get: (r: any) => r.wo_status },
            { header: 'BOQ Lines', get: (r: any) => Number(r.boq_lines) },
            { header: 'Assigned Value', get: (r: any) => Number(r.assigned_value) },
            { header: 'Completed Value', get: (r: any) => Number(r.completed_value) },
            { header: 'Pending Value', get: (r: any) => Number(r.pending_value) },
            { header: 'Progress %', get: (r: any) => Number(r.progress_pct) },
            { header: 'Lines Complete', get: (r: any) => Number(r.lines_complete) },
            { header: 'Lines Late', get: (r: any) => Number(r.lines_late) },
            { header: 'End Date', get: (r: any) => r.end_date || '—' },
            { header: 'Contract Overdue (days)', get: (r: any) => r.contract_overdue_days ?? '—' },
          ]} />
          <PrintButton />
      </div>
      <table className="w-full text-sm">
        <thead className="bg-[#282a2e]"><tr>
          {['Work Order', 'Vendor', 'Progress', 'Assigned', 'Completed', 'Pending', 'Lines', 'End Date'].map(h => (
            <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
          ))}
        </tr></thead>
        <tbody className="divide-y divide-white/[0.05]">
          {rows.map(r => {
            const overdue = r.contract_overdue_days != null
            return (
              <tr key={r.wo_id} className={`hover:bg-white/[0.02] ${overdue ? 'bg-red-500/[0.05]' : ''}`}>
                <td className="px-4 py-2.5">
                  <div className="font-mono text-[12px] text-[#e2e2e8] font-semibold">{r.wo_no}</div>
                  <div className="text-[10px] text-[#dcc1ae]/60">{r.wo_status}</div>
                </td>
                <td className="px-4 py-2.5">
                  <div className="text-[#e2e2e8]">{r.vendor_name}</div>
                  <div className="text-[10px] font-mono text-[#dcc1ae]/50">{r.vendor_code}</div>
                </td>
                <td className="px-4 py-2.5" style={{ minWidth: 120 }}>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 rounded-full bg-white/[0.06] overflow-hidden">
                      <div className={`h-full rounded-full ${
                        r.progress_pct >= 80 ? 'bg-emerald-500'
                          : r.progress_pct >= 40 ? 'bg-[#ff8f00]' : 'bg-amber-500'}`}
                        style={{ width: `${Math.min(100, r.progress_pct)}%` }} />
                    </div>
                    <span className="font-mono text-[12px] font-bold text-[#e2e2e8] w-10 text-right">
                      {r.progress_pct}%
                    </span>
                  </div>
                  {r.lines_late > 0 && (
                    <div className="text-[10px] text-red-400 mt-0.5">{r.lines_late} line(s) late</div>
                  )}
                </td>
                <td className="px-4 py-2.5 font-mono text-[#dcc1ae] text-right whitespace-nowrap">{inr(r.assigned_value)}</td>
                <td className="px-4 py-2.5 font-mono text-emerald-400 text-right whitespace-nowrap">{inr(r.completed_value)}</td>
                <td className={`px-4 py-2.5 font-mono font-bold text-right whitespace-nowrap ${Number(r.pending_value) > 0 ? 'text-amber-400' : 'text-[#dcc1ae]/40'}`}>
                  {Number(r.pending_value) > 0 ? inr(r.pending_value) : '—'}
                </td>
                <td className="px-4 py-2.5 text-[11px] text-[#dcc1ae] whitespace-nowrap">
                  <span className="text-emerald-400">{r.lines_complete}</span> /
                  <span className="text-amber-400"> {r.lines_in_progress}</span> /
                  <span className="text-[#dcc1ae]/50"> {r.lines_not_started}</span>
                  <div className="text-[9px] text-[#dcc1ae]/40">done / doing / to do</div>
                </td>
                <td className={`px-4 py-2.5 font-mono text-[12px] whitespace-nowrap ${overdue ? 'text-red-400 font-bold' : 'text-[#dcc1ae]'}`}>
                  {r.end_date || '—'}
                  {overdue && <div className="text-[10px]">{r.contract_overdue_days}d overdue</div>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ---------------- BOQ lines ----------------
function Lines({ rows }: { rows: Line[] }) {
  return (
    <div className="card overflow-hidden overflow-x-auto">
      <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
        <span className="text-sm font-semibold text-[#e2e2e8]">Progress by BOQ Line</span>
        <ExportButtons filename="vendor-progress-lines" title="Vendor Progress by BOQ Line" rows={rows}
          columns={[
            { header: 'Work Order', get: (r: any) => r.wo_no || '—' },
            { header: 'Vendor', get: (r: any) => r.vendor_name },
            { header: 'BOQ Item', get: (r: any) => r.boq_description },
            { header: 'Unit', get: (r: any) => r.unit || '—' },
            { header: 'BOQ Qty', get: (r: any) => Number(r.boq_quantity) },
            { header: 'Assigned', get: (r: any) => Number(r.assigned_qty) },
            { header: 'Completed', get: (r: any) => Number(r.completed_qty) },
            { header: 'Pending', get: (r: any) => Number(r.pending_qty) },
            { header: 'Progress %', get: (r: any) => Number(r.progress_pct) },
            { header: 'Rate', get: (r: any) => Number(r.agreed_rate) },
            { header: 'Assigned Value', get: (r: any) => Number(r.assigned_value) },
            { header: 'Completed Value', get: (r: any) => Number(r.completed_value) },
            { header: 'Target Date', get: (r: any) => r.target_date || '—' },
            { header: 'Days Late', get: (r: any) => r.days_late ?? '—' },
          ]} />
      </div>
      <table className="w-full text-sm">
        <thead className="bg-[#282a2e]"><tr>
          {['BOQ Item', 'Vendor / WO', 'Assigned', 'Completed', 'Pending', 'Progress', 'Target'].map(h => (
            <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
          ))}
        </tr></thead>
        <tbody className="divide-y divide-white/[0.05]">
          {rows.map((r, i) => {
            const late = r.days_late != null
            return (
              <tr key={i} className={`hover:bg-white/[0.02] ${late ? 'bg-red-500/[0.05]' : ''}`}>
                <td className="px-4 py-2.5 max-w-[250px]">
                  <div className="text-[#e2e2e8] truncate" title={r.boq_description}>{r.boq_description}</div>
                  <div className="text-[10px] text-[#dcc1ae]/50">BOQ qty {q(r.boq_quantity)} {r.unit}</div>
                </td>
                <td className="px-4 py-2.5 text-[12px] text-[#dcc1ae]">
                  {r.vendor_name}
                  <div className="text-[10px] font-mono text-[#dcc1ae]/50">{r.wo_no}</div>
                </td>
                <td className="px-4 py-2.5 font-mono text-[#dcc1ae] text-right whitespace-nowrap">
                  {q(r.assigned_qty)}
                  <div className="text-[10px] text-[#dcc1ae]/50">{inr(r.assigned_value)}</div>
                </td>
                <td className="px-4 py-2.5 font-mono text-emerald-400 text-right whitespace-nowrap">
                  {q(r.completed_qty)}
                  <div className="text-[10px]">{inr(r.completed_value)}</div>
                </td>
                <td className={`px-4 py-2.5 font-mono font-bold text-right ${Number(r.pending_qty) > 0 ? 'text-amber-400' : 'text-[#dcc1ae]/40'}`}>
                  {Number(r.pending_qty) > 0 ? q(r.pending_qty) : '—'}
                </td>
                <td className="px-4 py-2.5" style={{ minWidth: 100 }}>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                      <div className={`h-full rounded-full ${r.progress_pct >= 100 ? 'bg-emerald-500' : 'bg-[#ff8f00]'}`}
                        style={{ width: `${Math.min(100, r.progress_pct)}%` }} />
                    </div>
                    <span className="font-mono text-[11px] text-[#dcc1ae] w-9 text-right">{r.progress_pct}%</span>
                  </div>
                </td>
                <td className={`px-4 py-2.5 font-mono text-[12px] whitespace-nowrap ${late ? 'text-red-400 font-bold' : 'text-[#dcc1ae]'}`}>
                  {r.target_date || '—'}
                  {late && <div className="text-[10px]">{r.days_late}d late</div>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ---------------- Timeline ----------------
function Timeline({ rows, grain }: { rows: Period[]; grain: Grain }) {
  const max = Math.max(1, ...rows.map(r => Number(r.value_done || 0)))
  return (
    <div className="card overflow-hidden overflow-x-auto">
      <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
        <div>
          <span className="text-sm font-semibold text-[#e2e2e8]">{grain} Progress</span>
          <p className="text-[11px] text-[#dcc1ae]/60 mt-0.5">
            From approved Measurement Book entries only — a measurement that hasn't been approved isn't progress.
          </p>
        </div>
        <ExportButtons filename={`vendor-progress-${grain.toLowerCase()}`} title={`Vendor ${grain} Progress`} rows={rows}
          columns={[
            { header: 'Period', get: (r: any) => r.period },
            { header: 'Vendor', get: (r: any) => r.vendor_name },
            { header: 'Work Order', get: (r: any) => r.wo_no || '—' },
            { header: 'Project', get: (r: any) => r.project_name || '—' },
            { header: 'Entries', get: (r: any) => Number(r.entries) },
            { header: 'Qty Done', get: (r: any) => Number(r.qty_done) },
            { header: 'Value Done', get: (r: any) => Number(r.value_done) },
          ]} />
      </div>
      <table className="w-full text-sm">
        <thead className="bg-[#282a2e]"><tr>
          {['Period', 'Vendor', 'Work Order', 'Entries', 'Value Done', ''].map(h => (
            <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
          ))}
        </tr></thead>
        <tbody className="divide-y divide-white/[0.05]">
          {rows.map((r, i) => (
            <tr key={i} className="hover:bg-white/[0.02]">
              <td className="px-4 py-2.5 font-mono text-[12px] text-[#e2e2e8]">{r.period}</td>
              <td className="px-4 py-2.5 text-[#dcc1ae]">{r.vendor_name}</td>
              <td className="px-4 py-2.5 font-mono text-[12px] text-[#dcc1ae]">{r.wo_no || '—'}</td>
              <td className="px-4 py-2.5 font-mono text-[#dcc1ae] text-right">{r.entries}</td>
              <td className="px-4 py-2.5 font-mono font-bold text-emerald-400 text-right whitespace-nowrap">
                {inr(r.value_done)}
              </td>
              <td className="px-4 py-2.5" style={{ minWidth: 100 }}>
                <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                  <div className="h-full rounded-full bg-emerald-500"
                    style={{ width: `${Number(r.value_done) / max * 100}%` }} />
                </div>
              </td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={6} className="px-4 py-10 text-center text-[#dcc1ae]/60 text-sm">
            No approved measurements yet.
          </td></tr>}
        </tbody>
      </table>
    </div>
  )
}

function K({ label, value, tone }: { label: string; value: string; tone?: 'emerald' | 'amber' | 'red' }) {
  const c = tone === 'emerald' ? 'text-emerald-400' : tone === 'amber' ? 'text-amber-400'
    : tone === 'red' ? 'text-red-400' : 'text-[#e2e2e8]'
  return (
    <div className="card p-3">
      <div className="text-[10px] text-[#dcc1ae]/60 uppercase tracking-wider mb-1">{label}</div>
      <div className={`font-mono text-[19px] font-bold ${c}`}>{value}</div>
    </div>
  )
}