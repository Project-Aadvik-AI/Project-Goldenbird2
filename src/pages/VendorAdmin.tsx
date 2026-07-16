import { useEffect, useMemo, useState } from 'react'
import { appAlert, appConfirm, appPrompt } from '../lib/dialogs'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import ExportButtons from '../components/ExportButtons'
import PrintButton from '../components/PrintButton'

const inr = (n: number) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })

type Dupe = {
  keep_id: string; keep_code: string | null; keep_name: string
  dupe_id: string; dupe_code: string | null; dupe_name: string
  match_on: string; confidence: string
}
type Deleted = {
  party_id: string; vendor_code: string | null; name: string
  deleted_at: string; deleted_by_name: string | null; reason: string | null
}
type Perf = {
  party_id: string; vendor_name: string; vendor_code: string | null; status: string
  on_time_pct: number | null; late_deliveries: number; avg_delay_days: number
  fulfilment_pct: number | null
  avg_approval_days: number; bills_approved: number
  avg_payment_days: number; bills_paid: number; total_paid: number
  material_issued: number; material_returned: number; material_lost: number
  material_still_out: number; overdue_returns: number
  return_compliance_pct: number | null
  quality_rating: number | null; overall_rating: number
}

type Audit = {
  id: string; created_at: string; action: string; action_label: string
  vendor_name: string | null; vendor_code: string | null
  actor_name: string | null; actor_role: string | null
  project_name: string | null
  old_value: any; new_value: any; detail: any
}
type Tab = 'performance' | 'duplicates' | 'deleted' | 'audit'

export default function VendorAdmin() {
  const { isAdmin } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('performance')
  const [perf, setPerf] = useState<Perf[]>([])
  const [dupes, setDupes] = useState<Dupe[]>([])
  const [deleted, setDeleted] = useState<Deleted[]>([])
  const [loading, setLoading] = useState(true)
  const [merging, setMerging] = useState<Dupe | null>(null)
  const [audit, setAudit] = useState<Audit[]>([])

  async function load() {
    setLoading(true)
    const [p, d, x, a] = await Promise.all([
      supabase.from('vendor_performance_extended').select('*').order('overall_rating', { ascending: false }),
      supabase.from('vendor_possible_duplicates').select('*'),
      supabase.from('acc_parties')
        .select('id, vendor_code, name, deleted_at, deleted_by')
        .not('deleted_at', 'is', null),
      supabase.from('vendor_audit_log').select('*')
        .order('created_at', { ascending: false }).limit(300),
    ])
    setPerf((p.data as Perf[]) ?? [])
    setDupes((d.data as Dupe[]) ?? [])
    setDeleted(((x.data as any[]) ?? []).map(r => ({
      party_id: r.id, vendor_code: r.vendor_code, name: r.name,
      deleted_at: r.deleted_at, deleted_by_name: null, reason: null,
    })))
    setAudit((a.data as Audit[]) ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function restore(d: Deleted) {
    if (!await appConfirm(`Restore ${d.name}?\n\nThey will become an Active vendor again.`)) return
    const { error } = await supabase.rpc('restore_vendor', { p_party: d.party_id })
    if (error) { appAlert('Could not restore:\n\n' + error.message); return }
    load()
  }

  if (!isAdmin) {
    return <div className="p-8 text-center text-[#dcc1ae]">This area is restricted to administrators.</div>
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-headline text-2xl font-semibold text-[#e2e2e8]">Vendor Administration</h1>
        <p className="text-sm text-[#dcc1ae] mt-0.5">
          Performance, duplicate detection, merging and restoring deleted vendors.
        </p>
      </div>

      {dupes.length > 0 && (
        <div className="card p-3 mb-4 bg-amber-500/5 border-amber-500/20 flex items-start gap-2">
          <span className="material-symbols-outlined text-amber-400" style={{ fontSize: '18px' }}>content_copy</span>
          <div className="text-[13px]">
            <b className="text-amber-400">{dupes.length} possible duplicate vendor(s) found</b>
            <span className="text-[#dcc1ae]"> — the same GSTIN, PAN, phone or email on two records.</span>
          </div>
        </div>
      )}

      <div className="flex gap-1 mb-4 flex-wrap">
        {([['performance', `Performance (${perf.length})`],
           ['duplicates', `Duplicates (${dupes.length})`],
           ['deleted', `Deleted (${deleted.length})`],
           ['audit', `Audit Log (${audit.length})`]] as [Tab, string][]).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-3.5 py-2 rounded-lg text-[13px] font-semibold border ${
              tab === k ? 'bg-[#ff8f00]/10 text-[#ffb87b] border-[#ff8f00]/30'
                        : 'text-[#dcc1ae] border-white/[0.08] hover:bg-white/[0.03]'}`}>
            {label}
          </button>
        ))}
      </div>

      {loading ? <div className="card p-8 text-center text-[#dcc1ae] text-sm">Loading…</div> : (
        <>
          {tab === 'performance' && <Performance rows={perf} onOpen={id => navigate(`/vendors/${id}`)} />}
          {tab === 'duplicates' && <Duplicates rows={dupes} onMerge={setMerging} />}
          {tab === 'deleted' && <Deleted rows={deleted} onRestore={restore} />}
          {tab === 'audit' && <AuditLog rows={audit} />}
        </>
      )}

      {merging && <MergeModal d={merging} onClose={() => setMerging(null)}
        onDone={() => { setMerging(null); load() }} />}
    </div>
  )
}

// ---------------- Extended performance ----------------
function Performance({ rows, onOpen }: { rows: Perf[]; onOpen: (id: string) => void }) {
  return (
    <div className="card overflow-hidden overflow-x-auto">
      <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
        <span className="text-sm font-semibold text-[#e2e2e8]">Vendor Performance — everything computed</span>
        <ExportButtons filename="vendor-performance-full" title="Vendor Performance" rows={rows}
          columns={[
            { header: 'Code', get: (r: any) => r.vendor_code || '—' },
            { header: 'Vendor', get: (r: any) => r.vendor_name },
            { header: 'Status', get: (r: any) => r.status },
            { header: 'On-Time %', get: (r: any) => r.on_time_pct ?? '—' },
            { header: 'Late Deliveries', get: (r: any) => Number(r.late_deliveries) },
            { header: 'Avg Delay (days)', get: (r: any) => Number(r.avg_delay_days) },
            { header: 'Fulfilment %', get: (r: any) => r.fulfilment_pct ?? '—' },
            { header: 'Avg Approval Time (days)', get: (r: any) => Number(r.avg_approval_days) },
            { header: 'Avg Payment Time (days)', get: (r: any) => Number(r.avg_payment_days) },
            { header: 'Total Paid', get: (r: any) => Number(r.total_paid) },
            { header: 'Material Issued', get: (r: any) => Number(r.material_issued) },
            { header: 'Material Returned', get: (r: any) => Number(r.material_returned) },
            { header: 'Material Lost', get: (r: any) => Number(r.material_lost) },
            { header: 'Still Out', get: (r: any) => Number(r.material_still_out) },
            { header: 'Overdue Returns', get: (r: any) => Number(r.overdue_returns) },
            { header: 'Return Compliance %', get: (r: any) => r.return_compliance_pct ?? '—' },
            { header: 'Overall Rating', get: (r: any) => Number(r.overall_rating) },
          ]} />
          <PrintButton />
      </div>

      <div className="px-4 py-2 bg-white/[0.02] border-b border-white/5">
        <p className="text-[11px] text-[#dcc1ae]/70">
          <b>Approval time</b> and <b>payment time</b> measure <i>us</i>, not them — a vendor who is slow
          to deliver may be reacting to us being slow to pay. You cannot judge them fairly without both.
        </p>
      </div>

      <table className="w-full text-sm">
        <thead className="bg-[#282a2e]"><tr>
          {['Vendor', 'On Time', 'Late', 'We Approve In', 'We Pay In', 'Returns Our Material', 'Overall'].map(h => (
            <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
          ))}
        </tr></thead>
        <tbody className="divide-y divide-white/[0.05]">
          {rows.map(r => (
            <tr key={r.party_id} className="hover:bg-white/[0.02] cursor-pointer" onClick={() => onOpen(r.party_id)}>
              <td className="px-4 py-2.5">
                <div className="text-[#e2e2e8] font-semibold">{r.vendor_name}</div>
                <div className="text-[10px] font-mono text-[#dcc1ae]/50">{r.vendor_code}</div>
              </td>
              <td className="px-4 py-2.5 text-right">
                {r.on_time_pct != null ? (
                  <span className={`font-mono font-bold ${r.on_time_pct >= 80 ? 'text-emerald-400' : r.on_time_pct >= 60 ? 'text-amber-400' : 'text-red-400'}`}>
                    {r.on_time_pct}%
                  </span>
                ) : <span className="text-[#dcc1ae]/30">—</span>}
              </td>
              <td className={`px-4 py-2.5 font-mono text-right ${r.late_deliveries > 0 ? 'text-red-400' : 'text-[#dcc1ae]/40'}`}>
                {r.late_deliveries || '—'}
              </td>
              <td className="px-4 py-2.5 font-mono text-right text-[#dcc1ae] whitespace-nowrap">
                {Number(r.avg_approval_days) ? `${r.avg_approval_days}d` : '—'}
                <div className="text-[10px] text-[#dcc1ae]/50">{r.bills_approved} bill(s)</div>
              </td>
              <td className="px-4 py-2.5 font-mono text-right whitespace-nowrap">
                <span className={Number(r.avg_payment_days) > 45 ? 'text-red-400 font-bold' : 'text-[#dcc1ae]'}>
                  {Number(r.avg_payment_days) ? `${r.avg_payment_days}d` : '—'}
                </span>
                <div className="text-[10px] text-[#dcc1ae]/50">{r.bills_paid} paid</div>
              </td>
              <td className="px-4 py-2.5 text-right whitespace-nowrap">
                {r.return_compliance_pct != null ? (
                  <>
                    <span className={`font-mono font-bold ${r.return_compliance_pct >= 90 ? 'text-emerald-400' : r.return_compliance_pct >= 70 ? 'text-amber-400' : 'text-red-400'}`}>
                      {r.return_compliance_pct}%
                    </span>
                    {Number(r.overdue_returns) > 0 && (
                      <div className="text-[10px] text-red-400">{r.overdue_returns} overdue</div>
                    )}
                  </>
                ) : <span className="text-[#dcc1ae]/30">—</span>}
              </td>
              <td className="px-4 py-2.5 text-right">
                <span className="font-mono text-[15px] font-bold text-[#ffb87b]">
                  {Number(r.overall_rating).toFixed(1)}
                </span>
                <span className="text-[11px] text-[#dcc1ae]/40"> / 5</span>
              </td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={7} className="px-4 py-10 text-center text-[#dcc1ae]/60 text-sm">No vendors.</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

// ---------------- Duplicates ----------------
function Duplicates({ rows, onMerge }: { rows: Dupe[]; onMerge: (d: Dupe) => void }) {
  return (
    <div className="card overflow-hidden overflow-x-auto">
      <div className="px-4 py-3 border-b border-white/5">
        <span className="text-sm font-semibold text-[#e2e2e8]">Possible Duplicate Vendors</span>
        <p className="text-[11px] text-[#dcc1ae]/60 mt-0.5">
          Merging repoints every work order, bill, purchase order, GRN, document and accounting entry
          to the vendor you keep. Nothing is lost.
        </p>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-[#282a2e]"><tr>
          {['Keep', 'Duplicate', 'Matched On', 'Confidence', ''].map(h => (
            <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider">{h}</th>
          ))}
        </tr></thead>
        <tbody className="divide-y divide-white/[0.05]">
          {rows.map((d, i) => (
            <tr key={i} className="hover:bg-white/[0.02]">
              <td className="px-4 py-2.5">
                <div className="text-[#e2e2e8] font-semibold">{d.keep_name}</div>
                <div className="text-[10px] font-mono text-[#dcc1ae]/50">{d.keep_code}</div>
              </td>
              <td className="px-4 py-2.5">
                <div className="text-[#dcc1ae]">{d.dupe_name}</div>
                <div className="text-[10px] font-mono text-[#dcc1ae]/50">{d.dupe_code}</div>
              </td>
              <td className="px-4 py-2.5">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase border bg-white/5 text-[#dcc1ae] border-white/10">
                  {d.match_on}
                </span>
              </td>
              <td className="px-4 py-2.5">
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                  d.confidence === 'High' ? 'bg-red-500/10 text-red-400 border-red-500/20'
                    : 'bg-amber-500/10 text-amber-400 border-amber-500/20'}`}>
                  {d.confidence}
                </span>
              </td>
              <td className="px-4 py-2.5 text-right">
                <button className="btn btn-primary" style={{ padding: '5px 12px', fontSize: '12px' }}
                  onClick={() => onMerge(d)}>Review &amp; Merge</button>
              </td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={5} className="px-4 py-10 text-center text-emerald-400/70 text-sm">
            ✓ No duplicates found.
          </td></tr>}
        </tbody>
      </table>
    </div>
  )
}

// ---------------- Deleted ----------------
function Deleted({ rows, onRestore }: { rows: Deleted[]; onRestore: (d: Deleted) => void }) {
  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-white/5">
        <span className="text-sm font-semibold text-[#e2e2e8]">Deleted Vendors</span>
        <p className="text-[11px] text-[#dcc1ae]/60 mt-0.5">
          Soft-deleted — their history is intact and reports still work. They can be restored.
        </p>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-[#282a2e]"><tr>
          {['Vendor', 'Deleted', ''].map(h => (
            <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider">{h}</th>
          ))}
        </tr></thead>
        <tbody className="divide-y divide-white/[0.05]">
          {rows.map(d => (
            <tr key={d.party_id} className="hover:bg-white/[0.02] opacity-70">
              <td className="px-4 py-2.5">
                <div className="text-[#e2e2e8] font-semibold">{d.name}</div>
                <div className="text-[10px] font-mono text-[#dcc1ae]/50">{d.vendor_code}</div>
              </td>
              <td className="px-4 py-2.5 font-mono text-[12px] text-[#dcc1ae]">
                {new Date(d.deleted_at).toLocaleDateString('en-IN')}
              </td>
              <td className="px-4 py-2.5 text-right">
                <button className="text-emerald-400 text-[11px] font-semibold uppercase hover:underline"
                  onClick={() => onRestore(d)}>Restore</button>
              </td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={3} className="px-4 py-10 text-center text-[#dcc1ae]/60 text-sm">
            No deleted vendors.
          </td></tr>}
        </tbody>
      </table>
    </div>
  )
}

// ---------------- Audit Log ----------------
function AuditLog({ rows }: { rows: Audit[] }) {
  const [q, setQ] = useState('')
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return rows
    return rows.filter(r =>
      `${r.vendor_name ?? ''} ${r.actor_name ?? ''} ${r.action_label} ${r.project_name ?? ''}`
        .toLowerCase().includes(s))
  }, [rows, q])

  const fmt = (v: any) => {
    if (!v || typeof v !== 'object') return null
    return Object.entries(v).map(([k, val]) => `${k}: ${val ?? '—'}`).join(', ')
  }

  return (
    <div className="card overflow-hidden overflow-x-auto">
      <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between gap-3">
        <div>
          <span className="text-sm font-semibold text-[#e2e2e8]">Audit Log</span>
          <p className="text-[11px] text-[#dcc1ae]/60 mt-0.5">
            Who did what, when, and what it changed from and to.
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <input className="input" style={{ maxWidth: 180, padding: '6px 10px', fontSize: '13px' }}
            value={q} onChange={e => setQ(e.target.value)} placeholder="Search…" />
          <ExportButtons filename="vendor-audit-log" title="Vendor Audit Log" rows={shown}
            columns={[
              { header: 'Date', get: (r: any) => new Date(r.created_at).toLocaleString('en-IN') },
              { header: 'Action', get: (r: any) => r.action_label },
              { header: 'Vendor', get: (r: any) => r.vendor_name || '—' },
              { header: 'Vendor Code', get: (r: any) => r.vendor_code || '—' },
              { header: 'User', get: (r: any) => r.actor_name || '—' },
              { header: 'Role', get: (r: any) => r.actor_role || '—' },
              { header: 'Project', get: (r: any) => r.project_name || '—' },
              { header: 'Changed From', get: (r: any) => JSON.stringify(r.old_value ?? {}) },
              { header: 'Changed To', get: (r: any) => JSON.stringify(r.new_value ?? {}) },
            ]} />
          <PrintButton />
        </div>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-[#282a2e]"><tr>
          {['When', 'Action', 'Vendor', 'User', 'Change'].map(h => (
            <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
          ))}
        </tr></thead>
        <tbody className="divide-y divide-white/[0.05]">
          {shown.map(r => (
            <tr key={r.id} className="hover:bg-white/[0.02]">
              <td className="px-4 py-2.5 font-mono text-[11px] text-[#dcc1ae] whitespace-nowrap">
                {new Date(r.created_at).toLocaleString('en-IN', {
                  day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                })}
              </td>
              <td className="px-4 py-2.5">
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border whitespace-nowrap ${
                  r.action.includes('blacklist') || r.action.includes('delete') || r.action.includes('reject')
                    ? 'bg-red-500/10 text-red-400 border-red-500/20'
                    : r.action.includes('paid') || r.action.includes('payment') || r.action.includes('released')
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    : 'bg-white/5 text-[#dcc1ae] border-white/10'}`}>
                  {r.action_label}
                </span>
              </td>
              <td className="px-4 py-2.5 text-[12px] text-[#e2e2e8]">
                {r.vendor_name || '—'}
                {r.project_name && <div className="text-[10px] text-[#dcc1ae]/50">{r.project_name}</div>}
              </td>
              <td className="px-4 py-2.5 text-[12px] text-[#dcc1ae]">
                {r.actor_name || '—'}
                {r.actor_role && <div className="text-[10px] text-[#dcc1ae]/50">{r.actor_role}</div>}
              </td>
              <td className="px-4 py-2.5 text-[11px] max-w-[280px]">
                {r.old_value && r.new_value ? (
                  <>
                    <div className="text-red-400/80 truncate" title={fmt(r.old_value) ?? ''}>
                      − {fmt(r.old_value)}
                    </div>
                    <div className="text-emerald-400/80 truncate" title={fmt(r.new_value) ?? ''}>
                      + {fmt(r.new_value)}
                    </div>
                  </>
                ) : (
                  <span className="text-[#dcc1ae]/60 truncate block">
                    {r.detail?.reason ?? r.detail?.comment ?? r.detail?.bill_no ?? r.detail?.amount
                      ? JSON.stringify(r.detail).slice(0, 60) : '—'}
                  </span>
                )}
              </td>
            </tr>
          ))}
          {!shown.length && <tr><td colSpan={5} className="px-4 py-10 text-center text-[#dcc1ae]/60 text-sm">
            No audit entries.
          </td></tr>}
        </tbody>
      </table>
    </div>
  )
}

// ---------------- Merge ----------------
function MergeModal({ d, onClose, onDone }: { d: Dupe; onClose: () => void; onDone: () => void }) {
  const [preview, setPreview] = useState<any>(null)
  const [confirmText, setConfirmText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [result, setResult] = useState<any>(null)

  // what will actually move?
  useEffect(() => {
    (async () => {
      const [wo, bills, pos, issues, docs] = await Promise.all([
        supabase.from('work_orders').select('id', { count: 'exact', head: true }).eq('party_id', d.dupe_id),
        supabase.from('vendor_bills').select('id', { count: 'exact', head: true }).eq('party_id', d.dupe_id),
        supabase.from('inv_purchase_orders').select('id', { count: 'exact', head: true }).eq('vendor_id', d.dupe_id),
        supabase.from('vendor_issues').select('id', { count: 'exact', head: true }).eq('party_id', d.dupe_id),
        supabase.from('vendor_documents').select('id', { count: 'exact', head: true }).eq('party_id', d.dupe_id),
      ])
      setPreview({
        work_orders: wo.count ?? 0, bills: bills.count ?? 0,
        purchase_orders: pos.count ?? 0, issues: issues.count ?? 0, documents: docs.count ?? 0,
      })
    })()
  }, [d.dupe_id])

  const total = preview
    ? preview.work_orders + preview.bills + preview.purchase_orders + preview.issues + preview.documents
    : 0

  async function merge() {
    if (confirmText !== 'MERGE') { setErr('Type MERGE to confirm.'); return }
    setBusy(true); setErr(null)
    const { data, error } = await supabase.rpc('merge_vendors', {
      p_keep: d.keep_id, p_merge: d.dupe_id,
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    setResult((data as any[])?.[0] ?? {})
  }

  return createPortal((
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="bg-[#1B1F2A] border border-white/[0.08] rounded-2xl w-full max-w-lg p-5 shadow-[0px_10px_30px_rgba(0,0,0,0.5)]">

        {result ? (
          <>
            <div className="text-center py-4">
              <span className="material-symbols-outlined text-emerald-400" style={{ fontSize: '40px' }}>check_circle</span>
              <p className="text-[#e2e2e8] font-semibold mt-2 text-[15px]">Merged</p>
              <p className="text-[12px] text-[#dcc1ae] mt-1">
                Everything now points at <b className="text-[#e2e2e8]">{d.keep_name}</b>.
              </p>
            </div>
            <div className="rounded-lg bg-white/[0.03] border border-white/[0.05] p-3 space-y-1">
              <Line k="Work orders moved" v={result.moved_work_orders ?? 0} />
              <Line k="Bills moved" v={result.moved_bills ?? 0} />
              <Line k="Purchase orders moved" v={result.moved_pos ?? 0} />
              <Line k="Goods receipts moved" v={result.moved_grns ?? 0} />
              <Line k="Material issues moved" v={result.moved_issues ?? 0} />
            </div>
            <p className="text-[11px] text-[#dcc1ae]/60 mt-3">
              {d.dupe_name} has been marked Inactive, not deleted — its audit trail is preserved.
            </p>
            <button className="btn btn-primary w-full mt-4" onClick={onDone}>Done</button>
          </>
        ) : (
          <>
            <h3 className="font-headline text-lg font-semibold text-[#e2e2e8] mb-1">Merge Vendors</h3>
            <p className="text-[12px] text-[#dcc1ae] mb-4">
              This cannot be undone. Review carefully.
            </p>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/[0.05] p-3">
                <div className="text-[10px] text-emerald-400 uppercase tracking-wider font-bold mb-1">Keep</div>
                <div className="text-[14px] text-[#e2e2e8] font-semibold">{d.keep_name}</div>
                <div className="text-[11px] font-mono text-[#dcc1ae]/60">{d.keep_code}</div>
              </div>
              <div className="rounded-lg border border-red-500/25 bg-red-500/[0.05] p-3">
                <div className="text-[10px] text-red-400 uppercase tracking-wider font-bold mb-1">Merge &amp; retire</div>
                <div className="text-[14px] text-[#e2e2e8] font-semibold">{d.dupe_name}</div>
                <div className="text-[11px] font-mono text-[#dcc1ae]/60">{d.dupe_code}</div>
              </div>
            </div>

            <div className="rounded-lg bg-white/[0.03] border border-white/[0.05] p-3 mb-4">
              <div className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider mb-2">
                What will move to {d.keep_name}
              </div>
              {preview ? (
                <div className="space-y-1">
                  <Line k="Work orders" v={preview.work_orders} />
                  <Line k="Bills" v={preview.bills} />
                  <Line k="Purchase orders" v={preview.purchase_orders} />
                  <Line k="Material issues" v={preview.issues} />
                  <Line k="Documents" v={preview.documents} />
                  <div className="pt-1.5 mt-1.5 border-t border-white/[0.08] flex justify-between">
                    <span className="text-[12px] font-bold text-[#e2e2e8]">Total records</span>
                    <span className="font-mono text-[13px] font-bold text-[#ffb87b]">{total}</span>
                  </div>
                </div>
              ) : <div className="text-[12px] text-[#dcc1ae]/50">Checking…</div>}
              <p className="text-[11px] text-[#dcc1ae]/60 mt-2">
                Plus goods receipts, batches, the audit trail and every accounting voucher.
              </p>
            </div>

            <F label='Type MERGE to confirm'>
              <input className="input mono" value={confirmText}
                onChange={e => setConfirmText(e.target.value.toUpperCase())} placeholder="MERGE" />
            </F>

            {err && <div className="text-sm text-red-400 mt-3">{err}</div>}
            <div className="flex gap-2 mt-5">
              <button className="btn btn-ghost flex-1" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary flex-[2]" disabled={busy || confirmText !== 'MERGE'} onClick={merge}>
                {busy ? 'Merging…' : 'Merge Vendors'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  ), document.body)
}

function Line({ k, v }: { k: string; v: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[12px] text-[#dcc1ae]">{k}</span>
      <span className={`font-mono text-[13px] ${v > 0 ? 'text-[#e2e2e8] font-bold' : 'text-[#dcc1ae]/40'}`}>{v}</span>
    </div>
  )
}
function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider block mb-1">{label}</span>{children}</label>
}