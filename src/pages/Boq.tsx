import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useProject } from '../lib/project'
import { inr } from '../lib/boq'

type Boq = {
  id: string; boq_number: string | null; name: string; version: number
  status: string; project_id: string | null; created_at: string
}

const STATUS_CLS: Record<string, string> = {
  Draft: 'bg-white/5 text-[#dcc1ae] border-white/10',
  Approved: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  Locked: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
}

export default function Boq() {
  const { projects, activeProject } = useProject()
  const navigate = useNavigate()
  const [rows, setRows] = useState<Boq[]>([])
  const [totals, setTotals] = useState<Record<string, { amount: number; count: number }>>({})
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('boqs').select('*').order('created_at', { ascending: false })
    const list = (data as Boq[]) ?? []
    setRows(list)
    if (list.length) {
      const { data: items } = await supabase.from('boq_items').select('boq_id, amount').in('boq_id', list.map(b => b.id))
      const t: Record<string, { amount: number; count: number }> = {}
      for (const it of (items ?? []) as { boq_id: string; amount: number }[]) {
        t[it.boq_id] = t[it.boq_id] || { amount: 0, count: 0 }
        t[it.boq_id].amount += Number(it.amount || 0)
        t[it.boq_id].count += 1
      }
      setTotals(t)
    }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-headline text-2xl font-semibold text-[#e2e2e8]">Bill of Quantities</h1>
          <p className="text-sm text-[#dcc1ae] mt-0.5">BOQ estimates with full rate build-up · {rows.length} on record</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span> New BOQ
        </button>
      </div>

      <div className="card overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[#282a2e]"><tr>
            {['BOQ No.', 'Name', 'Project', 'Ver', 'Items', 'Total Amount', 'Status', ''].map(h => (
              <th key={h} className="px-4 py-3 text-left text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
            ))}
          </tr></thead>
          <tbody className="divide-y divide-white/[0.05]">
            {rows.map(b => {
              const t = totals[b.id] || { amount: 0, count: 0 }
              const proj = projects.find(p => p.id === b.project_id)?.name
              return (
                <tr key={b.id} className="hover:bg-white/[0.02] cursor-pointer" onClick={() => navigate(`/boq/${b.id}`)}>
                  <td className="px-4 py-3 font-mono text-[12px] text-[#dcc1ae]">{b.boq_number || '—'}</td>
                  <td className="px-4 py-3 text-[#e2e2e8] font-semibold">{b.name}</td>
                  <td className="px-4 py-3 text-[#dcc1ae]">{proj || '—'}</td>
                  <td className="px-4 py-3 font-mono text-[#dcc1ae]">v{b.version}</td>
                  <td className="px-4 py-3 font-mono text-[#dcc1ae]">{t.count}</td>
                  <td className="px-4 py-3 font-mono text-[#e2e2e8]">{inr(t.amount)}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${STATUS_CLS[b.status] || STATUS_CLS.Draft}`}>{b.status}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="material-symbols-outlined text-[#dcc1ae]/50" style={{ fontSize: '18px' }}>chevron_right</span>
                  </td>
                </tr>
              )
            })}
            {!rows.length && !loading && (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-[#dcc1ae]/60 text-sm">No BOQs yet — create your first.</td></tr>
            )}
          </tbody>
        </table>
        {loading && <div className="p-4 text-[#dcc1ae] text-sm">Loading…</div>}
      </div>

      {showForm && (
        <NewBoqForm
          projects={projects}
          defaultProject={activeProject?.id ?? ''}
          onClose={() => setShowForm(false)}
          onCreated={(id) => { setShowForm(false); navigate(`/boq/${id}`) }}
        />
      )}
    </div>
  )
}

function NewBoqForm({ projects, defaultProject, onClose, onCreated }: {
  projects: { id: string; name: string }[]
  defaultProject: string
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const [name, setName] = useState('')
  const [number, setNumber] = useState('')
  const [projectId, setProjectId] = useState(defaultProject)
  const [version, setVersion] = useState('1')
  const [templateId, setTemplateId] = useState('')
  const [templates, setTemplates] = useState<{ id: string; name: string; item_count: number }[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('boq_templates').select('id, name, item_count').order('created_at', { ascending: false })
      setTemplates((data as { id: string; name: string; item_count: number }[]) ?? [])
    })()
  }, [])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setErr('Name is required'); return }
    setBusy(true); setErr(null)
    const { data: prof } = await supabase.from('profiles').select('org_id').single()
    const { data, error } = await supabase.from('boqs').insert({
      org_id: prof?.org_id, name, boq_number: number || null,
      project_id: projectId || null, version: Number(version) || 1, status: 'Draft',
    }).select('id').single()
    if (error) { setBusy(false); setErr(error.message); return }
    const newBoqId = (data as { id: string }).id
    // If a template was picked, copy its items into the new BOQ
    if (templateId) {
      const { data: tpl } = await supabase.from('boq_templates').select('items_snapshot').eq('id', templateId).single()
      const snap = ((tpl as { items_snapshot: any[] } | null)?.items_snapshot) ?? []
      if (snap.length) {
        const rows = snap.map((it: any) => ({ ...it, org_id: prof?.org_id, boq_id: newBoqId, completed_qty: 0 }))
        for (let i = 0; i < rows.length; i += 100) {
          await supabase.from('boq_items').insert(rows.slice(i, i + 100))
        }
      }
    }
    setBusy(false)
    onCreated(newBoqId)
  }

  return createPortal((
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto" onClick={onClose}>
      <form onClick={e => e.stopPropagation()} onSubmit={save}
        className="bg-[#1B1F2A] border border-white/[0.08] rounded-2xl w-full max-w-md my-auto shadow-[0px_10px_30px_rgba(0,0,0,0.5)]">
        <div className="p-5 border-b border-white/5 flex items-center justify-between">
          <h3 className="font-headline text-xl font-semibold text-[#e2e2e8]">New BOQ</h3>
          <button type="button" className="text-[#dcc1ae] hover:text-white" onClick={onClose}><span className="material-symbols-outlined">close</span></button>
        </div>
        <div className="p-5 space-y-3">
          <Lb label="BOQ Name *"><input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Civil works – Package A" /></Lb>
          <div className="grid grid-cols-2 gap-3">
            <Lb label="BOQ Number"><input className="input mono" value={number} onChange={e => setNumber(e.target.value)} placeholder="BOQ-001" /></Lb>
            <Lb label="Version"><input className="input mono" inputMode="numeric" value={version} onChange={e => setVersion(e.target.value.replace(/\D/g, '') || '1')} /></Lb>
          </div>
          <Lb label="Project">
            <select className="input" value={projectId} onChange={e => setProjectId(e.target.value)}>
              <option value="">— None —</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Lb>
          {templates.length > 0 && (
            <Lb label="Start from Template (optional)">
              <select className="input" value={templateId} onChange={e => setTemplateId(e.target.value)}>
                <option value="">— Blank BOQ —</option>
                {templates.map(t => <option key={t.id} value={t.id}>{t.name} ({t.item_count} items)</option>)}
              </select>
            </Lb>
          )}
        </div>
        {err && <div className="px-5 pb-2 text-sm text-red-400">{err}</div>}
        <div className="p-5 pt-2 flex gap-3">
          <button type="button" className="btn btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary flex-[2]" disabled={busy}>{busy ? 'Creating…' : 'Create & Add Items'}</button>
        </div>
      </form>
    </div>
  ), document.body)
}

function Lb({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider block mb-1">{label}</span>{children}</label>
}