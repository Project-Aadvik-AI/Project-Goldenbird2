import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useProject } from '../lib/project'
import ExportButtons from '../components/ExportButtons'

// Returnable Items — ITEM-WISE. For each returnable item (grinder, tools,
// shuttering plates) show how many are Total, In Store, and Out (to come back).
// No person tracking — just where each item's quantity stands.

const q = (n: number) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 })

type Row = {
  item_id: string; item_code: string | null; item_name: string
  warehouse_id: string; warehouse_name: string | null; project_id: string | null
  in_store: number; out_qty: number; total_qty: number
}

export default function ReturnableRegister() {
  const { activeProject } = useProject()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [onlyOut, setOnlyOut] = useState(false)

  useEffect(() => { (async () => {
    setLoading(true)
    const { data } = await supabase.from('inv_returnable_register').select('*').order('out_qty', { ascending: false })
    setRows((data as Row[]) ?? [])
    setLoading(false)
  })() }, [])

  const scoped = useMemo(() =>
    rows.filter(r => activeProject ? r.project_id === activeProject.id : true),
  [rows, activeProject])

  const shown = useMemo(() => scoped
    .filter(r => !onlyOut || Number(r.out_qty) > 0)
    .filter(r => !search || r.item_name.toLowerCase().includes(search.toLowerCase())),
  [scoped, onlyOut, search])

  const totOut = shown.reduce((a, r) => a + Number(r.out_qty || 0), 0)
  const totIn = shown.reduce((a, r) => a + Number(r.in_store || 0), 0)

  return (
    <div>
      <div className="mb-5">
        <h1 className="font-headline text-2xl font-semibold" style={{ color: 'var(--text)' }}>Returnable Items</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-2)' }}>
          Grinders, tools, shuttering plates and other returnable stock — how many are in the store and how many are out on work (must come back).
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-5">
        <Kpi label="Out — to come back" value={q(totOut)} accent />
        <Kpi label="In store now" value={q(totIn)} />
        <Kpi label="Returnable items" value={String(shown.length)} />
      </div>

      <div className="flex flex-wrap gap-2 items-center mb-4">
        <input className="input" style={{ maxWidth: 260 }} placeholder="Search item…"
          value={search} onChange={e => setSearch(e.target.value)} />
        <label className="flex items-center gap-2 text-[12px] cursor-pointer" style={{ color: 'var(--text-2)' }}>
          <input type="checkbox" className="accent-[#ff8f00] w-4 h-4" checked={onlyOut} onChange={e => setOnlyOut(e.target.checked)} />
          Show only items that are out
        </label>
        <div className="ml-auto">
          <ExportButtons filename="returnable-items" title="Returnable Items" rows={shown}
            columns={[
              { header: 'Item', get: (r: any) => r.item_name },
              { header: 'Warehouse', get: (r: any) => r.warehouse_name || '—' },
              { header: 'Total', get: (r: any) => Number(r.total_qty) },
              { header: 'In Store', get: (r: any) => Number(r.in_store) },
              { header: 'Out (to come back)', get: (r: any) => Number(r.out_qty) },
            ]} />
        </div>
      </div>

      <div className="card overflow-hidden overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead className="bg-[#282a2e]"><tr>
            {['Item', 'Warehouse', 'Total', 'In Store', 'Out (to come back)'].map(h => (
              <th key={h} className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-[#dcc1ae]/60 whitespace-nowrap">{h}</th>
            ))}
          </tr></thead>
          <tbody className="divide-y divide-white/[0.05]">
            {shown.map((r, i) => (
              <tr key={i} className="hover:bg-white/[0.02]">
                <td className="px-3 py-2">
                  <div className="font-semibold text-[#e2e2e8]">{r.item_name}</div>
                  <div className="text-[10px] text-[#dcc1ae]/50">{r.item_code || '—'}</div>
                </td>
                <td className="px-3 py-2 text-[#dcc1ae]/80">{r.warehouse_name || '—'}</td>
                <td className="px-3 py-2 font-mono text-[#e2e2e8]">{q(r.total_qty)}</td>
                <td className="px-3 py-2 font-mono text-[#34d399]">{q(r.in_store)}</td>
                <td className="px-3 py-2 font-mono font-bold" style={{ color: Number(r.out_qty) > 0 ? '#ffb87b' : 'var(--faint)' }}>{q(r.out_qty)}</td>
              </tr>
            ))}
            {!shown.length && !loading && (
              <tr><td colSpan={5} className="px-3 py-10 text-center text-[#dcc1ae]/50">
                No returnable items yet. Tick "Returnable" on an item, then issue it — items out on work will show here until returned.
              </td></tr>
            )}
          </tbody>
        </table>
        {loading && <div className="p-4 text-sm text-[#dcc1ae]">Loading…</div>}
      </div>
    </div>
  )
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="card p-4">
      <div className="text-[10px] font-bold uppercase tracking-wider text-[#dcc1ae]/60">{label}</div>
      <div className={`text-xl font-bold font-mono mt-1 ${accent ? 'text-[#ffb87b]' : 'text-[#e2e2e8]'}`}>{value}</div>
    </div>
  )
}