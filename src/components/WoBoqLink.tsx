import { useEffect, useMemo, useState } from 'react'
import { appAlert, appConfirm, appPrompt } from '../lib/dialogs'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

const inr = (n: number) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })
const q = (n: number) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 })

type BoqItem = {
  id: string; description: string; unit: string | null
  quantity: number; completed_qty: number | null; final_rate: number | null
  assigned_elsewhere?: number
}
type Linked = {
  id: string; boq_item_id: string; assigned_qty: number; agreed_rate: number
  target_date: string | null
  boq_items: { description: string; unit: string | null; quantity: number; completed_qty: number | null } | null
}

/**
 * The BOQ items a vendor is contracted to do, on one work order.
 * This link is what makes vendor progress possible — without it,
 * there is no way to know how much of THIS vendor's work is done.
 */
export function WoBoqLink({ woId, projectId }: { woId: string; projectId: string | null }) {
  const { isAdmin } = useAuth()
  const [rows, setRows] = useState<Linked[]>([])
  const [loading, setLoading] = useState(true)
  const [showPick, setShowPick] = useState(false)

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('wo_boq_items')
      .select('id, boq_item_id, assigned_qty, agreed_rate, target_date, boq_items(description, unit, quantity, completed_qty)')
      .eq('wo_id', woId).order('line_no')
    setRows((data as any[]) ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [woId])

  async function remove(id: string) {
    if (!await appConfirm('Remove this BOQ item from the work order?')) return
    await supabase.from('wo_boq_items').delete().eq('id', id)
    load()
  }

  const total = rows.reduce((n, r) => n + Number(r.assigned_qty) * Number(r.agreed_rate), 0)
  const done = rows.reduce((n, r) => {
    const bi = r.boq_items
    if (!bi || !bi.quantity) return n
    // the vendor's share of what has been measured
    const share = Number(bi.completed_qty ?? 0) * (Number(r.assigned_qty) / Number(bi.quantity))
    return n + Math.min(share, Number(r.assigned_qty)) * Number(r.agreed_rate)
  }, 0)
  const pct = total > 0 ? Math.round(done / total * 100) : 0

  if (loading) return <div className="text-[12px] text-[#dcc1ae]">Loading BOQ link…</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div>
          <span className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider">
            BOQ Items — what this vendor is contracted to do
          </span>
          {rows.length > 0 && (
            <p className="text-[11px] text-[#dcc1ae]/60 mt-0.5">
              Progress flows from the Measurement Book automatically.
            </p>
          )}
        </div>
        {isAdmin && (
          <button className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: '12px' }}
            onClick={() => setShowPick(true)}>
            <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>add</span> Add BOQ Items
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-white/[0.12] p-4 text-center">
          <p className="text-[12px] text-[#dcc1ae]/70">
            No BOQ items linked. <b className="text-[#dcc1ae]">Vendor progress cannot be tracked</b> until you add them.
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3 mb-2">
            <div className="flex-1 h-2 rounded-full bg-white/[0.06] overflow-hidden">
              <div className={`h-full rounded-full ${pct >= 80 ? 'bg-emerald-500' : 'bg-[#ff8f00]'}`}
                style={{ width: `${pct}%` }} />
            </div>
            <span className="font-mono text-[13px] font-bold text-[#e2e2e8]">{pct}%</span>
          </div>
          <div className="flex justify-between text-[11px] text-[#dcc1ae]/60 mb-3">
            <span>{inr(done)} completed</span>
            <span>{inr(total)} assigned</span>
          </div>

          <div className="rounded-lg border border-white/[0.08] overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#282a2e]"><tr>
                {['BOQ Item', 'Assigned', 'Rate', 'Value', 'Done', 'Target', ''].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr></thead>
              <tbody className="divide-y divide-white/[0.04]">
                {rows.map(r => {
                  const bi = r.boq_items
                  const share = bi && bi.quantity
                    ? Math.min(Number(bi.completed_qty ?? 0) * (Number(r.assigned_qty) / Number(bi.quantity)),
                               Number(r.assigned_qty))
                    : 0
                  const linePct = Number(r.assigned_qty) > 0
                    ? Math.round(share / Number(r.assigned_qty) * 100) : 0
                  const late = r.target_date && r.target_date < new Date().toISOString().slice(0, 10) && linePct < 100
                  return (
                    <tr key={r.id} className={late ? 'bg-red-500/[0.05]' : ''}>
                      <td className="px-3 py-2 max-w-[220px]">
                        <div className="text-[#e2e2e8] text-[12px] truncate" title={bi?.description}>
                          {bi?.description ?? '—'}
                        </div>
                        <div className="text-[10px] text-[#dcc1ae]/50">
                          BOQ has {q(bi?.quantity ?? 0)} {bi?.unit}
                        </div>
                      </td>
                      <td className="px-3 py-2 font-mono text-[12px] text-[#e2e2e8] text-right whitespace-nowrap">
                        {q(r.assigned_qty)} <span className="text-[10px] text-[#dcc1ae]/60">{bi?.unit}</span>
                      </td>
                      <td className="px-3 py-2 font-mono text-[12px] text-[#dcc1ae] text-right">{inr(r.agreed_rate)}</td>
                      <td className="px-3 py-2 font-mono text-[12px] font-bold text-[#e2e2e8] text-right whitespace-nowrap">
                        {inr(Number(r.assigned_qty) * Number(r.agreed_rate))}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <span className={`font-mono text-[12px] font-bold ${linePct >= 100 ? 'text-emerald-400' : linePct > 0 ? 'text-amber-400' : 'text-[#dcc1ae]/40'}`}>
                          {linePct}%
                        </span>
                        <div className="text-[10px] text-[#dcc1ae]/50">{q(share)}</div>
                      </td>
                      <td className={`px-3 py-2 font-mono text-[11px] whitespace-nowrap ${late ? 'text-red-400 font-bold' : 'text-[#dcc1ae]'}`}>
                        {r.target_date || '—'}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {isAdmin && (
                          <button className="text-red-400 hover:text-red-300" onClick={() => remove(r.id)}>
                            <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>close</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {showPick && (
        <BoqPicker woId={woId} projectId={projectId} existing={rows.map(r => r.boq_item_id)}
          onClose={() => setShowPick(false)} onSaved={() => { setShowPick(false); load() }} />
      )}
    </div>
  )
}

function BoqPicker({ woId, projectId, existing, onClose, onSaved }: {
  woId: string; projectId: string | null; existing: string[]
  onClose: () => void; onSaved: () => void
}) {
  const [items, setItems] = useState<BoqItem[]>([])
  const [picked, setPicked] = useState<Record<string, { qty: string; rate: string; target: string }>>({})
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      if (!projectId) return
      const { data: boqs } = await supabase.from('boqs').select('id').eq('project_id', projectId)
      const ids = ((boqs as any[]) ?? []).map(b => b.id)
      if (!ids.length) return

      const [{ data: its }, { data: assigned }] = await Promise.all([
        supabase.from('boq_items')
          .select('id, description, unit, quantity, completed_qty, final_rate')
          .in('boq_id', ids).order('sort_order'),
        supabase.from('wo_boq_items').select('boq_item_id, assigned_qty'),
      ])

      // how much of each BOQ item is already assigned to some vendor?
      const already: Record<string, number> = {}
      for (const a of ((assigned as any[]) ?? [])) {
        already[a.boq_item_id] = (already[a.boq_item_id] ?? 0) + Number(a.assigned_qty)
      }

      setItems(((its as any[]) ?? [])
        .filter(i => !existing.includes(i.id))
        .map(i => ({ ...i, assigned_elsewhere: already[i.id] ?? 0 })))
    })()
  }, [projectId])

  const shown = useMemo(() => {
    const s = search.trim().toLowerCase()
    return s ? items.filter(i => i.description.toLowerCase().includes(s)) : items
  }, [items, search])

  const toggle = (i: BoqItem) => {
    setPicked(p => {
      const next = { ...p }
      if (next[i.id]) delete next[i.id]
      else {
        const free = Number(i.quantity) - Number(i.assigned_elsewhere ?? 0)
        next[i.id] = { qty: String(free), rate: String(i.final_rate ?? 0), target: '' }
      }
      return next
    })
  }

  async function save() {
    const chosen = Object.entries(picked).filter(([, v]) => Number(v.qty) > 0)
    if (!chosen.length) { setErr('Pick at least one BOQ item.'); return }

    setBusy(true); setErr(null)
    const { data: u } = await supabase.auth.getUser()
    const { data: prof } = await supabase.from('profiles')
      .select('org_id').eq('id', u?.user?.id ?? '').maybeSingle()

    const { error } = await supabase.from('wo_boq_items').insert(
      chosen.map(([boqId, v], idx) => ({
        org_id: prof?.org_id, wo_id: woId, boq_item_id: boqId,
        assigned_qty: Number(v.qty),
        agreed_rate: Number(v.rate) || 0,
        target_date: v.target || null,
        line_no: idx + 1,
      }))
    )
    setBusy(false)
    if (error) { setErr(error.message); return }
    onSaved()
  }

  return createPortal((
    <div className="fixed inset-0 z-[110] flex items-start justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto" onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="bg-[#1B1F2A] border border-white/[0.08] rounded-2xl w-full max-w-3xl my-6 shadow-[0px_10px_30px_rgba(0,0,0,0.5)]">
        <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between sticky top-0 bg-[#1B1F2A] z-10">
          <div>
            <h3 className="font-headline text-lg font-semibold text-[#e2e2e8]">Add BOQ Items</h3>
            <p className="text-[11px] text-[#dcc1ae]/60">
              Pick what this vendor is contracted to do. Their progress will follow from the Measurement Book.
            </p>
          </div>
          <button className="text-[#dcc1ae] hover:text-white" onClick={onClose}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="p-5">
          <input className="input mb-3" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search BOQ items…" />

          <div className="rounded-lg border border-white/[0.08] overflow-hidden max-h-[50vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#282a2e] sticky top-0"><tr>
                {['', 'BOQ Item', 'Free Qty', 'Assign', 'Rate', 'Target'].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr></thead>
              <tbody className="divide-y divide-white/[0.04]">
                {shown.map(i => {
                  const free = Number(i.quantity) - Number(i.assigned_elsewhere ?? 0)
                  const on = !!picked[i.id]
                  return (
                    <tr key={i.id} className={on ? 'bg-[#ff8f00]/[0.06]' : 'hover:bg-white/[0.02]'}>
                      <td className="px-3 py-2">
                        <input type="checkbox" className="accent-[#ff8f00]" checked={on}
                          disabled={free <= 0} onChange={() => toggle(i)} />
                      </td>
                      <td className="px-3 py-2 max-w-[260px]">
                        <div className="text-[#e2e2e8] text-[12px] truncate" title={i.description}>{i.description}</div>
                        <div className="text-[10px] text-[#dcc1ae]/50">
                          BOQ {q(i.quantity)} {i.unit}
                          {Number(i.assigned_elsewhere) > 0 && (
                            <span className="text-amber-400"> · {q(i.assigned_elsewhere!)} already assigned</span>
                          )}
                        </div>
                      </td>
                      <td className={`px-3 py-2 font-mono text-[12px] text-right ${free <= 0 ? 'text-red-400' : 'text-[#dcc1ae]'}`}>
                        {q(free)}
                      </td>
                      <td className="px-3 py-2">
                        <input className="input mono text-right" style={{ padding: '4px 8px', fontSize: '12px', width: 80 }}
                          disabled={!on} value={picked[i.id]?.qty ?? ''}
                          onChange={e => setPicked(p => ({ ...p, [i.id]: { ...p[i.id], qty: e.target.value.replace(/[^\d.]/g, '') } }))} />
                      </td>
                      <td className="px-3 py-2">
                        <input className="input mono text-right" style={{ padding: '4px 8px', fontSize: '12px', width: 80 }}
                          disabled={!on} value={picked[i.id]?.rate ?? ''}
                          onChange={e => setPicked(p => ({ ...p, [i.id]: { ...p[i.id], rate: e.target.value.replace(/[^\d.]/g, '') } }))} />
                      </td>
                      <td className="px-3 py-2">
                        <input type="date" className="input" style={{ padding: '4px 8px', fontSize: '11px' }}
                          disabled={!on} value={picked[i.id]?.target ?? ''}
                          onChange={e => setPicked(p => ({ ...p, [i.id]: { ...p[i.id], target: e.target.value } }))} />
                      </td>
                    </tr>
                  )
                })}
                {!shown.length && <tr><td colSpan={6} className="px-3 py-8 text-center text-[#dcc1ae]/60 text-[13px]">
                  No BOQ items available. Create a BOQ for this project first.
                </td></tr>}
              </tbody>
            </table>
          </div>

          <p className="text-[11px] text-[#dcc1ae]/60 mt-2">
            The <b>rate</b> is what you agreed with the vendor — it may differ from the client's BOQ rate.
            A BOQ item can be split across vendors; the database refuses to over-assign it.
          </p>
        </div>

        {err && <div className="px-5 pb-2 text-sm text-red-400">{err}</div>}
        <div className="px-5 py-4 border-t border-white/[0.06] flex gap-2">
          <button className="btn btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary flex-[2]" disabled={busy} onClick={save}>
            {busy ? 'Adding…' : `Add ${Object.keys(picked).length} item(s)`}
          </button>
        </div>
      </div>
    </div>
  ), document.body)
}