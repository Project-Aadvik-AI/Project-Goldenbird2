import { useEffect, useMemo, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useProject } from '../lib/project'
import ExportButtons from '../components/ExportButtons'
import PrintButton from '../components/PrintButton'

const inr = (n: number) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })

type C = {
  id: string; claim_no: string; claim_date: string
  project_id: string; project_name: string | null
  title: string; status: string
  is_excusable: boolean; is_compensable: boolean; delay_type: string
  claim_basis: string
  days_claimed: number | null; days_granted: number | null; days_refused: number | null
  cost_claimed: number | null; cost_granted: number | null
  contract_clause: string | null; justification: string | null
  original_completion: string | null; revised_completion: string | null
  submission_ref: string | null; submitted_by_name: string | null; submitted_at: string | null
  decided_by_name: string | null; decided_by_org: string | null
  decision_date: string | null; decision_ref: string | null
  decision_remarks: string | null; revision_note: string | null
  recorded_by_name: string | null
  days_awaiting_decision: number | null
  hindrance_count: number; file_count: number
  evidence_days_logged: number; evidence_men_idle: number
  next_states: string[]
}
type Hin = {
  id: string; hindrance_no: string; title: string
  category: string; days_blocked: number; days_logged: number
  is_excusable: boolean | null; is_compensable: boolean | null
}
type Ev = {
  id: string; event_label: string; from_value: string | null; to_value: string | null
  comment: string | null; actor_name: string | null; actor_role: string | null; created_at: string
}

const CS: Record<string, string> = {
  'Draft': 'bg-white/5 text-[#dcc1ae] border-white/10',
  'Submitted': 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  'Under Review': 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  'Revision Requested': 'bg-amber-500/10 text-amber-400 border-amber-500/25',
  'Approved': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  'Partially Approved': 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  'Rejected': 'bg-red-500/15 text-red-400 border-red-500/30',
  'Withdrawn': 'bg-white/5 text-[#dcc1ae]/50 border-white/10',
}

export default function EOT() {
  const { isAdmin } = useAuth()
  const { activeProject } = useProject()

  // always holds the CURRENT project. A response for any other project
  // is stale and must be discarded.
  const _pRef = useRef<string | null>(activeProject?.id ?? null)
  _pRef.current = activeProject?.id ?? null

  const [rows, setRows] = useState<C[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [open, setOpen] = useState<C | null>(null)

  async function load() {
    const _p = activeProject?.id ?? null
    setLoading(true)
    let q: any = supabase.from('eot_claim_list').select('*').order('claim_date', { ascending: false })
    if (activeProject) q = q.eq('project_id', activeProject.id)
    const { data } = await q

    // ---- THE GUARD ----
    // Did the user switch project while we were waiting? If so, this
    // response is for a project they have left. Throw it away — otherwise
    // a slow response overwrites the new project's data, and the screen
    // looks perfectly correct while showing the wrong thing.
    if (_pRef.current !== _p) return

    setRows((data as C[]) ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [activeProject?.id])

  const kpi = useMemo(() => ({
    total: rows.length,
    draft: rows.filter(r => r.status === 'Draft').length,
    pending: rows.filter(r => ['Submitted', 'Under Review'].includes(r.status)).length,
    claimed: rows.reduce((n, r) => n + Number(r.days_claimed || 0), 0),
    granted: rows.reduce((n, r) => n + Number(r.days_granted || 0), 0),
    refused: rows.reduce((n, r) => n + Number(r.days_refused || 0), 0),
    costGranted: rows.reduce((n, r) => n + Number(r.cost_granted || 0), 0),
  }), [rows])

  const waiting = rows.filter(r => (r.days_awaiting_decision ?? 0) > 30)

  if (loading) return <div className="p-8 text-center text-[#dcc1ae] text-sm">Loading…</div>

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="font-headline text-2xl font-semibold text-[#e2e2e8]">Extension of Time</h1>
          <p className="text-sm text-[#dcc1ae] mt-0.5">
            <b className="text-[#e2e2e8]">You claim. They decide.</b> The days you are granted are
            theirs to set — never calculated from the hindrance days.
          </p>
        </div>
        {isAdmin && (
          <button className="btn btn-primary" onClick={() => setShowNew(true)}>
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>gavel</span>
            New EOT Claim
          </button>
        )}
      </div>

      {waiting.length > 0 && (
        <div className="card p-3 mb-4 bg-amber-500/5 border-amber-500/20 flex items-start gap-2">
          <span className="material-symbols-outlined text-amber-400" style={{ fontSize: '18px' }}>hourglass_top</span>
          <div className="text-[13px]">
            <b className="text-amber-400">
              {waiting.length} claim(s) have been with the client over 30 days
            </b>
            <span className="text-[#dcc1ae]"> — chase them for a decision.</span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5">
        <K label="Claims" value={String(kpi.total)} />
        <K label="Awaiting Decision" value={String(kpi.pending)}
          tone={kpi.pending ? 'amber' : undefined} />
        <K label="Days Claimed" value={String(kpi.claimed)} />
        <K label="Days GRANTED" value={String(kpi.granted)} tone="emerald" big />
        <K label="Days Refused" value={String(kpi.refused)}
          tone={kpi.refused ? 'red' : undefined} />
      </div>

      {kpi.costGranted > 0 && (
        <div className="card p-3 mb-5 bg-emerald-500/5 border-emerald-500/20 text-[13px]">
          <b className="text-emerald-400">{inr(kpi.costGranted)}</b>
          <span className="text-[#dcc1ae]"> of prolongation costs granted.</span>
        </div>
      )}

      <div className="card overflow-hidden overflow-x-auto">
        <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
          <div>
            <span className="text-sm font-semibold text-[#e2e2e8]">EOT Claims</span>
            <p className="text-[11px] text-[#dcc1ae]/60 mt-0.5">
              Hindrances are the <b>evidence</b>. The claim is a separate judgement.
            </p>
          </div>
          <div className="flex gap-2">
            <ExportButtons filename="eot-claims" title="EOT Claims" rows={rows}
              columns={[
                { header: 'Claim No.', get: (r: any) => r.claim_no },
                { header: 'Date', get: (r: any) => r.claim_date },
                { header: 'Project', get: (r: any) => r.project_name || '—' },
                { header: 'Title', get: (r: any) => r.title },
                { header: 'Delay Type', get: (r: any) => r.delay_type },
                { header: 'Contract Clause', get: (r: any) => r.contract_clause || '—' },
                { header: 'Justification', get: (r: any) => r.justification || '—' },
                { header: 'Hindrances Cited', get: (r: any) => Number(r.hindrance_count) },
                { header: 'Evidence: Days Logged', get: (r: any) => Number(r.evidence_days_logged) },
                { header: 'Evidence: Men Idle', get: (r: any) => Number(r.evidence_men_idle) },
                { header: 'Days CLAIMED', get: (r: any) => r.days_claimed ?? '—' },
                { header: 'Days GRANTED', get: (r: any) => r.days_granted ?? '—' },
                { header: 'Days Refused', get: (r: any) => r.days_refused ?? '—' },
                { header: 'Cost Claimed', get: (r: any) => Number(r.cost_claimed || 0) },
                { header: 'Cost Granted', get: (r: any) => Number(r.cost_granted || 0) },
                { header: 'Our Submission Ref', get: (r: any) => r.submission_ref || '—' },
                { header: 'Submitted On', get: (r: any) => r.submitted_at || '—' },
                { header: 'Decided By', get: (r: any) => r.decided_by_name || '—' },
                { header: 'Their Organisation', get: (r: any) => r.decided_by_org || '—' },
                { header: 'Their Letter Ref', get: (r: any) => r.decision_ref || '—' },
                { header: 'Decision Date', get: (r: any) => r.decision_date || '—' },
                { header: 'Their Remarks', get: (r: any) => r.decision_remarks || '—' },
                { header: 'Status', get: (r: any) => r.status },
              ]} />
            <PrintButton title="EOT Claims" />
          </div>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-[#282a2e]"><tr>
            {['Claim', 'Delay Type', 'Evidence', 'Claimed', 'Granted', 'Decided By', 'Status', ''].map(h => (
              <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
            ))}
          </tr></thead>
          <tbody className="divide-y divide-white/[0.05]">
            {rows.map(r => (
              <tr key={r.id} className="hover:bg-white/[0.02] cursor-pointer" onClick={() => setOpen(r)}>
                <td className="px-4 py-2.5 max-w-[200px]">
                  <div className="text-[#e2e2e8] font-semibold truncate">{r.title}</div>
                  <div className="text-[10px] font-mono text-[#dcc1ae]/50">
                    {r.claim_no} · {r.claim_date}
                    {r.project_name && ` · ${r.project_name}`}
                  </div>
                </td>
                <td className="px-4 py-2.5">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border whitespace-nowrap ${
                    r.is_compensable ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      : r.is_excusable ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                      : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
                    {r.is_compensable ? 'Time + Money' : r.is_excusable ? 'Time only' : 'Non-excusable'}
                  </span>
                  {r.contract_clause && (
                    <div className="text-[10px] text-[#dcc1ae]/50 mt-0.5">{r.contract_clause}</div>
                  )}
                </td>
                <td className="px-4 py-2.5 text-[11px] text-[#dcc1ae] whitespace-nowrap">
                  {r.hindrance_count} hindrance(s)
                  <div className="text-[10px] text-[#dcc1ae]/50">
                    {r.evidence_days_logged} days logged
                    {r.evidence_men_idle > 0 && ` · ${r.evidence_men_idle} man-days`}
                  </div>
                </td>
                <td className="px-4 py-2.5 font-mono text-right whitespace-nowrap">
                  {r.days_claimed != null ? (
                    <span className="text-[15px] font-bold text-[#e2e2e8]">{r.days_claimed}d</span>
                  ) : r.claim_basis === 'Assessment' ? (
                    <span className="text-[11px] text-[#dcc1ae]/60 font-sans">
                      no figure named
                      <div className="text-[10px] text-[#dcc1ae]/40">their assessment</div>
                    </span>
                  ) : <span className="text-[#dcc1ae]/30">—</span>}
                  {Number(r.cost_claimed) > 0 && (
                    <div className="text-[10px] text-[#dcc1ae]/50">{inr(r.cost_claimed!)}</div>
                  )}
                </td>
                <td className="px-4 py-2.5 font-mono text-right whitespace-nowrap">
                  {r.days_granted != null ? (
                    <>
                      <span className="text-[15px] font-bold text-emerald-400">{r.days_granted}d</span>
                      {Number(r.days_refused) > 0 && (
                        <div className="text-[10px] text-red-400">−{r.days_refused} refused</div>
                      )}
                    </>
                  ) : <span className="text-[#dcc1ae]/30">pending</span>}
                </td>
                <td className="px-4 py-2.5 text-[11px] text-[#dcc1ae]">
                  {r.decided_by_name ? (
                    <>
                      {r.decided_by_name}
                      <div className="text-[10px] text-[#dcc1ae]/50">
                        {r.decided_by_org} · {r.decision_ref}
                      </div>
                    </>
                  ) : r.days_awaiting_decision != null ? (
                    <span className="text-amber-400">waiting {r.days_awaiting_decision}d</span>
                  ) : '—'}
                </td>
                <td className="px-4 py-2.5">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border whitespace-nowrap ${CS[r.status]}`}>
                    {r.status}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right">
                  <span className="material-symbols-outlined text-[#dcc1ae]/40" style={{ fontSize: '18px' }}>chevron_right</span>
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={8} className="px-4 py-12 text-center text-[#dcc1ae]/60 text-sm">
              No EOT claims. Raise one and cite the hindrances that support it.
            </td></tr>}
          </tbody>
        </table>
      </div>

      {showNew && <NewClaim onClose={() => setShowNew(false)}
        onSaved={() => { setShowNew(false); load() }} />}
      {open && <ClaimDetail c={open} onClose={() => setOpen(null)}
        onChanged={() => { setOpen(null); load() }} />}
    </div>
  )
}

// =====================================================================
//  THE CLAIM
// =====================================================================
function ClaimDetail({ c, onClose, onChanged }: {
  c: C; onClose: () => void; onChanged: () => void
}) {
  const { isAdmin } = useAuth()
  const [events, setEvents] = useState<Ev[]>([])
  const [hins, setHins] = useState<any[]>([])
  const [showSubmit, setShowSubmit] = useState(false)
  const [showDecision, setShowDecision] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      const [{ data: e }, { data: h }] = await Promise.all([
        supabase.from('eot_claim_timeline').select('*')
          .eq('claim_id', c.id).order('created_at'),
        supabase.from('eot_claim_hindrances')
          .select('hindrance_id, hindrances(hindrance_no, title, category, hindrance_date)')
          .eq('claim_id', c.id),
      ])
      setEvents((e as Ev[]) ?? [])
      setHins((h as any[]) ?? [])
    })()
  }, [c.id])

  const decisions = (c.next_states ?? []).filter(s =>
    ['Approved', 'Partially Approved', 'Rejected', 'Revision Requested', 'Under Review'].includes(s))

  return createPortal((
    <div className="fixed inset-0 z-[100] flex items-start justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto" onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="bg-[#1B1F2A] border border-white/[0.08] rounded-2xl w-full max-w-2xl my-6 shadow-[0px_10px_30px_rgba(0,0,0,0.5)]">
        <div className="px-5 py-4 border-b border-white/[0.06] flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-headline text-lg font-semibold text-[#e2e2e8]">{c.title}</h3>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${CS[c.status]}`}>
                {c.status}
              </span>
            </div>
            <p className="text-[12px] text-[#dcc1ae] mt-0.5">
              <span className="font-mono">{c.claim_no}</span> · {c.claim_date}
              {c.project_name && ` · ${c.project_name}`}
            </p>
          </div>
          <div className="flex gap-2">
            <PrintButton title={c.claim_no} />
            <button className="text-[#dcc1ae] hover:text-white" onClick={onClose}>
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
        </div>

        <div className="p-5 space-y-5">
          {/* the two numbers, side by side — never conflated */}
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-4">
              <div className="text-[10px] text-[#dcc1ae]/60 uppercase tracking-wider">We Claimed</div>
              {c.days_claimed != null ? (
                <div className="font-mono text-[26px] font-bold text-[#e2e2e8] mt-1">
                  {c.days_claimed}d
                </div>
              ) : c.claim_basis === 'Assessment' ? (
                <div className="mt-1">
                  <div className="text-[15px] font-semibold text-[#dcc1ae]">No figure named</div>
                  <div className="text-[11px] text-[#dcc1ae]/60 mt-0.5">
                    We submitted the evidence and asked them to assess it.
                  </div>
                </div>
              ) : (
                <div className="font-mono text-[26px] font-bold text-[#dcc1ae]/30 mt-1">—</div>
              )}
              {Number(c.cost_claimed) > 0 && (
                <div className="text-[12px] text-[#dcc1ae] mt-0.5">+ {inr(c.cost_claimed!)}</div>
              )}
              {c.submission_ref && (
                <div className="text-[10px] text-[#dcc1ae]/50 mt-1 font-mono">{c.submission_ref}</div>
              )}
            </div>
            <div className={`rounded-lg border p-4 ${
              c.days_granted != null ? 'border-emerald-500/25 bg-emerald-500/[0.05]'
                : 'border-white/[0.08] bg-white/[0.02]'}`}>
              <div className="text-[10px] text-[#dcc1ae]/60 uppercase tracking-wider">They Granted</div>
              <div className={`font-mono text-[26px] font-bold mt-1 ${
                c.days_granted != null ? 'text-emerald-400' : 'text-[#dcc1ae]/30'}`}>
                {c.days_granted != null ? `${c.days_granted}d` : 'pending'}
              </div>
              {Number(c.cost_granted) > 0 && (
                <div className="text-[12px] text-emerald-400 mt-0.5">+ {inr(c.cost_granted!)}</div>
              )}
              {Number(c.days_refused) > 0 && c.claim_basis === 'Named' && (
                <div className="text-[11px] text-red-400 mt-1">
                  {c.days_refused} day(s) refused
                </div>
              )}
              {c.days_granted != null && c.claim_basis === 'Assessment' && (
                <div className="text-[11px] text-[#dcc1ae]/60 mt-1">
                  Their assessment. We named no figure, so nothing was refused.
                </div>
              )}
            </div>
          </div>

          <div className="card p-3 bg-white/[0.02] text-[11px] text-[#dcc1ae]">
            The granted figure is <b className="text-[#e2e2e8]">theirs</b>. It is never computed from
            the hindrance days — they may grant fewer, the same, or more.
            {c.claim_basis === 'Assessment' && (
              <> This claim named <b className="text-[#e2e2e8]">no figure</b>: we put the evidence
              in front of them and let them assess it.</>
            )}
          </div>

          {c.decided_by_name && (
            <div>
              <Sec>Their Decision</Sec>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Info label="Decided By" v={c.decided_by_name} />
                <Info label="Organisation" v={c.decided_by_org ?? '—'} />
                <Info label="Their Letter" v={c.decision_ref ?? '—'} />
                <Info label="Date" v={c.decision_date ?? '—'} />
              </div>
              {c.decision_remarks && (
                <p className="text-[12px] text-[#dcc1ae] italic mt-2">"{c.decision_remarks}"</p>
              )}
            </div>
          )}

          {c.revision_note && c.status === 'Revision Requested' && (
            <div className="card p-3 bg-amber-500/5 border-amber-500/25">
              <b className="text-amber-400 text-[12px]">They want more from us:</b>
              <p className="text-[12px] text-[#dcc1ae] mt-1">{c.revision_note}</p>
            </div>
          )}

          {/* classification */}
          <div>
            <Sec>Delay Classification</Sec>
            <div className="flex gap-2 flex-wrap">
              <span className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold border ${
                c.is_excusable ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
                {c.is_excusable ? '✓ Excusable — entitled to TIME' : '✗ Not excusable'}
              </span>
              <span className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold border ${
                c.is_compensable ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  : 'bg-white/5 text-[#dcc1ae] border-white/10'}`}>
                {c.is_compensable
                  ? '✓ Compensable — entitled to MONEY as well'
                  : '— Time only, no prolongation costs'}
              </span>
            </div>
          </div>

          {c.justification && (
            <div>
              <Sec>Justification</Sec>
              <p className="text-[13px] text-[#dcc1ae] whitespace-pre-wrap">{c.justification}</p>
              {c.contract_clause && (
                <p className="text-[12px] text-[#ffb87b] mt-1">Relying on {c.contract_clause}</p>
              )}
            </div>
          )}

          {/* the evidence */}
          <div>
            <Sec>Evidence — the hindrances this claim rests on</Sec>
            {hins.length ? (
              <div className="space-y-1.5">
                {hins.map(h => (
                  <div key={h.hindrance_id}
                    className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5">
                    <div className="text-[13px] text-[#e2e2e8]">{h.hindrances?.title}</div>
                    <div className="text-[11px] text-[#dcc1ae]/60 font-mono">
                      {h.hindrances?.hindrance_no} · {h.hindrances?.category} · {h.hindrances?.hindrance_date}
                    </div>
                  </div>
                ))}
                <p className="text-[11px] text-[#dcc1ae]/60 mt-2">
                  {c.evidence_days_logged} day(s) logged
                  {c.evidence_men_idle > 0 && ` · ${c.evidence_men_idle} man-days idle`}
                  {' '}— this is what supports the claim. It is <b>not</b> the claim itself.
                </p>
              </div>
            ) : (
              <p className="text-[12px] text-red-400">
                No hindrances attached. A claim with no evidence is an assertion.
              </p>
            )}
          </div>

          {/* actions */}
          {isAdmin && c.status === 'Draft' && (
            <div className="pt-4 border-t border-white/[0.06]">
              <button className="btn btn-primary w-full" onClick={() => setShowSubmit(true)}>
                <span className="material-symbols-outlined" style={{ fontSize: '17px' }}>send</span>
                Submit to the Client
              </button>
            </div>
          )}

          {isAdmin && decisions.length > 0 && (
            <div className="pt-4 border-t border-white/[0.06]">
              <Sec>Record the client's decision</Sec>
              <p className="text-[11px] text-[#dcc1ae]/60 mb-2">
                The client does not have a login here. Record what they decided, who signed it,
                and which letter says so.
              </p>
              <div className="flex flex-wrap gap-2">
                {decisions.map(d => (
                  <button key={d}
                    className={`btn ${d === 'Rejected' ? 'btn-ghost' : 'btn-primary'}`}
                    style={{ padding: '7px 14px', fontSize: '12px' }}
                    onClick={() => setShowDecision(d)}>
                    {d}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* the audit trail */}
          <div className="pt-4 border-t border-white/[0.06]">
            <Sec>Audit Trail</Sec>
            <div className="relative pl-5">
              <div className="absolute left-[5px] top-1 bottom-1 w-px bg-white/[0.08]" />
              {events.map(e => (
                <div key={e.id} className="relative pb-4 last:pb-0">
                  <div className={`absolute -left-5 top-1 h-3 w-3 rounded-full border-2 bg-[#1B1F2A] ${
                    e.event_label.includes('Approv') ? 'border-emerald-400'
                      : e.event_label.includes('Reject') ? 'border-red-400'
                      : 'border-[#ff8f00]/50'}`} />
                  <div className="text-[13px] text-[#e2e2e8]">
                    {e.event_label}
                    {e.from_value && e.to_value && (
                      <span className="text-[#dcc1ae]">
                        : {e.from_value} → <b className="text-[#e2e2e8]">{e.to_value}</b>
                      </span>
                    )}
                  </div>
                  {e.comment && (
                    <div className="text-[12px] text-[#dcc1ae]">{e.comment}</div>
                  )}
                  <div className="text-[11px] text-[#dcc1ae]/50">
                    {e.actor_name ?? 'Someone'}
                    {e.actor_role && ` (${e.actor_role})`}
                    {' · '}
                    {new Date(e.created_at).toLocaleString('en-IN', {
                      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                    })}
                  </div>
                </div>
              ))}
              {!events.length && <div className="text-[12px] text-[#dcc1ae]/50">Nothing yet.</div>}
            </div>
          </div>
        </div>
      </div>

      {showSubmit && <SubmitForm c={c} onClose={() => setShowSubmit(false)}
        onDone={() => { setShowSubmit(false); onChanged() }} />}
      {showDecision && <DecisionForm c={c} decision={showDecision}
        onClose={() => setShowDecision(null)}
        onDone={() => { setShowDecision(null); onChanged() }} />}
    </div>
  ), document.body)
}

// ---------------- SUBMIT (we ask) ----------------
function SubmitForm({ c, onClose, onDone }: { c: C; onClose: () => void; onDone: () => void }) {
  // TWO ways this actually happens on site. Both are legitimate.
  const [basis, setBasis] = useState<'Named' | 'Assessment'>('Named')
  const [days, setDays] = useState(String(c.days_claimed ?? ''))
  const [cost, setCost] = useState(String(c.cost_claimed ?? ''))
  const [ref, setRef] = useState(c.submission_ref ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function go(e: React.FormEvent) {
    e.preventDefault()
    if (basis === 'Named' && !Number(days)) {
      setErr('How many days are you asking for? Or choose "let them assess it".')
      return
    }
    setBusy(true); setErr(null)
    const { error } = await supabase.rpc('submit_eot_claim', {
      p_claim: c.id,
      p_days: basis === 'Named' ? (Number(days) || null) : null,
      p_ref: ref || null,
      p_cost: basis === 'Named' ? (Number(cost) || null) : null,
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    onDone()
  }

  return createPortal((
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <form onClick={e => e.stopPropagation()} onSubmit={go}
        className="bg-[#1B1F2A] border border-white/[0.08] rounded-2xl w-full max-w-md p-5 shadow-[0px_10px_30px_rgba(0,0,0,0.5)] overflow-y-auto max-h-[92vh]">
        <h3 className="font-headline text-lg font-semibold text-[#e2e2e8] mb-1">Submit the Claim</h3>
        <p className="text-[12px] text-[#dcc1ae] mb-4">
          Your evidence: <b className="text-[#e2e2e8]">{c.hindrance_count} hindrance(s)</b>,
          {' '}<b className="text-[#e2e2e8]">{c.evidence_days_logged} day(s) logged</b>
          {c.evidence_men_idle > 0 && <>, <b className="text-[#e2e2e8]">{c.evidence_men_idle} man-days idle</b></>}.
        </p>

        <div className="space-y-3">
          <F label="How are you submitting it?">
            <div className="space-y-2 mt-1">
              <button type="button" onClick={() => setBasis('Named')}
                className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors ${
                  basis === 'Named' ? 'bg-[#ff8f00]/10 border-[#ff8f00]/30'
                    : 'border-white/[0.08] hover:bg-white/[0.03]'}`}>
                <div className={`text-[13px] font-semibold ${basis === 'Named' ? 'text-[#ffb87b]' : 'text-[#e2e2e8]'}`}>
                  We claim a specific number of days
                </div>
                <div className="text-[11px] text-[#dcc1ae] mt-0.5">
                  Anchors the negotiation. Strong if your evidence supports the figure —
                  but ask for 40 when the record shows 25, and you look opportunistic.
                </div>
              </button>

              <button type="button" onClick={() => setBasis('Assessment')}
                className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors ${
                  basis === 'Assessment' ? 'bg-[#ff8f00]/10 border-[#ff8f00]/30'
                    : 'border-white/[0.08] hover:bg-white/[0.03]'}`}>
                <div className={`text-[13px] font-semibold ${basis === 'Assessment' ? 'text-[#ffb87b]' : 'text-[#e2e2e8]'}`}>
                  Submit the evidence — let them assess it
                </div>
                <div className="text-[11px] text-[#dcc1ae] mt-0.5">
                  You name no figure. Common with government clients, and where the
                  Engineer-in-Charge prefers to assess it himself. You cannot be accused
                  of inflating a number you never gave.
                </div>
              </button>
            </div>
          </F>

          {basis === 'Named' ? (
            <>
              <F label="Days Claimed *">
                <input className="input mono text-right" inputMode="numeric" value={days}
                  onChange={e => setDays(e.target.value.replace(/[^\d]/g, ''))} autoFocus />
                <p className="text-[11px] text-[#dcc1ae]/50 mt-1">
                  Your judgement — not a sum. The system will not fill it in from the hindrance days.
                </p>
              </F>

              {c.is_compensable && (
                <F label="Prolongation Costs Claimed *">
                  <input className="input mono text-right" inputMode="decimal" value={cost}
                    onChange={e => setCost(e.target.value.replace(/[^\d.]/g, ''))} />
                  <p className="text-[11px] text-[#dcc1ae]/50 mt-1">
                    This is a <b>compensable</b> delay — money as well as time.
                  </p>
                </F>
              )}
            </>
          ) : (
            <div className="card p-3 bg-white/[0.03] text-[12px] text-[#dcc1ae]">
              No figure will be recorded. The claim goes across with the hindrance register
              and the justification, and <b className="text-[#e2e2e8]">whatever they grant is
              the decision</b> — there is nothing for it to have fallen short of.
            </div>
          )}

          <F label="Our Letter Reference">
            <input className="input mono" value={ref} onChange={e => setRef(e.target.value)}
              placeholder="AAD/NALCO/EOT/2026/003" />
          </F>
        </div>

        {err && <div className="text-sm text-red-400 mt-3">{err}</div>}
        <div className="flex gap-2 mt-5">
          <button type="button" className="btn btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary flex-[2]" disabled={busy}>
            {busy ? 'Submitting…' : basis === 'Named' ? `Claim ${days || '—'} days` : 'Submit for Assessment'}
          </button>
        </div>
      </form>
    </div>
  ), document.body)
}

// ---------------- THE DECISION (they decide) ----------------
function DecisionForm({ c, decision, onClose, onDone }: {
  c: C; decision: string; onClose: () => void; onDone: () => void
}) {
  const [days, setDays] = useState('')
  const [cost, setCost] = useState('')
  const [name, setName] = useState(c.decided_by_name ?? '')
  const [org, setOrg] = useState(c.decided_by_org ?? '')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [ref, setRef] = useState('')
  const [remarks, setRemarks] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const needsDays = ['Approved', 'Partially Approved'].includes(decision)
  const needsWho = ['Approved', 'Partially Approved', 'Rejected'].includes(decision)

  async function go(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setErr(null)
    const { error } = await supabase.rpc('record_eot_decision', {
      p_claim: c.id,
      p_decision: decision,
      p_days_granted: needsDays ? (Number(days) || 0) : null,
      p_decided_by_name: name || null,
      p_decided_by_org: org || null,
      p_decision_date: date,
      p_decision_ref: ref || null,
      p_remarks: remarks || null,
      p_cost_granted: Number(cost) || null,
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    onDone()
  }

  return createPortal((
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <form onClick={e => e.stopPropagation()} onSubmit={go}
        className="bg-[#1B1F2A] border border-white/[0.08] rounded-2xl w-full max-w-md p-5 shadow-[0px_10px_30px_rgba(0,0,0,0.5)] overflow-y-auto max-h-[92vh]">
        <h3 className="font-headline text-lg font-semibold text-[#e2e2e8] mb-1">{decision}</h3>
        <p className="text-[12px] text-[#dcc1ae] mb-4">
          You claimed <b className="text-[#e2e2e8]">{c.days_claimed ?? '—'} day(s)</b>.
          Record what the client actually decided.
        </p>

        <div className="space-y-3">
          {needsDays && (
            <>
              <F label="Days They Granted *">
                <input className="input mono text-right" inputMode="numeric" value={days}
                  onChange={e => setDays(e.target.value.replace(/[^\d]/g, ''))} autoFocus />
                <p className="text-[11px] text-[#dcc1ae]/50 mt-1">
                  Whatever their letter says — fewer, the same, or more than you asked.
                </p>
              </F>
              {c.is_compensable && (
                <F label="Costs They Granted">
                  <input className="input mono text-right" inputMode="decimal" value={cost}
                    onChange={e => setCost(e.target.value.replace(/[^\d.]/g, ''))} />
                </F>
              )}
            </>
          )}

          {needsWho && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <F label="Who Decided? *">
                  <input className="input" value={name} onChange={e => setName(e.target.value)}
                    placeholder="R. Sharma, Engineer-in-Charge" />
                </F>
                <F label="Their Organisation">
                  <input className="input" value={org} onChange={e => setOrg(e.target.value)}
                    placeholder="NALCO" />
                </F>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <F label="Their Letter Ref *">
                  <input className="input mono" value={ref} onChange={e => setRef(e.target.value)}
                    placeholder="NALCO/PROJ/2026/0891" />
                </F>
                <F label="Decision Date">
                  <input type="date" className="input" value={date}
                    onChange={e => setDate(e.target.value)} />
                </F>
              </div>
            </>
          )}

          <F label={decision === 'Revision Requested' ? 'What did they ask for? *' : 'Their Remarks'}>
            <textarea className="input" rows={3} value={remarks}
              onChange={e => setRemarks(e.target.value)} />
          </F>
        </div>

        {err && <div className="text-sm text-red-400 mt-3">{err}</div>}
        <div className="flex gap-2 mt-5">
          <button type="button" className="btn btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary flex-[2]" disabled={busy}>
            {busy ? 'Recording…' : 'Record Decision'}
          </button>
        </div>
      </form>
    </div>
  ), document.body)
}

// ---------------- NEW CLAIM ----------------
function NewClaim({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { activeProject } = useProject()
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([])
  const [hins, setHins] = useState<Hin[]>([])
  const [picked, setPicked] = useState<Set<string>>(new Set())

  const [projectId, setProjectId] = useState(activeProject?.id ?? '')
  const [title, setTitle] = useState('')
  const [clause, setClause] = useState('')
  const [justification, setJustification] = useState('')
  const [excusable, setExcusable] = useState(true)
  const [compensable, setCompensable] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    supabase.from('projects').select('id, name').eq('status', 'Active').order('name')
      .then(({ data }) => setProjects((data as any[]) ?? []))
  }, [])

  useEffect(() => {
    if (!projectId) { setHins([]); return }
    supabase.from('hindrance_register').select('*')
      .eq('project_id', projectId)
      .then(({ data }) => setHins(((data as any[]) ?? []).map(h => ({
        id: h.id, hindrance_no: h.hindrance_no, title: h.title,
        category: h.category, days_blocked: h.age_days, days_logged: 0,
        is_excusable: h.is_excusable, is_compensable: h.is_compensable,
      }))))
  }, [projectId])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!projectId) { setErr('Which project?'); return }
    if (!title.trim()) { setErr('Give the claim a title.'); return }
    if (!justification.trim()) {
      setErr('A claim without a justification will be rejected. Explain why you are entitled.'); return
    }
    if (!picked.size) { setErr('Cite at least one hindrance as evidence.'); return }

    setBusy(true); setErr(null)
    const { data: u } = await supabase.auth.getUser()
    const uid = u?.user?.id
    const { data: prof } = await supabase.from('profiles')
      .select('org_id').eq('id', uid ?? '').maybeSingle()

    const { data: no, error: nErr } = await supabase.rpc('next_eot_claim_no')
    if (nErr) { setErr(nErr.message); setBusy(false); return }

    const { data: c, error } = await supabase.from('eot_claims').insert({
      org_id: prof?.org_id, project_id: projectId,
      claim_no: no, title: title.trim(),
      contract_clause: clause || null,
      justification: justification.trim(),
      is_excusable: excusable, is_compensable: compensable,
      status: 'Draft', created_by: uid,
    }).select('id').single()

    if (error) { setErr(error.message); setBusy(false); return }
    const cid = (c as any).id

    await supabase.from('eot_claim_hindrances').insert(
      [...picked].map(hid => ({ org_id: prof?.org_id, claim_id: cid, hindrance_id: hid }))
    )

    setBusy(false)
    onSaved()
  }

  return createPortal((
    <div className="fixed inset-0 z-[100] flex items-start justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto" onClick={onClose}>
      <form onClick={e => e.stopPropagation()} onSubmit={save}
        className="bg-[#1B1F2A] border border-white/[0.08] rounded-2xl w-full max-w-2xl my-6 shadow-[0px_10px_30px_rgba(0,0,0,0.5)]">
        <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between sticky top-0 bg-[#1B1F2A] z-10">
          <div>
            <h3 className="font-headline text-lg font-semibold text-[#e2e2e8]">New EOT Claim</h3>
            <p className="text-[11px] text-[#dcc1ae]/60">
              Cite the hindrances. The days you claim are your judgement, not a sum.
            </p>
          </div>
          <button type="button" className="text-[#dcc1ae] hover:text-white" onClick={onClose}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <F label="Project *">
              <select className="input" value={projectId} onChange={e => setProjectId(e.target.value)}>
                <option value="">— Select —</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </F>
            <F label="Contract Clause">
              <input className="input" value={clause} onChange={e => setClause(e.target.value)}
                placeholder="Clause 8.4" />
            </F>
          </div>

          <F label="Claim Title *">
            <input className="input" value={title} onChange={e => setTitle(e.target.value)}
              placeholder="EOT for delayed handover of land at Ch. 2+400 to 3+100" />
          </F>

          <div>
            <F label="Delay Classification">
              <div className="flex flex-col gap-2 mt-1">
                <label className="flex items-center gap-2 text-[13px] text-[#dcc1ae] cursor-pointer">
                  <input type="checkbox" className="accent-[#ff8f00]" checked={excusable}
                    onChange={e => setExcusable(e.target.checked)} />
                  <b className="text-[#e2e2e8]">Excusable</b> — we are entitled to more TIME
                </label>
                <label className="flex items-center gap-2 text-[13px] text-[#dcc1ae] cursor-pointer">
                  <input type="checkbox" className="accent-[#ff8f00]" checked={compensable}
                    disabled={!excusable}
                    onChange={e => setCompensable(e.target.checked)} />
                  <b className="text-[#e2e2e8]">Compensable</b> — we are also entitled to MONEY
                </label>
              </div>
            </F>
            <p className="text-[11px] text-[#dcc1ae]/50 mt-1.5">
              A client breach is usually both. Weather is excusable but <b>not</b> compensable —
              time, but no money.
            </p>
          </div>

          <F label="Justification *">
            <textarea className="input" rows={4} value={justification}
              onChange={e => setJustification(e.target.value)}
              placeholder="Under Clause 8.4, the Employer was obliged to give possession of the site by 01 Jun 2026. Possession of Ch. 2+400 to 3+100 was not given until 15 Jul 2026. Embankment work on this stretch could not commence…" />
            <p className="text-[11px] text-[#dcc1ae]/50 mt-1">
              Cite the clause. State the obligation. State what they failed to do. A claim without
              this will be rejected.
            </p>
          </F>

          <div>
            <div className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider mb-2">
              Evidence — which hindrances support this? *
            </div>
            {hins.length ? (
              <div className="rounded-lg border border-white/[0.08] overflow-hidden max-h-52 overflow-y-auto">
                {hins.map(h => (
                  <label key={h.id}
                    className={`flex items-start gap-2 p-2.5 border-b border-white/[0.04] last:border-0 cursor-pointer ${
                      picked.has(h.id) ? 'bg-[#ff8f00]/[0.06]' : 'hover:bg-white/[0.02]'}`}>
                    <input type="checkbox" className="accent-[#ff8f00] mt-0.5"
                      checked={picked.has(h.id)}
                      onChange={() => setPicked(p => {
                        const n = new Set(p)
                        n.has(h.id) ? n.delete(h.id) : n.add(h.id)
                        return n
                      })} />
                    <div className="min-w-0">
                      <div className="text-[13px] text-[#e2e2e8] truncate">{h.title}</div>
                      <div className="text-[10px] text-[#dcc1ae]/50 font-mono">
                        {h.hindrance_no} · {h.category}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            ) : (
              <p className="text-[12px] text-[#dcc1ae]/60">
                {projectId ? 'No hindrances on this project yet.' : 'Select a project first.'}
              </p>
            )}
          </div>
        </div>

        {err && <div className="px-5 pb-2 text-sm text-red-400">{err}</div>}
        <div className="px-5 py-4 border-t border-white/[0.06] flex gap-2">
          <button type="button" className="btn btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary flex-[2]" disabled={busy}>
            {busy ? 'Saving…' : 'Create Draft'}
          </button>
        </div>
        <p className="px-5 pb-4 text-[11px] text-[#dcc1ae]/50">
          It starts as a <b>Draft</b>. You set the days when you submit it.
        </p>
      </form>
    </div>
  ), document.body)
}

function Sec({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider mb-2 pb-1 border-b border-white/[0.06]">{children}</div>
}
function Info({ label, v }: { label: string; v: string }) {
  return (
    <div>
      <div className="text-[10px] text-[#dcc1ae]/60 uppercase tracking-wider">{label}</div>
      <div className="text-[13px] font-semibold text-[#e2e2e8] mt-0.5">{v}</div>
    </div>
  )
}
function K({ label, value, tone, big }: {
  label: string; value: string; tone?: 'amber' | 'red' | 'emerald'; big?: boolean
}) {
  const c = tone === 'amber' ? 'text-amber-400' : tone === 'red' ? 'text-red-400'
    : tone === 'emerald' ? 'text-emerald-400' : 'text-[#e2e2e8]'
  return (
    <div className={`card p-3 ${big ? 'border-emerald-500/25 bg-emerald-500/[0.04]' : ''}`}>
      <div className="text-[10px] text-[#dcc1ae]/60 uppercase tracking-wider mb-1">{label}</div>
      <div className={`font-mono ${big ? 'text-[21px]' : 'text-[19px]'} font-bold ${c}`}>{value}</div>
    </div>
  )
}
function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider block mb-1">{label}</span>{children}</label>
}