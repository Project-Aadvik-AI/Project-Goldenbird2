import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'

// Targets that power the dashboard's "labour shortage" and
// "contractor manpower below requirement" alerts. Leave the list empty and
// those alerts simply stay quiet.

type Req = {
  id: string; contractor_name: string | null; trade: string | null; required_count: number
}

const TRADES = ['Mason', 'Carpenter', 'Bar Bender', 'Electrician', 'Plumber', 'Welder', 'Painter', 'Helper', 'Others']

export default function LabourRequirements({ projectId, onClose, onChanged }: { projectId: string; onClose: () => void; onChanged: () => void }) {
  const [rows, setRows] = useState<Req[]>([])
  const [loading, setLoading] = useState(true)
  const [contractor, setContractor] = useState('')
  const [trade, setTrade] = useState('All trades')
  const [count, setCount] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('labour_requirements')
      .select('id, contractor_name, trade, required_count')
      .eq('project_id', projectId).order('created_at', { ascending: false })
    setRows((data as Req[]) ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [projectId])

  async function add() {
    if (!count || Number(count) <= 0) { setErr('Enter a required count greater than zero.'); return }
    setBusy(true); setErr(null)
    const { data: prof } = await supabase.from('profiles').select('org_id').single()
    const { error } = await supabase.from('labour_requirements').insert({
      org_id: prof?.org_id, project_id: projectId,
      contractor_name: contractor.trim() || null,
      trade: trade === 'All trades' ? null : trade,
      required_count: Number(count),
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    setContractor(''); setTrade('All trades'); setCount('')
    await load(); onChanged()
  }

  async function remove(id: string) {
    await supabase.from('labour_requirements').delete().eq('id', id)
    await load(); onChanged()
  }

  return createPortal((
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6 bg-black/70 backdrop-blur-sm overflow-y-auto" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-[#1B1F2A] border border-white/[0.08] rounded-2xl w-full max-w-2xl my-auto shadow-[0px_10px_30px_rgba(0,0,0,0.5)] flex flex-col max-h-[90vh]">
        <div className="p-5 border-b border-white/5 flex items-center justify-between flex-shrink-0">
          <div>
            <h3 className="font-headline text-xl font-semibold text-[#e2e2e8]">Manpower Requirements</h3>
            <p className="text-[11px] text-[#dcc1ae]/70 mt-0.5">Daily targets for this project. Leave contractor blank for a whole-project target.</p>
          </div>
          <button className="text-[#dcc1ae] hover:text-white" onClick={onClose}><span className="material-symbols-outlined">close</span></button>
        </div>

        <div className="p-5 overflow-y-auto">
          {/* Add row */}
          <div className="grid grid-cols-12 gap-2 items-end mb-4">
            <label className="col-span-4 block">
              <span className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider block mb-1">Contractor (optional)</span>
              <input className="input" value={contractor} onChange={e => setContractor(e.target.value)} placeholder="Whole project" />
            </label>
            <label className="col-span-4 block">
              <span className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider block mb-1">Trade</span>
              <select className="input" value={trade} onChange={e => setTrade(e.target.value)}>
                <option>All trades</option>
                {TRADES.map(t => <option key={t}>{t}</option>)}
              </select>
            </label>
            <label className="col-span-2 block">
              <span className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider block mb-1">Required</span>
              <input className="input" inputMode="numeric" value={count} onChange={e => setCount(e.target.value)} placeholder="e.g. 12" />
            </label>
            <button className="btn btn-primary col-span-2" disabled={busy} onClick={add}>
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span> Add
            </button>
          </div>
          {err && <div className="text-sm text-red-400 mb-3">{err}</div>}

          <div className="overflow-x-auto rounded-lg border border-white/[0.05]">
            <table className="w-full text-[13px]">
              <thead className="bg-[#282a2e]"><tr>
                {['Contractor', 'Trade', 'Required / Day', ''].map(h => <th key={h} className="px-3 py-2 text-left text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider">{h}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-white/[0.05]">
                {rows.map(r => (
                  <tr key={r.id} className="hover:bg-white/[0.02]">
                    <td className="px-3 py-2 text-[#e2e2e8]">{r.contractor_name || <span className="text-[#dcc1ae]/60">Whole project</span>}</td>
                    <td className="px-3 py-2 text-[#dcc1ae]">{r.trade || 'All trades'}</td>
                    <td className="px-3 py-2 font-mono font-bold text-[#e2e2e8]">{r.required_count}</td>
                    <td className="px-3 py-2 text-right">
                      <button className="text-red-400 hover:text-red-300" onClick={() => remove(r.id)} title="Delete">
                        <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>delete</span>
                      </button>
                    </td>
                  </tr>
                ))}
                {!rows.length && !loading && (
                  <tr><td colSpan={4} className="px-3 py-8 text-center text-[#dcc1ae]/60">No requirements set yet.</td></tr>
                )}
              </tbody>
            </table>
            {loading && <div className="p-3 text-[#dcc1ae] text-sm">Loading…</div>}
          </div>
        </div>

        <div className="p-5 pt-3 flex gap-3 border-t border-white/5 flex-shrink-0">
          <button className="btn btn-primary w-full" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  ), document.body)
}