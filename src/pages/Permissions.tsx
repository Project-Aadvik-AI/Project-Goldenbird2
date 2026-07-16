import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { MODULES, PERMS, type PermKey } from '../lib/modules'

type Designation = { id: string; name: string; disabled: boolean }
type PermRow = {
  module: string
  can_view: boolean; can_create: boolean; can_edit: boolean
  can_delete: boolean; can_approve: boolean; can_export: boolean
}
const colName = (p: PermKey) => `can_${p}` as keyof PermRow

export default function Permissions() {
  const { isAdmin } = useAuth()
  const [desigs, setDesigs] = useState<Designation[]>([])
  const [desigId, setDesigId] = useState('')
  const [perms, setPerms] = useState<Record<string, PermRow>>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedOk, setSavedOk] = useState(false)
  const [empCount, setEmpCount] = useState(0)

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('designations').select('id, name, disabled').eq('disabled', false).order('name')
      const list = (data as Designation[]) ?? []
      setDesigs(list); if (list.length && !desigId) setDesigId(list[0].id)
    })()
  }, [])

  async function loadPerms(id: string) {
    if (!id) return
    setLoading(true); setSavedOk(false)
    const { data } = await supabase.from('designation_permissions').select('*').eq('designation_id', id)
    const map: Record<string, PermRow> = {}
    for (const m of MODULES) {
      map[m.key] = { module: m.key, can_view: false, can_create: false, can_edit: false, can_delete: false, can_approve: false, can_export: false }
    }
    for (const r of (data ?? []) as PermRow[]) {
      if (map[r.module]) map[r.module] = { ...map[r.module], ...r }
    }
    setPerms(map)
    // how many employees have this designation
    const { count } = await supabase.from('employees').select('id', { count: 'exact', head: true }).eq('designation_id', id)
    setEmpCount(count ?? 0)
    setLoading(false)
  }
  useEffect(() => { loadPerms(desigId) }, [desigId])

  function toggle(moduleKey: string, perm: PermKey) {
    setSavedOk(false)
    setPerms(prev => {
      const row = { ...prev[moduleKey] }
      const col = colName(perm)
      ;(row as any)[col] = !(row as any)[col]
      // ticking any action auto-enables View (can't act without seeing)
      if (perm !== 'view' && (row as any)[col]) row.can_view = true
      return { ...prev, [moduleKey]: row }
    })
  }
  function setModuleAll(moduleKey: string, val: boolean) {
    setSavedOk(false)
    setPerms(prev => {
      const row = { ...prev[moduleKey] }
      for (const p of PERMS) (row as any)[colName(p)] = val
      return { ...prev, [moduleKey]: row }
    })
  }
  // Turn every permission on/off for a set of modules (a group, or all).
  function setManyAll(keys: string[], val: boolean) {
    setSavedOk(false)
    setPerms(prev => {
      const next = { ...prev }
      for (const k of keys) {
        const row = { ...(next[k] ?? {}) }
        for (const p of PERMS) (row as any)[colName(p)] = val
        next[k] = row
      }
      return next
    })
  }
  const everythingOn = (keys: string[]) => keys.every(k => perms[k] && PERMS.every(p => (perms[k] as any)[colName(p)]))

  // Ready-made role bundles: one click ticks the right modules (incl. Head Office).
  const PRESETS: { label: string; keys: string[] }[] = [
    { label: 'HR Manager', keys: ['head_office', 'employees', 'attendance', 'leaves', 'designations', 'payroll'] },
    { label: 'Store Manager', keys: ['head_office', 'store', 'inventory', 'warehouses', 'purchase_requests'] },
    { label: 'Accountant', keys: ['head_office', 'accounting', 'finance_reports', 'gst_reports', 'bank_recon', 'accounting_export', 'imprest', 'credit'] },
    { label: 'Procurement / Vendor Manager', keys: ['head_office', 'vendors', 'vendor_bills', 'vendor_payments', 'vendor_progress', 'vendor_reports', 'work_orders'] },
    { label: 'Billing / QS', keys: ['head_office', 'boq', 'boq_dashboard', 'boq_budget', 'measurement_book', 'billing'] },
    { label: 'Site Engineer', keys: ['dpr', 'labour', 'machines', 'measurement_book', 'hindrances', 'expenses'] },
    { label: 'Full Head Office', keys: MODULES.map(m => m.key) },
  ]
  function applyPreset(keys: string[]) {
    setManyAll(keys, true)
  }

  async function save() {
    setSaving(true)
    const { data: prof } = await supabase.from('profiles').select('org_id').single()
    const rows = MODULES.map(m => ({ org_id: prof?.org_id, designation_id: desigId, ...perms[m.key], module: m.key }))
    const { error } = await supabase.from('designation_permissions').upsert(rows, { onConflict: 'designation_id,module' })
    setSaving(false)
    if (!error) setSavedOk(true)
  }

  const grouped = useMemo(() => {
    const g: Record<string, typeof MODULES> = {}
    for (const m of MODULES) { (g[m.group] ??= []).push(m) }
    return Object.entries(g)
  }, [])

  if (!isAdmin) return <div className="p-8 text-center text-[#dcc1ae]">Only admins can manage permissions.</div>

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-headline text-2xl font-semibold text-[#e2e2e8]">Role &amp; Permission Management</h1>
          <p className="text-sm text-[#dcc1ae] mt-0.5">Set what each designation can do. Changes apply to every employee with that designation.</p>
        </div>
        <select className="input" value={desigId} onChange={e => setDesigId(e.target.value)} style={{ minWidth: 200 }}>
          {!desigs.length && <option value="">No designations</option>}
          {desigs.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>

      {desigId && (
        <div className="flex items-center justify-between mb-4 p-3 rounded-lg bg-white/[0.03] border border-white/[0.05]">
          <span className="text-[13px] text-[#dcc1ae]">
            Applies to <span className="font-bold text-[#e2e2e8]">{empCount}</span> employee(s) with this designation.
          </span>
          <button className="btn btn-primary" disabled={saving} onClick={save} style={{ padding: '6px 16px', fontSize: '13px' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>{savedOk ? 'check' : 'save'}</span>
            {saving ? 'Saving…' : savedOk ? 'Saved' : 'Save Permissions'}
          </button>
        </div>
      )}

      {desigId && !loading && (
        <div className="mb-4 p-3 rounded-lg bg-white/[0.03] border border-white/[0.05]">
          <div className="text-[11px] font-bold uppercase tracking-wider text-[#dcc1ae] mb-2">Quick role presets — one click, then Save</div>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map(p => (
              <button key={p.label} onClick={() => applyPreset(p.keys)}
                className="text-[12px] font-semibold px-3 py-1.5 rounded-lg border border-[var(--accent)]/30 text-[var(--accent)] hover:bg-[var(--accent)]/10 transition-colors">
                {p.label}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-[#dcc1ae]/50 mt-2">Presets add access on top of what's already ticked. To start clean, use “Clear all” first.</p>
        </div>
      )}

      {desigId && !loading && (() => {
        const allKeys = MODULES.map(m => m.key)
        const allOn = everythingOn(allKeys)
        return (
          <div className="flex items-center gap-2 mb-4">
            <button onClick={() => setManyAll(allKeys, !allOn)}
              className="text-[12px] font-semibold px-3 py-1.5 rounded-lg border"
              style={allOn
                ? { color: '#f87171', borderColor: 'rgba(248,113,113,0.3)' }
                : { color: '#34d399', borderColor: 'rgba(52,211,153,0.35)' }}>
              {allOn ? 'Clear all permissions' : 'Grant EVERYTHING (all features, all actions)'}
            </button>
            <span className="text-[11px] text-[#dcc1ae]/50">Remember to press Save after.</span>
          </div>
        )
      })()}

      {loading ? <div className="card p-6 text-[#dcc1ae] text-sm">Loading…</div> : desigId && (
        <div className="space-y-5">
          {grouped.map(([group, mods]) => (
            <div key={group} className="card overflow-hidden overflow-x-auto">
              <div className="px-4 py-2.5 border-b border-white/5 bg-white/[0.02] flex items-center justify-between">
                <span className="text-[12px] font-bold text-[#e2e2e8] uppercase tracking-wider">{group}</span>
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input type="checkbox" className="accent-emerald-500 cursor-pointer w-4 h-4"
                    checked={everythingOn(mods.map(m => m.key))}
                    onChange={e => setManyAll(mods.map(m => m.key), e.target.checked)} />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#dcc1ae]">Select all</span>
                </label>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-[#282a2e]"><tr>
                  <th className="px-4 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider">Module</th>
                  {PERMS.map(p => <th key={p} className="px-2 py-2.5 text-center text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider">{p}</th>)}
                  <th className="px-3 py-2.5 text-center text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider">All</th>
                </tr></thead>
                <tbody className="divide-y divide-white/[0.05]">
                  {mods.map(m => {
                    const row = perms[m.key]
                    if (!row) return null
                    const allOn = PERMS.every(p => (row as any)[colName(p)])
                    return (
                      <tr key={m.key} className="hover:bg-white/[0.02]">
                        <td className="px-4 py-2.5 text-[#e2e2e8]">{m.label}</td>
                        {PERMS.map(p => (
                          <td key={p} className="px-2 py-2.5 text-center">
                            <input type="checkbox" className="accent-[#ffb87b] cursor-pointer w-4 h-4"
                              checked={!!(row as any)[colName(p)]} onChange={() => toggle(m.key, p)} />
                          </td>
                        ))}
                        <td className="px-3 py-2.5 text-center">
                          <input type="checkbox" className="accent-emerald-500 cursor-pointer w-4 h-4" checked={allOn} onChange={e => setModuleAll(m.key, e.target.checked)} title="Toggle all" />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
      <p className="text-[11px] text-[#dcc1ae]/50 mt-4">
        Ticking any action auto-enables View (you can't act on a module you can't see). New modules appear here automatically when added to the system.
      </p>
    </div>
  )
}