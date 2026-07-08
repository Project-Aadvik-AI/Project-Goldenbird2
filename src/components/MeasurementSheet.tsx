import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { lineQty, sheetTotal, round2 } from '../lib/boq'

type MLine = {
  id: string; boq_item_id: string; sort_order: number | null
  description: string | null; nos: number; length: number; width: number; height: number
}

// New (unsaved) line while typing
type Draft = { description: string; nos: string; length: string; width: string; height: string }
const emptyDraft = (): Draft => ({ description: '', nos: '1', length: '', width: '', height: '' })
const num = (v: string) => { const n = parseFloat(v); return isFinite(n) ? n : 0 }

export default function MeasurementSheet({ itemId, itemDesc, unit, currentQty, canEdit, onClose, onApplied }: {
  itemId: string; itemDesc: string; unit: string | null; currentQty: number; canEdit: boolean
  onClose: () => void; onApplied: (newQty: number) => void
}) {
  const [lines, setLines] = useState<MLine[]>([])
  const [loading, setLoading] = useState(true)
  const [waste, setWaste] = useState('0')
  const [draft, setDraft] = useState<Draft>(emptyDraft())
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('boq_measurements').select('*')
      .eq('boq_item_id', itemId).order('sort_order').order('created_at')
    setLines((data as MLine[]) ?? []); setLoading(false)
  }
  useEffect(() => { load() }, [itemId])

  const subtotal = round2(lines.reduce((s, l) => s + lineQty(l.nos, l.length, l.width, l.height), 0))
  const wastePct = num(waste)
  const total = sheetTotal(lines, wastePct)

  async function addLine() {
    setErr(null)
    const nos = num(draft.nos), l = num(draft.length), w = num(draft.width), h = num(draft.height)
    if (!draft.description.trim() && !l && !w && !h && nos <= 1) { setErr('Enter a description or dimensions'); return }
    setBusy(true)
    const { data: prof } = await supabase.from('profiles').select('org_id').single()
    const { error } = await supabase.from('boq_measurements').insert({
      org_id: prof?.org_id, boq_item_id: itemId,
      description: draft.description || null, nos: nos || 1, length: l, width: w, height: h,
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    setDraft(emptyDraft()); load()
  }

  async function delLine(id: string) {
    await supabase.from('boq_measurements').delete().eq('id', id)
    load()
  }

  async function apply() {
    setBusy(true); setErr(null)
    const { error } = await supabase.from('boq_items').update({ quantity: total }).eq('id', itemId)
    setBusy(false)
    if (error) { setErr(error.message); return }
    onApplied(total)
  }

  return createPortal((
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6 bg-black/70 backdrop-blur-sm overflow-y-auto" onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="bg-[#1B1F2A] border border-white/[0.08] rounded-2xl w-full max-w-3xl my-auto shadow-[0px_10px_30px_rgba(0,0,0,0.5)] flex flex-col max-h-[90vh]">
        <div className="p-5 border-b border-white/5 flex items-center justify-between flex-shrink-0">
          <div>
            <h3 className="font-headline text-xl font-semibold text-[#e2e2e8]">Planned Quantity — Take-off</h3>
            <p className="text-[12px] text-[#dcc1ae]/70 mt-0.5 truncate max-w-[420px]">{itemDesc}{unit ? ` · ${unit}` : ''}</p>
          </div>
          <button type="button" className="text-[#dcc1ae] hover:text-white" onClick={onClose}><span className="material-symbols-outlined">close</span></button>
        </div>

        <div className="p-5 overflow-y-auto flex-1">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#282a2e]"><tr>
                {['Description', 'Nos', 'Length', 'Width', 'Height', 'Quantity', ''].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr></thead>
              <tbody className="divide-y divide-white/[0.05]">
                {lines.map(l => (
                  <tr key={l.id} className="hover:bg-white/[0.02]">
                    <td className="px-3 py-2 text-[#e2e2e8]">{l.description || '—'}</td>
                    <td className="px-3 py-2 font-mono text-[#dcc1ae] text-right">{l.nos}</td>
                    <td className="px-3 py-2 font-mono text-[#dcc1ae] text-right">{l.length || '—'}</td>
                    <td className="px-3 py-2 font-mono text-[#dcc1ae] text-right">{l.width || '—'}</td>
                    <td className="px-3 py-2 font-mono text-[#dcc1ae] text-right">{l.height || '—'}</td>
                    <td className="px-3 py-2 font-mono text-[#e2e2e8] text-right font-semibold">{lineQty(l.nos, l.length, l.width, l.height)}</td>
                    <td className="px-3 py-2 text-right">
                      <button className="text-red-400 hover:text-red-300" onClick={() => delLine(l.id)}><span className="material-symbols-outlined" style={{ fontSize: '16px' }}>delete</span></button>
                    </td>
                  </tr>
                ))}
                {/* draft entry row */}
                <tr className="bg-white/[0.02]">
                  <td className="px-2 py-2"><input className="input" style={{ padding: '6px 8px', fontSize: '13px' }} placeholder="Footing F1…" value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} /></td>
                  <td className="px-2 py-2"><input className="input mono text-right" style={{ padding: '6px 8px', fontSize: '13px', width: 64 }} inputMode="decimal" value={draft.nos} onChange={e => setDraft({ ...draft, nos: e.target.value.replace(/[^\d.]/g, '') })} /></td>
                  <td className="px-2 py-2"><input className="input mono text-right" style={{ padding: '6px 8px', fontSize: '13px', width: 72 }} inputMode="decimal" placeholder="L" value={draft.length} onChange={e => setDraft({ ...draft, length: e.target.value.replace(/[^\d.]/g, '') })} /></td>
                  <td className="px-2 py-2"><input className="input mono text-right" style={{ padding: '6px 8px', fontSize: '13px', width: 72 }} inputMode="decimal" placeholder="W" value={draft.width} onChange={e => setDraft({ ...draft, width: e.target.value.replace(/[^\d.]/g, '') })} /></td>
                  <td className="px-2 py-2"><input className="input mono text-right" style={{ padding: '6px 8px', fontSize: '13px', width: 72 }} inputMode="decimal" placeholder="H" value={draft.height} onChange={e => setDraft({ ...draft, height: e.target.value.replace(/[^\d.]/g, '') })} /></td>
                  <td className="px-3 py-2 font-mono text-[#dcc1ae] text-right">{lineQty(num(draft.nos), num(draft.length), num(draft.width), num(draft.height))}</td>
                  <td className="px-3 py-2 text-right">
                    <button className="text-emerald-400 hover:text-emerald-300" onClick={addLine} disabled={busy}><span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add_circle</span></button>
                  </td>
                </tr>
                {!lines.length && !loading && (
                  <tr><td colSpan={7} className="px-3 py-4 text-center text-[#dcc1ae]/50 text-[12px]">Add measurement lines above. Leave a dimension blank to skip it (e.g. only Nos = count, Nos×L = length, Nos×L×W = area).</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {err && <div className="text-sm text-red-400 mt-2">{err}</div>}

          {/* Totals */}
          <div className="mt-5 rounded-lg bg-white/[0.03] border border-white/[0.05] p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[13px] text-[#dcc1ae]">Subtotal ({lines.length} lines)</span>
              <span className="font-mono text-[14px] text-[#e2e2e8]">{subtotal}</span>
            </div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[13px] text-[#dcc1ae] flex items-center gap-2">Waste %
                <input className="input mono" style={{ padding: '4px 8px', fontSize: '12px', width: 70 }} inputMode="decimal" value={waste} onChange={e => setWaste(e.target.value.replace(/[^\d.]/g, ''))} />
              </span>
              <span className="font-mono text-[13px] text-[#dcc1ae]">+ {round2(subtotal * wastePct / 100)}</span>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-white/10">
              <span className="text-[13px] font-bold text-[#e2e2e8] uppercase tracking-wide">Total Quantity</span>
              <span className="font-mono text-[20px] font-bold text-emerald-400">{total}{unit ? ` ${unit}` : ''}</span>
            </div>
          </div>
        </div>

        <div className="p-5 pt-3 flex gap-3 border-t border-white/5 flex-shrink-0">
          <button type="button" className="btn btn-ghost flex-1" onClick={onClose}>Close</button>
          {canEdit ? (
            <button className="btn btn-primary flex-[2]" disabled={busy} onClick={apply}>
              {busy ? 'Applying…' : `Apply ${total} to Planned Quantity`}
            </button>
          ) : (
            <div className="flex-[2] text-center text-[12px] text-amber-400/90 py-2 px-3 rounded-lg bg-amber-500/5 border border-amber-500/10">
              BOQ is not in Draft — planned quantity is locked. Use a revision to change it.
            </div>
          )}
        </div>
        {canEdit && currentQty > 0 && (
          <div className="px-5 pb-4 -mt-2 text-[11px] text-[#dcc1ae]/60 text-center">Current planned quantity: {currentQty} — applying will replace it.</div>
        )}
      </div>
    </div>
  ), document.body)
}