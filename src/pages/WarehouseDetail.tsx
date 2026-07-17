import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import ExportButtons from '../components/ExportButtons'
import { appConfirm, appAlert } from '../lib/dialogs'

// Dedicated page for ONE warehouse: /warehouses/:id
// Reuses the same warehouse_overview + inv_availability + inv_stock_ledger data
// the list page uses — this is the extracted detail view, not a new system.
// The four actions deep-link into Stock Movements with this warehouse pre-selected.

const inr = (n: number) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })
const q = (n: number) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 })

type WH = {
  warehouse_id: string; name: string; is_central: boolean; can_use: boolean
  project_name: string | null; keeper_name: string | null; location: string | null
  item_count: number; total_qty: number; stock_value: number; reserved_qty: number
}
type StockRow = {
  item_id: string; item_code: string | null; item_name: string; category_name: string | null
  unit: string | null; on_hand: number; reserved: number; free: number; stock_value: number
}
type Move = {
  id: string; movement_no: string; movement_type: string; movement_date: string
  from_warehouse: string | null; to_warehouse: string | null
  total_qty: number; total_value: number; status: string
}

export default function WarehouseDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { isAdmin, can } = useAuth()

  const [wh, setWh] = useState<WH | null>(null)
  const [stock, setStock] = useState<StockRow[]>([])
  const [moves, setMoves] = useState<Move[]>([])
  const [whNames, setWhNames] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [catFilter, setCatFilter] = useState('All')

  const categories = useMemo(() =>
    [...new Set(stock.map(s => s.category_name).filter(Boolean) as string[])].sort(),
  [stock])
  const shownStock = useMemo(() =>
    catFilter === 'All' ? stock : stock.filter(s => (s.category_name || '') === catFilter),
  [stock, catFilter])

  async function load() {
    setLoading(true)
    const [{ data: w }, { data: st }, { data: mv }, { data: names }] = await Promise.all([
      supabase.from('warehouse_overview').select('*').eq('warehouse_id', id).maybeSingle(),
      supabase.from('inv_availability').select('*').eq('warehouse_id', id).order('item_name'),
      supabase.from('inv_movements')
        .select('id, movement_no, movement_type, movement_date, from_warehouse, to_warehouse, total_qty, total_value, status')
        .or(`from_warehouse.eq.${id},to_warehouse.eq.${id}`)
        .order('movement_date', { ascending: false }).limit(50),
      supabase.from('inv_warehouses').select('id, name'),
    ])
    setWh((w as WH) ?? null)
    setStock((st as StockRow[]) ?? [])
    setMoves((mv as Move[]) ?? [])
    const m = new Map<string, string>()
    for (const r of (names as { id: string; name: string }[]) ?? []) m.set(r.id, r.name)
    setWhNames(m)
    setLoading(false)
  }
  useEffect(() => { load() /* eslint-disable-next-line */ }, [id])

  const canUse = wh?.can_use && (isAdmin || can('store', 'create'))
  const go = (type: string) => navigate(`/stock-movements?type=${type}&wh=${id}`)

  async function postDraft(m: Move) {
    if (!await appConfirm(`Post ${m.movement_no}?\nOnce posted the stock moves and the entry becomes locked.`)) return
    const { error } = await supabase.rpc('inv_post_movement', { p_movement: m.id, p_allow_reserved: false })
    if (error) { await appAlert('Could not post\n' + error.message); return }
    load()
  }
  async function deleteDraft(m: Move) {
    if (!await appConfirm(`Delete draft ${m.movement_no}?\nThis removes the unposted entry. It cannot be undone.`)) return
    // remove lines then the movement (draft only — nothing posted to stock yet)
    await supabase.from('inv_movement_lines').delete().eq('movement_id', m.id)
    const { error } = await supabase.from('inv_movements').delete().eq('id', m.id)
    if (error) { await appAlert('Could not delete\n' + error.message); return }
    load()
  }

  if (loading) return <div className="card p-10 text-center text-[#dcc1ae]">Loading…</div>
  if (!wh) return (
    <div className="card p-10 text-center">
      <p className="text-[#dcc1ae]">Warehouse not found.</p>
      <button className="btn btn-ghost mt-3" onClick={() => navigate('/warehouses')}>← Back to warehouses</button>
    </div>
  )

  return (
    <div>
      {/* header */}
      <button className="text-[13px] mb-3 inline-flex items-center gap-1 text-[#dcc1ae] hover:text-[#e2e2e8]" onClick={() => navigate('/warehouses')}>
        <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>arrow_back</span> All warehouses
      </button>

      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-headline text-2xl font-semibold" style={{ color: 'var(--text)' }}>{wh.name}</h1>
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
              wh.is_central ? 'bg-[#ff8f00]/10 text-[#ffb87b] border-[#ff8f00]/25' : 'bg-white/5 text-[#dcc1ae]/70 border-white/10'}`}>
              {wh.is_central ? 'Central' : 'Project'}
            </span>
            {!wh.can_use && <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase border bg-white/5 text-[#dcc1ae]/50 border-white/10">view only</span>}
          </div>
          <p className="text-[12px] text-[#dcc1ae]/60 mt-0.5">
            {wh.project_name ?? 'Company-wide'}{wh.keeper_name && ` · keeper: ${wh.keeper_name}`}{wh.location && ` · ${wh.location}`}
          </p>
        </div>
        <ExportButtons filename={`stock-${wh.name}`} title={`Stock — ${wh.name}`} rows={stock}
          columns={[
            { header: 'Item Code', get: (r: any) => r.item_code || '—' },
            { header: 'Item', get: (r: any) => r.item_name },
            { header: 'On Hand', get: (r: any) => Number(r.on_hand) },
            { header: 'Free', get: (r: any) => Number(r.free) },
            { header: 'Value', get: (r: any) => Number(r.stock_value) },
          ]} />
      </div>

      {/* summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Kpi label="Total Items" value={String(wh.item_count ?? 0)} />
        <Kpi label="Stock Value" value={inr(wh.stock_value)} accent />
        <Kpi label="Available (Free)" value={q(Number(wh.total_qty) - Number(wh.reserved_qty))} />
        <Kpi label="Reserved" value={q(wh.reserved_qty)} />
      </div>

      {/* actions — warehouse pre-selected via URL */}
      {canUse && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <Action icon="south_west" color="#34d399" title="Goods Receipt" sub="Bring material in" onClick={() => go('GRN')} />
          <Action icon="north_east" color="#f59e0b" title="Material Issue" sub="Issue out / consume" onClick={() => go('Issue')} />
          {/* Transfer & Return move stock between stores — Head Office only */}
          {/* Transfer & Return are managed from the CENTRAL warehouse (Head Office). */}
          {wh.is_central && <Action icon="undo" color="#a78bfa" title="Material Return" sub="Unused material back" onClick={() => go('Return')} />}
          {wh.is_central && <Action icon="swap_horiz" color="#38bdf8" title="Stock Transfer" sub="Move to another store" onClick={() => go('Transfer')} />}
        </div>
      )}

      {/* current inventory — filterable by category, like the spreadsheet tabs */}
      <Section title="Current Inventory">
        {categories.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-4 pt-3 no-print">
            {['All', ...categories].map(c => (
              <button key={c} onClick={() => setCatFilter(c)}
                className="px-2.5 py-1 rounded-md text-[11px] font-semibold border"
                style={catFilter === c
                  ? { background: 'var(--accent)', color: '#0B0B0C', borderColor: 'var(--accent)' }
                  : { color: 'var(--text-2)', borderColor: 'var(--line)' }}>
                {c}
              </button>
            ))}
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead className="bg-[#282a2e]"><tr>
              {['Item', 'Category', 'On Hand', 'Reserved', 'Free', 'Value'].map(h => (
                <th key={h} className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-[#dcc1ae]/60 whitespace-nowrap">{h}</th>
              ))}
            </tr></thead>
            <tbody className="divide-y divide-white/[0.05]">
              {shownStock.map(s => (
                <tr key={s.item_id} className="hover:bg-white/[0.02]">
                  <td className="px-3 py-2">
                    <div className="font-semibold text-[#e2e2e8]">{s.item_name}</div>
                    <div className="text-[10px] text-[#dcc1ae]/50">{s.item_code || '—'}</div>
                  </td>
                  <td className="px-3 py-2 text-[#dcc1ae]/80">{s.category_name || '—'}</td>
                  <td className="px-3 py-2 font-mono text-[#e2e2e8]">{q(s.on_hand)} <span className="text-[#dcc1ae]/50">{s.unit}</span></td>
                  <td className="px-3 py-2 font-mono text-[#dcc1ae]/70">{q(s.reserved)}</td>
                  <td className="px-3 py-2 font-mono font-bold text-[#34d399]">{q(s.free)}</td>
                  <td className="px-3 py-2 font-mono text-[#dcc1ae]">{inr(s.stock_value)}</td>
                </tr>
              ))}
              {!shownStock.length && <tr><td colSpan={6} className="px-3 py-8 text-center text-[#dcc1ae]/50">
                {catFilter === 'All' ? 'This store is empty.' : `No ${catFilter} items in this store.`}
              </td></tr>}
            </tbody>
            {shownStock.length > 0 && (
              <tfoot><tr className="bg-white/[0.02] border-t border-white/10">
                <td className="px-3 py-2 font-bold text-[#e2e2e8]" colSpan={5}>
                  {catFilter === 'All' ? 'Total' : `${catFilter} total`} · {shownStock.length} item(s)
                </td>
                <td className="px-3 py-2 font-mono font-bold text-[#ffb87b]">{inr(shownStock.reduce((a, s) => a + Number(s.stock_value || 0), 0))}</td>
              </tr></tfoot>
            )}
          </table>
        </div>
      </Section>

      {/* movements / recent transactions */}
      <Section title="Stock Movements &amp; Recent Transactions">
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead className="bg-[#282a2e]"><tr>
              {['Date', 'No.', 'Type', 'From → To', 'Qty', 'Value', 'Status', ''].map(h => (
                <th key={h} className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-[#dcc1ae]/60 whitespace-nowrap">{h}</th>
              ))}
            </tr></thead>
            <tbody className="divide-y divide-white/[0.05]">
              {moves.map(m => (
                <tr key={m.id} className="hover:bg-white/[0.02]">
                  <td className="px-3 py-2 text-[#dcc1ae]/80 whitespace-nowrap">{m.movement_date}</td>
                  <td className="px-3 py-2 font-mono font-semibold text-[#e2e2e8]">{m.movement_no}</td>
                  <td className="px-3 py-2"><span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-white/5 text-[#ffb87b]">{m.movement_type}</span></td>
                  <td className="px-3 py-2 text-[#dcc1ae]/80">
                    {m.from_warehouse && (whNames.get(m.from_warehouse) ?? '—')}
                    {m.from_warehouse && m.to_warehouse && ' → '}
                    {m.to_warehouse && (whNames.get(m.to_warehouse) ?? '—')}
                  </td>
                  <td className="px-3 py-2 font-mono text-[#e2e2e8]">{q(m.total_qty)}</td>
                  <td className="px-3 py-2 font-mono text-[#dcc1ae]">{inr(m.total_value)}</td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                      m.status === 'Posted' ? 'bg-[#34d399]/10 text-[#34d399]' : 'bg-white/5 text-[#dcc1ae]/60'}`}>{m.status}</span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-right">
                    {m.status === 'Draft' && canUse && (
                      <>
                        <button className="text-[11px] font-semibold uppercase text-[#34d399] hover:underline mr-3"
                          onClick={() => postDraft(m)}>Post</button>
                        <button className="text-[11px] font-semibold uppercase text-red-400 hover:underline"
                          onClick={() => deleteDraft(m)}>Delete</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {!moves.length && <tr><td colSpan={8} className="px-3 py-8 text-center text-[#dcc1ae]/50">No movements yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </Section>
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

function Action({ icon, color, title, sub, onClick }: { icon: string; color: string; title: string; sub: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="card p-4 text-left hover:bg-white/[0.04] transition-colors">
      <span className="material-symbols-outlined" style={{ fontSize: '26px', color }}>{icon}</span>
      <div className="text-[14px] font-semibold text-[#e2e2e8] mt-2">{title}</div>
      <div className="text-[11px] text-[#dcc1ae]/60 leading-tight mt-0.5">{sub}</div>
    </button>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card overflow-hidden mb-5">
      <div className="px-4 py-3 border-b border-white/5 text-[12px] font-bold uppercase tracking-wider text-[#dcc1ae]"
        dangerouslySetInnerHTML={{ __html: title }} />
      {children}
    </div>
  )
}