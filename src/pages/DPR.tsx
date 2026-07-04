import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useProject, NoProjectPrompt } from '../lib/project'
import { useAuth } from '../lib/auth'
import { uploadPrivate, makeObjectPath } from '../lib/storage'
import { PrivateImage } from '../components/PrivateFile'

type DprRow = {
  id: string; date: string; schedule: string; item: string; unit: string
  today_qty: number; cumulative_qty: number | null; boq_qty: number | null; remark: string | null
}
type HindranceRow = { id: string; date: string; hindrance: string; photo: string | null }
type BoqItem = { schedule: string; item: string; unit: string; boq_qty: number | null }

export default function DPR() {
  const { activeProject } = useProject()
  const { can } = useAuth()
  const [tab, setTab] = useState<'progress' | 'hindrances'>('progress')
  const [dprRows, setDprRows] = useState<DprRow[]>([])
  const [hindrances, setHindrances] = useState<HindranceRow[]>([])
  const [boq, setBoq] = useState<BoqItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  async function load() {
    if (!activeProject) { setDprRows([]); setHindrances([]); setBoq([]); setLoading(false); return }
    setLoading(true)
    const [{ data: dpr }, { data: hind }, { data: boqData }] = await Promise.all([
      supabase.from('dpr').select('*').eq('project_id', activeProject.id).order('date', { ascending: false }).limit(300),
      supabase.from('dpr_hindrance').select('*').eq('project_id', activeProject.id).order('date', { ascending: false }).limit(200),
      supabase.from('m_boq').select('schedule, item, unit, boq_qty').eq('project_id', activeProject.id).order('schedule').order('item'),
    ])
    setDprRows((dpr as DprRow[]) ?? [])
    setHindrances((hind as HindranceRow[]) ?? [])
    setBoq((boqData as BoqItem[]) ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [activeProject?.id])

  if (!activeProject) return <NoProjectPrompt />

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-headline text-2xl font-semibold text-[#e2e2e8]">Daily Progress (DPR)</h1>
          <p className="text-sm text-[#dcc1ae] mt-0.5">BoQ progress tracking and site hindrances</p>
        </div>
        {can('dpr', 'add') && (
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span>
            Add {tab === 'progress' ? 'Entry' : 'Hindrance'}
          </button>
        )}
      </div>

      <div className="flex gap-1 mb-5 border-b border-white/10">
        {(['progress', 'hindrances'] as const).map(t => (
          <button key={t} type="button"
            className={`px-4 py-2.5 font-semibold text-sm transition-colors border-b-2 -mb-px ${
              tab === t
                ? 'border-[#ff8f00] text-[#ffb87b]'
                : 'border-transparent text-[#dcc1ae] hover:text-[#e2e2e8]'
            }`}
            onClick={() => setTab(t)}>
            {t === 'progress' ? 'Progress Entries' : 'Hindrances'}
          </button>
        ))}
      </div>

      {tab === 'progress' ? (
        <div className="card overflow-hidden overflow-x-auto">
          <div className="px-4 py-3 border-b border-white/5">
            <span className="text-sm font-semibold text-[#e2e2e8]">Work Progress</span>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-[#282a2e]">
              <tr>
                {['Date','Schedule','Item','Unit','Today Qty','Cumulative','BoQ Qty','% Done','Remark'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {dprRows.map(r => {
                const pct = r.boq_qty && r.cumulative_qty ? Math.round((r.cumulative_qty / r.boq_qty) * 100) : null
                return (
                  <tr key={r.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3 font-mono text-[13px] text-[#dcc1ae] whitespace-nowrap">{r.date}</td>
                    <td className="px-4 py-3 text-[#dcc1ae]">{r.schedule}</td>
                    <td className="px-4 py-3 font-semibold text-[#e2e2e8]">{r.item}</td>
                    <td className="px-4 py-3 text-[#dcc1ae]">{r.unit}</td>
                    <td className="px-4 py-3 font-mono font-bold text-[#e2e2e8]">{Number(r.today_qty).toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3 font-mono text-[#e2e2e8]">{r.cumulative_qty != null ? Number(r.cumulative_qty).toLocaleString('en-IN') : '—'}</td>
                    <td className="px-4 py-3 font-mono text-[#dcc1ae]">{r.boq_qty != null ? Number(r.boq_qty).toLocaleString('en-IN') : '—'}</td>
                    <td className="px-4 py-3">
                      {pct != null ? (
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-white/10 rounded-full min-w-[40px]">
                            <div className="h-full bg-[#ff8f00] rounded-full" style={{ width: `${Math.min(pct, 100)}%` }} />
                          </div>
                          <span className="font-mono text-[11px] text-[#ffb87b]">{pct}%</span>
                        </div>
                      ) : <span className="text-[#dcc1ae]/40">—</span>}
                    </td>
                    <td className="px-4 py-3 text-[#dcc1ae]">{r.remark || '—'}</td>
                  </tr>
                )
              })}
              {!dprRows.length && !loading && (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-[#dcc1ae]/60 text-sm">No DPR entries yet.</td></tr>
              )}
            </tbody>
          </table>
          {loading && <div className="p-4 text-[#dcc1ae] text-sm">Loading…</div>}
        </div>
      ) : (
        <div className="card overflow-hidden overflow-x-auto">
          <div className="px-4 py-3 border-b border-white/5">
            <span className="text-sm font-semibold text-[#e2e2e8]">Hindrances</span>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-[#282a2e]">
              <tr>
                {['Date','Hindrance','Photo'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {hindrances.map(r => (
                <tr key={r.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3 font-mono text-[13px] text-[#dcc1ae] whitespace-nowrap">{r.date}</td>
                  <td className="px-4 py-3 text-[#e2e2e8]">{r.hindrance}</td>
                  <td className="px-4 py-3">
                    {r.photo
                      ? <PrivateImage bucket="hindrance-photos" path={r.photo} alt="hindrance" className="h-8 w-12 object-cover rounded" />
                      : <span className="text-[#dcc1ae]/40">—</span>}
                  </td>
                </tr>
              ))}
              {!hindrances.length && !loading && (
                <tr><td colSpan={3} className="px-4 py-10 text-center text-[#dcc1ae]/60 text-sm">No hindrances recorded.</td></tr>
              )}
            </tbody>
          </table>
          {loading && <div className="p-4 text-[#dcc1ae] text-sm">Loading…</div>}
        </div>
      )}

      {showForm && tab === 'progress' && (
        <DprForm projectId={activeProject.id} boq={boq} dprRows={dprRows} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load() }} />
      )}
      {showForm && tab === 'hindrances' && (
        <HindranceForm projectId={activeProject.id} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load() }} />
      )}
    </div>
  )
}

function DprForm({ projectId, boq, dprRows, onClose, onSaved }: { projectId: string; boq: BoqItem[]; dprRows: DprRow[]; onClose: () => void; onSaved: () => void }) {
  const today = new Date().toISOString().slice(0, 10)
  const [date, setDate] = useState(today)
  const [schedule, setSchedule] = useState('')
  const [item, setItem] = useState('')
  const [unit, setUnit] = useState('')
  const [boqQty, setBoqQty] = useState<number | null>(null)
  const [todayQty, setTodayQty] = useState('')
  const [remark, setRemark] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    const found = boq.find(b => b.item.toLowerCase() === item.toLowerCase())
    if (found) { setUnit(found.unit); setBoqQty(found.boq_qty); setSchedule(found.schedule) }
  }, [item, boq])

  const cumulative = dprRows
    .filter(r => r.item.toLowerCase() === item.toLowerCase())
    .reduce((s, r) => s + Number(r.today_qty), 0) + (todayQty ? Number(todayQty) : 0)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!item.trim()) { setErr('Enter item'); return }
    if (!todayQty || Number(todayQty) <= 0) { setErr('Enter today qty'); return }
    setBusy(true); setErr(null)
    const { data: prof } = await supabase.from('profiles').select('org_id').single()
    const { error } = await supabase.from('dpr').insert({
      org_id: prof?.org_id, project_id: projectId,
      date, schedule: schedule || null,
      item: item.trim(), unit: unit || null,
      today_qty: Number(todayQty), cumulative_qty: cumulative,
      boq_qty: boqQty, remark: remark || null,
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    onSaved()
  }

  const schedules = [...new Set(boq.map(b => b.schedule))].sort()

  return (
    <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center p-0 lg:p-6 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <form onClick={e => e.stopPropagation()} onSubmit={save}
        className="bg-[#1B1F2A] border border-white/[0.08] rounded-t-2xl lg:rounded-2xl w-full max-w-lg shadow-[0px_10px_30px_rgba(0,0,0,0.5)] overflow-y-auto max-h-[90vh]">
        <div className="p-5 border-b border-white/5 flex items-center justify-between">
          <h3 className="font-headline text-xl font-semibold text-[#e2e2e8]">Add DPR Entry</h3>
          <button type="button" className="text-[#dcc1ae] hover:text-white" onClick={onClose}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-2 gap-3">
            <L label="Date"><input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} /></L>
            <L label="Schedule">
              <input className="input" value={schedule} onChange={e => setSchedule(e.target.value)} list="sched-list" />
              <datalist id="sched-list">{schedules.map(s => <option key={s} value={s} />)}</datalist>
            </L>
            <L label="Item" className="col-span-2">
              <input className="input" value={item} onChange={e => setItem(e.target.value)} list="boq-items" placeholder="Pick from BoQ or type" />
              <datalist id="boq-items">{boq.map(b => <option key={b.item} value={b.item} />)}</datalist>
            </L>
            <L label="Unit"><input className="input" value={unit} onChange={e => setUnit(e.target.value)} /></L>
            <L label="BoQ Qty"><input className="input" style={{ fontFamily: 'var(--font-mono)' }} value={boqQty ?? ''} onChange={e => setBoqQty(e.target.value ? Number(e.target.value) : null)} inputMode="decimal" /></L>
            <L label="Today Qty">
              <input className="input" style={{ fontFamily: 'var(--font-mono)' }} inputMode="decimal" value={todayQty} onChange={e => setTodayQty(e.target.value)} />
            </L>
            <L label="Cumulative (auto)">
              <div className="input font-mono text-[#ffb87b]">{cumulative > 0 ? cumulative.toLocaleString('en-IN') : '—'}</div>
            </L>
          </div>
          <L label="Remark"><input className="input" value={remark} onChange={e => setRemark(e.target.value)} /></L>
        </div>
        {err && <div className="px-5 pb-2 text-sm text-red-400">{err}</div>}
        <div className="p-5 pt-2 flex gap-3">
          <button type="button" className="btn btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary flex-[2]" disabled={busy}>{busy ? 'Saving…' : 'Save Entry'}</button>
        </div>
      </form>
    </div>
  )
}

function HindranceForm({ projectId, onClose, onSaved }: { projectId: string; onClose: () => void; onSaved: () => void }) {
  const today = new Date().toISOString().slice(0, 10)
  const [date, setDate] = useState(today)
  const [hindrance, setHindrance] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!hindrance.trim()) { setErr('Describe the hindrance'); return }
    setBusy(true); setErr(null)

    const { data: prof } = await supabase.from('profiles').select('org_id').single()

    let photoPath: string | null = null
    if (file) {
      const path = makeObjectPath(prof?.org_id, file, 'hindrance')
      const { path: stored, error: upErr } = await uploadPrivate('hindrance-photos', path, file)
      if (upErr) { setErr('Photo upload failed: ' + upErr); setBusy(false); return }
      photoPath = stored ?? null
    }

    const { error } = await supabase.from('dpr_hindrance').insert({
      org_id: prof?.org_id, project_id: projectId,
      date, hindrance: hindrance.trim(), photo: photoPath,
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center p-0 lg:p-6 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <form onClick={e => e.stopPropagation()} onSubmit={save}
        className="bg-[#1B1F2A] border border-white/[0.08] rounded-t-2xl lg:rounded-2xl w-full max-w-md shadow-[0px_10px_30px_rgba(0,0,0,0.5)]">
        <div className="p-5 border-b border-white/5 flex items-center justify-between">
          <h3 className="font-headline text-xl font-semibold text-[#e2e2e8]">Add Hindrance</h3>
          <button type="button" className="text-[#dcc1ae] hover:text-white" onClick={onClose}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-2 gap-3">
            <L label="Date"><input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} /></L>
            <L label="Photo">
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => setFile(e.target.files?.[0] ?? null)} />
              <button type="button" className="btn btn-ghost w-full" style={{ fontSize: '12px' }} onClick={() => fileRef.current?.click()}>
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>photo_camera</span>
                {file ? file.name.slice(0, 14) : 'Attach photo'}
              </button>
            </L>
          </div>
          <L label="Hindrance description">
            <textarea className="input" rows={3} value={hindrance} onChange={e => setHindrance(e.target.value)} />
          </L>
        </div>
        {err && <div className="px-5 pb-2 text-sm text-red-400">{err}</div>}
        <div className="p-5 pt-2 flex gap-3">
          <button type="button" className="btn btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary flex-[2]" disabled={busy}>{busy ? 'Saving…' : 'Save Hindrance'}</button>
        </div>
      </form>
    </div>
  )
}

function L({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block mb-3 col-span-1 ${className}`}>
      <span className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider block mb-1">{label}</span>
      {children}
    </label>
  )
}