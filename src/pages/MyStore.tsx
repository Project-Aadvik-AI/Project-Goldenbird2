import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useProject } from '../lib/project'
import { useWorkspace } from '../lib/workspace'

// MY STORE — the simple screen for the site store keeper.
// Four big actions in plain language. No drafts, no jargon: every action posts
// immediately through the same inv_* engine the detailed screens use, so the
// numbers always match. Big text, one thing at a time, clear confirmations.

const q = (n: number) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 })

type Wh = { id: string; name: string; project_id: string | null; is_main: boolean; label?: string }
type Item = { id: string; name: string; item_code: string | null; standard_rate: number | null }
type Mode = 'home' | 'in' | 'used' | 'send' | 'stock'

export default function MyStore() {
  const { profile } = useAuth()
  const { activeProject, projects } = useProject()
  const { inHeadOffice } = useWorkspace()

  const [warehouses, setWarehouses] = useState<Wh[]>([])
  const [whId, setWhId] = useState('')
  const [items, setItems] = useState<Item[]>([])
  const [mode, setMode] = useState<Mode>('home')
  const [balances, setBalances] = useState<Map<string, number>>(new Map())
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const [{ data: wh }, { data: it }] = await Promise.all([
      supabase.from('inv_warehouses').select('id, name, project_id, is_main, keeper_id').eq('active', true).order('name'),
      supabase.from('inv_items').select('id, name, item_code, standard_rate').eq('active', true).order('name'),
    ])
    const all = (wh as (Wh & { keeper_id: string | null })[]) ?? []
    setItems((it as Item[]) ?? [])
    // Pick MY store automatically: the one I keep → else my project's store → else first.
    const mine = all.find(w => w.keeper_id === profile?.id)
      ?? (inHeadOffice ? all.find(w => w.is_main && !w.project_id) : null)   // Head Office → the central warehouse
      ?? (activeProject ? all.find(w => w.project_id === activeProject.id) : null)
      ?? all[0]
    setWarehouses(all)
    setWhId(prev => prev || mine?.id || '')
    setLoading(false)
  }
  useEffect(() => { load() /* eslint-disable-next-line */ }, [activeProject?.id])

  // stock at MY store, straight from the ledger
  async function loadBalances(warehouse: string) {
    if (!warehouse) return
    const { data } = await supabase.from('inv_stock_ledger')
      .select('item_id, signed_qty').eq('warehouse_id', warehouse)
    const m = new Map<string, number>()
    for (const r of (data as { item_id: string; signed_qty: number }[]) ?? [])
      m.set(r.item_id, (m.get(r.item_id) ?? 0) + Number(r.signed_qty || 0))
    setBalances(m)
  }
  useEffect(() => { loadBalances(whId) }, [whId, mode])

  const wh = warehouses.find(w => w.id === whId) ?? null
  const pName = (pid: string | null) => pid ? (projects.find(p => p.id === pid)?.name ?? '') : ''
  const others = warehouses.filter(w => w.id !== whId).map(w => ({
    ...w, label: w.project_id ? `${pName(w.project_id)} — ${w.name}` : `${w.name}${w.is_main ? ' (Central)' : ''}`,
  }))

  if (loading) return <div className="card p-10 text-center text-lg" style={{ color: 'var(--text-2)' }}>Opening your store…</div>
  if (!wh) return <div className="card p-10 text-center text-lg" style={{ color: 'var(--text-2)' }}>No store found. Ask Head Office to create your store first.</div>

  return (
    <div className="max-w-2xl mx-auto">
      <div className="text-center mb-6">
        <h1 className="font-headline text-3xl font-semibold" style={{ color: 'var(--text)' }}>{inHeadOffice ? 'Central Warehouse' : 'My Store'}</h1>
        <div className="mt-2 inline-flex items-center gap-2">
          <span className="material-symbols-outlined" style={{ color: 'var(--accent)' }}>warehouse</span>
          {warehouses.length > 1 ? (
            <select className="input text-lg font-semibold" value={whId} onChange={e => setWhId(e.target.value)}>
              {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          ) : (
            <span className="text-lg font-semibold" style={{ color: 'var(--text)' }}>{wh.name}</span>
          )}
        </div>
      </div>

      {mode === 'home' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Big icon="south_west" color="#34d399" title="Material Came In"
            sub="A truck / vendor delivered material to my store" onClick={() => setMode('in')} />
          <Big icon="construction" color="#f59e0b" title="Material Used"
            sub="Material was used for work on this site" onClick={() => setMode('used')} />
          <Big icon="local_shipping" color="#38bdf8" title="Send To Another Store"
            sub="Send material from my store to a different store" onClick={() => setMode('send')} />
          <Big icon="inventory_2" color="#a78bfa" title="Check My Stock"
            sub="See how much of everything I have right now" onClick={() => setMode('stock')} />
        </div>
      )}

      {mode === 'in' && <ActionForm key="in" title="Material Came In" verb="Add to my store" color="#34d399"
        items={items} balances={balances} needBalance={false}
        extra="from" extraLabel="Came from (vendor / truck — optional)"
        onBack={() => setMode('home')}
        run={async ({ itemId, qty, note }) => {
          const it = items.find(i => i.id === itemId)!
          const { error } = await supabase.rpc('receive_stock', {
            p_date: new Date().toISOString().slice(0, 10), p_is_opening: false,
            p_items: [{ item_id: itemId, qty, rate: Number(it.standard_rate || 0) }],
            p_reference: null, p_remarks: note ? `From: ${note}` : 'Entered from My Store',
            p_vendor: null, p_warehouse: whId,
          })
          if (error) throw new Error(error.message)
        }} after={(itemId) => balMsg(balances, itemId, +1)} refresh={() => loadBalances(whId)} />}

      {mode === 'used' && <ActionForm key="used" title="Material Used" verb="Record it as used" color="#f59e0b"
        items={items} balances={balances} needBalance={true}
        extra="work" extraLabel="Used for (which work — optional)"
        onBack={() => setMode('home')}
        run={async ({ itemId, qty, note }) => {
          await postMovement('Issue', { from_warehouse: whId, issued_to: 'Project Consumption', reason: 'Consumption', remarks: note || null }, itemId, qty, items)
        }} after={(itemId) => balMsg(balances, itemId, -1)} refresh={() => loadBalances(whId)} />}

      {mode === 'send' && <SendForm items={items} balances={balances} others={others} fromWh={whId}
        onBack={() => setMode('home')} refresh={() => loadBalances(whId)} itemsAll={items} />}

      {mode === 'stock' && (
        <div className="card p-4">
          <button className="text-[14px] mb-3 inline-flex items-center gap-1" style={{ color: 'var(--text-2)' }} onClick={() => setMode('home')}>
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>arrow_back</span> Back
          </button>
          <StockList items={items} balances={balances} />
        </div>
      )}
    </div>
  )
}

/* helpers */
function balMsg(balances: Map<string, number>, itemId: string, _dir: number) { return '' }

async function postMovement(
  type: 'Issue' | 'Transfer',
  head: Record<string, unknown>,
  itemId: string, qty: number, items: Item[],
) {
  const it = items.find(i => i.id === itemId)
  const { data: u } = await supabase.auth.getUser()
  const { data: no, error: noErr } = await supabase.rpc('inv_next_movement_no', { p_type: type })
  if (noErr) throw new Error(noErr.message)
  const { data: mv, error: mErr } = await supabase.from('inv_movements').insert({
    movement_no: no, movement_type: type, movement_date: new Date().toISOString().slice(0, 10),
    status: 'Draft', created_by: u?.user?.id ?? null, ...head,
  }).select('id').single()
  if (mErr) throw new Error(mErr.message)
  const { error: lErr } = await supabase.from('inv_movement_lines').insert({
    movement_id: (mv as { id: string }).id, item_id: itemId, qty,
    rate: Number(it?.standard_rate || 0), value: qty * Number(it?.standard_rate || 0), line_no: 1,
  })
  if (lErr) throw new Error(lErr.message)
  const { error: pErr } = await supabase.rpc('inv_post_movement', { p_movement: (mv as { id: string }).id, p_allow_reserved: false })
  if (pErr) throw new Error(pErr.message)
}

/* one shared, very simple form: pick item → qty → go */
function ActionForm({ title, verb, color, items, balances, needBalance, extraLabel, onBack, run, refresh }: {
  title: string; verb: string; color: string
  items: Item[]; balances: Map<string, number>; needBalance: boolean
  extra?: string; extraLabel: string
  onBack: () => void
  run: (v: { itemId: string; qty: number; note: string }) => Promise<void>
  after: (itemId: string) => string
  refresh: () => void
}) {
  const [itemId, setItemId] = useState('')
  const [qty, setQty] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const have = itemId ? (balances.get(itemId) ?? 0) : null

  async function go() {
    const n = Number(qty)
    if (!itemId) { setErr('Pick the material first.'); return }
    if (!n || n <= 0) { setErr('Enter how much.'); return }
    if (needBalance && have != null && n > have) { setErr(`You only have ${q(have)} in your store.`); return }
    setBusy(true); setErr(null)
    try {
      await run({ itemId, qty: n, note })
      const name = items.find(i => i.id === itemId)?.name ?? 'Material'
      setDone(`${name} — ${q(n)} recorded. ✔`)
      setItemId(''); setQty(''); setNote('')
      refresh()
    } catch (e: any) { setErr(e.message || 'Something went wrong. Try again.') }
    setBusy(false)
  }

  return (
    <div className="card p-5">
      <button className="text-[14px] mb-4 inline-flex items-center gap-1" style={{ color: 'var(--text-2)' }} onClick={onBack}>
        <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>arrow_back</span> Back
      </button>
      <h2 className="text-2xl font-semibold mb-5" style={{ color }}>{title}</h2>

      {done && <div className="mb-4 p-3 rounded-lg text-lg font-semibold" style={{ background: 'rgba(52,211,153,0.1)', color: '#34d399' }}>{done}</div>}

      <label className="block mb-4">
        <span className="text-sm font-bold uppercase tracking-wider block mb-1.5" style={{ color: 'var(--faint)' }}>Which material?</span>
        <select className="input text-lg py-3" value={itemId} onChange={e => { setItemId(e.target.value); setDone(null) }}>
          <option value="">— Tap to choose —</option>
          {items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select>
        {have != null && itemId && (
          <span className="text-sm mt-1 block" style={{ color: 'var(--text-2)' }}>You have <b style={{ color: 'var(--text)' }}>{q(have)}</b> in your store now.</span>
        )}
      </label>

      <label className="block mb-4">
        <span className="text-sm font-bold uppercase tracking-wider block mb-1.5" style={{ color: 'var(--faint)' }}>How much?</span>
        <input className="input text-2xl py-3 font-mono" inputMode="decimal" placeholder="0"
          value={qty} onChange={e => setQty(e.target.value.replace(/[^\d.]/g, ''))} />
      </label>

      <label className="block mb-5">
        <span className="text-sm font-bold uppercase tracking-wider block mb-1.5" style={{ color: 'var(--faint)' }}>{extraLabel}</span>
        <input className="input text-lg py-3" value={note} onChange={e => setNote(e.target.value)} />
      </label>

      {err && <div className="mb-4 text-lg text-red-400">{err}</div>}
      <button className="btn btn-primary w-full text-lg py-4" disabled={busy} onClick={go}>
        {busy ? 'Saving…' : verb}
      </button>
    </div>
  )
}

/* send to another store */
function SendForm({ items, balances, others, fromWh, onBack, refresh, itemsAll }: {
  items: Item[]; balances: Map<string, number>; others: Wh[]; fromWh: string
  onBack: () => void; refresh: () => void; itemsAll: Item[]
}) {
  const [itemId, setItemId] = useState('')
  const [qty, setQty] = useState('')
  const [toWh, setToWh] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const have = itemId ? (balances.get(itemId) ?? 0) : null

  async function go() {
    const n = Number(qty)
    if (!itemId) { setErr('Pick the material first.'); return }
    if (!n || n <= 0) { setErr('Enter how much.'); return }
    if (!toWh) { setErr('Pick which store it goes to.'); return }
    if (have != null && n > have) { setErr(`You only have ${q(have)} in your store.`); return }
    setBusy(true); setErr(null)
    try {
      await postMovement('Transfer', { from_warehouse: fromWh, to_warehouse: toWh }, itemId, n, itemsAll)
      const name = items.find(i => i.id === itemId)?.name ?? 'Material'
      const dest = others.find(w => w.id === toWh)?.label ?? 'the other store'
      setDone(`${name} — ${q(n)} sent to ${dest}. ✔`)
      setItemId(''); setQty(''); setToWh('')
      refresh()
    } catch (e: any) { setErr(e.message || 'Something went wrong. Try again.') }
    setBusy(false)
  }

  return (
    <div className="card p-5">
      <button className="text-[14px] mb-4 inline-flex items-center gap-1" style={{ color: 'var(--text-2)' }} onClick={onBack}>
        <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>arrow_back</span> Back
      </button>
      <h2 className="text-2xl font-semibold mb-5" style={{ color: '#38bdf8' }}>Send To Another Store</h2>
      {done && <div className="mb-4 p-3 rounded-lg text-lg font-semibold" style={{ background: 'rgba(52,211,153,0.1)', color: '#34d399' }}>{done}</div>}

      <label className="block mb-4">
        <span className="text-sm font-bold uppercase tracking-wider block mb-1.5" style={{ color: 'var(--faint)' }}>Which material?</span>
        <select className="input text-lg py-3" value={itemId} onChange={e => { setItemId(e.target.value); setDone(null) }}>
          <option value="">— Tap to choose —</option>
          {items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select>
        {have != null && itemId && <span className="text-sm mt-1 block" style={{ color: 'var(--text-2)' }}>You have <b style={{ color: 'var(--text)' }}>{q(have)}</b>.</span>}
      </label>

      <label className="block mb-4">
        <span className="text-sm font-bold uppercase tracking-wider block mb-1.5" style={{ color: 'var(--faint)' }}>How much?</span>
        <input className="input text-2xl py-3 font-mono" inputMode="decimal" placeholder="0"
          value={qty} onChange={e => setQty(e.target.value.replace(/[^\d.]/g, ''))} />
      </label>

      <label className="block mb-5">
        <span className="text-sm font-bold uppercase tracking-wider block mb-1.5" style={{ color: 'var(--faint)' }}>Send to which store?</span>
        <select className="input text-lg py-3" value={toWh} onChange={e => setToWh(e.target.value)}>
          <option value="">— Tap to choose —</option>
          {others.map(w => <option key={w.id} value={w.id}>{w.label ?? w.name}</option>)}
        </select>
      </label>

      {err && <div className="mb-4 text-lg text-red-400">{err}</div>}
      <button className="btn btn-primary w-full text-lg py-4" disabled={busy} onClick={go}>
        {busy ? 'Sending…' : 'Send it'}
      </button>
    </div>
  )
}

function StockList({ items, balances }: { items: Item[]; balances: Map<string, number> }) {
  const [search, setSearch] = useState('')
  const rows = useMemo(() =>
    items.map(i => ({ ...i, bal: balances.get(i.id) ?? 0 }))
      .filter(r => r.bal !== 0 || search)
      .filter(r => !search || r.name.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => b.bal - a.bal),
  [items, balances, search])

  return (
    <div>
      <h2 className="text-2xl font-semibold mb-4" style={{ color: '#a78bfa' }}>My Stock Right Now</h2>
      <input className="input text-lg py-3 mb-4" placeholder="Search material…" value={search} onChange={e => setSearch(e.target.value)} />
      <div className="divide-y divide-white/[0.06]">
        {rows.map(r => (
          <div key={r.id} className="flex items-center justify-between py-3">
            <span className="text-lg" style={{ color: 'var(--text)' }}>{r.name}</span>
            <span className="text-xl font-mono font-bold" style={{ color: r.bal > 0 ? '#34d399' : 'var(--faint)' }}>{q(r.bal)}</span>
          </div>
        ))}
        {!rows.length && <p className="py-6 text-lg text-center" style={{ color: 'var(--faint)' }}>Nothing in the store yet.</p>}
      </div>
    </div>
  )
}

function Big({ icon, color, title, sub, onClick }: { icon: string; color: string; title: string; sub: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="card p-6 text-left hover:bg-white/[0.04] transition-colors min-h-[140px] flex flex-col justify-between">
      <span className="material-symbols-outlined" style={{ fontSize: '34px', color }}>{icon}</span>
      <div>
        <div className="text-xl font-semibold mt-3" style={{ color: 'var(--text)' }}>{title}</div>
        <div className="text-[13px] mt-1 leading-snug" style={{ color: 'var(--text-2)' }}>{sub}</div>
      </div>
    </button>
  )
}