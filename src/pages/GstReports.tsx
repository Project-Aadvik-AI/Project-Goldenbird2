import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import ExportButtons from '../components/ExportButtons'

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const inr = (n: number) =>
  '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

type Out = {
  voucher_id: string; voucher_no: string; voucher_type: string; voucher_date: string
  invoice_no: string | null; party_name: string | null; party_gstin: string | null
  party_state: string | null; project_name: string | null
  taxable_value: number; cgst: number; sgst: number; igst: number
  total_tax: number; invoice_value: number; supply_type: string; customer_type: string
}
type In = {
  voucher_id: string; voucher_no: string; voucher_date: string; bill_no: string | null
  party_name: string | null; party_gstin: string | null; project_name: string | null
  taxable_value: number; cgst: number; sgst: number; igst: number
  itc_total: number; bill_value: number
}
type Tds = {
  voucher_no: string; voucher_date: string; party_name: string | null
  party_gstin: string | null; ledger_name: string; tds_amount: number
}

type Tab = 'gstr1' | 'gstr3b' | 'itc' | 'tds'

export default function GstReports() {
  const { isAdmin } = useAuth()
  const [tab, setTab] = useState<Tab>('gstr3b')

  // default to the current month (GST is filed monthly)
  const now = new Date()
  const [from, setFrom] = useState(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10))
  const [to, setTo] = useState(new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10))

  const [out, setOut] = useState<Out[]>([])
  const [inw, setInw] = useState<In[]>([])
  const [tds, setTds] = useState<Tds[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      setLoading(true)
      const [{ data: o }, { data: i }, { data: t }] = await Promise.all([
        supabase.from('acc_gst_outward').select('*').gte('voucher_date', from).lte('voucher_date', to).order('voucher_date'),
        supabase.from('acc_gst_inward').select('*').gte('voucher_date', from).lte('voucher_date', to).order('voucher_date'),
        supabase.from('acc_gst_tds').select('*').gte('voucher_date', from).lte('voucher_date', to).order('voucher_date'),
      ])
      setOut((o as Out[]) ?? [])
      setInw((i as In[]) ?? [])
      setTds((t as Tds[]) ?? [])
      setLoading(false)
    })()
  }, [from, to])

  const sums = useMemo(() => {
    const s = (rows: any[], k: string) => r2(rows.reduce((n, r) => n + Number(r[k] || 0), 0))
    const outTaxable = s(out, 'taxable_value')
    const outCgst = s(out, 'cgst'), outSgst = s(out, 'sgst'), outIgst = s(out, 'igst')
    const outTax = r2(outCgst + outSgst + outIgst)
    const inCgst = s(inw, 'cgst'), inSgst = s(inw, 'sgst'), inIgst = s(inw, 'igst')
    const itc = r2(inCgst + inSgst + inIgst)
    const tdsTotal = s(tds, 'tds_amount')
    // net GST payable = output tax − ITC − GST TDS already deducted by clients
    const netPayable = r2(outTax - itc - tdsTotal)
    return { outTaxable, outCgst, outSgst, outIgst, outTax, inCgst, inSgst, inIgst, itc, tdsTotal, netPayable }
  }, [out, inw, tds])

  if (!isAdmin) return <div className="p-8 text-center text-[#dcc1ae]">GST reports are restricted to administrators.</div>

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-headline text-2xl font-semibold text-[#e2e2e8]">GST Reports</h1>
        <p className="text-sm text-[#dcc1ae] mt-0.5">
          Built from posted vouchers. Use these to <b>verify</b> your GST position before your CA files.
        </p>
      </div>

      <div className="card p-4 mb-5 flex flex-wrap gap-3 items-end">
        <L label="From"><input type="date" className="input" value={from} onChange={e => setFrom(e.target.value)} /></L>
        <L label="To"><input type="date" className="input" value={to} onChange={e => setTo(e.target.value)} /></L>
        <button className="btn btn-ghost" style={{ padding: '7px 12px', fontSize: '12px' }}
          onClick={() => {
            const d = new Date()
            setFrom(new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10))
            setTo(new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10))
          }}>This month</button>
        <button className="btn btn-ghost" style={{ padding: '7px 12px', fontSize: '12px' }}
          onClick={() => {
            const d = new Date()
            setFrom(new Date(d.getFullYear(), d.getMonth() - 1, 1).toISOString().slice(0, 10))
            setTo(new Date(d.getFullYear(), d.getMonth(), 0).toISOString().slice(0, 10))
          }}>Last month</button>
      </div>

      <div className="flex gap-1 mb-5 flex-wrap">
        {([
          ['gstr3b', 'GSTR-3B Summary'], ['gstr1', 'GSTR-1 (Outward)'],
          ['itc', 'ITC Register (Inward)'], ['tds', 'GST TDS Deducted'],
        ] as [Tab, string][]).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-3.5 py-2 rounded-lg text-[13px] font-semibold border transition-colors ${
              tab === k ? 'bg-[#ff8f00]/10 text-[#ffb87b] border-[#ff8f00]/30'
                        : 'text-[#dcc1ae] border-white/[0.08] hover:bg-white/[0.03]'}`}>
            {label}
          </button>
        ))}
      </div>

      {loading ? <div className="card p-8 text-center text-[#dcc1ae] text-sm">Loading…</div> : (
        <>
          {tab === 'gstr3b' && <Gstr3b s={sums} />}
          {tab === 'gstr1' && <Gstr1 rows={out} />}
          {tab === 'itc' && <Itc rows={inw} />}
          {tab === 'tds' && <TdsReport rows={tds} />}
        </>
      )}
    </div>
  )
}

// ---------------- GSTR-3B summary ----------------
function Gstr3b({ s }: { s: any }) {
  const payable = s.netPayable > 0
  return (
    <div>
      <div className={`card p-5 mb-5 ${payable ? 'bg-amber-500/5 border-amber-500/15' : 'bg-emerald-500/5 border-emerald-500/15'}`}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[11px] text-[#dcc1ae]/70 uppercase tracking-wider mb-1">
              {payable ? 'Net GST Payable' : 'Net GST Credit / Refund'}
            </div>
            <div className="text-[11px] text-[#dcc1ae]/60">Output tax − ITC − GST TDS deducted by clients</div>
          </div>
          <span className={`font-mono text-[28px] font-bold ${payable ? 'text-amber-400' : 'text-emerald-400'}`}>
            {inr(Math.abs(s.netPayable))}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Box title="3.1 — Outward Supplies (tax payable)">
          <Line label="Taxable value of outward supplies" value={inr(s.outTaxable)} />
          <Line label="Output CGST" value={inr(s.outCgst)} />
          <Line label="Output SGST" value={inr(s.outSgst)} />
          <Line label="Output IGST" value={inr(s.outIgst)} />
          <Line label="Total output tax" value={inr(s.outTax)} bold />
        </Box>

        <Box title="4 — Eligible Input Tax Credit (ITC)">
          <Line label="Input CGST" value={inr(s.inCgst)} />
          <Line label="Input SGST" value={inr(s.inSgst)} />
          <Line label="Input IGST" value={inr(s.inIgst)} />
          <Line label="Total ITC available" value={inr(s.itc)} bold />
        </Box>

        <Box title="GST TDS (Sec 51) — deducted by clients">
          <Line label="GST TDS deducted from your bills" value={inr(s.tdsTotal)} />
          <p className="text-[11px] text-[#dcc1ae]/50 mt-2">
            Government clients deduct 2% GST TDS. It appears in your GST cash ledger and reduces what you pay.
          </p>
        </Box>

        <Box title="Net Position">
          <Line label="Output tax" value={inr(s.outTax)} />
          <Line label="Less: ITC" value={'− ' + inr(s.itc)} />
          <Line label="Less: GST TDS" value={'− ' + inr(s.tdsTotal)} />
          <Line label={payable ? 'NET PAYABLE' : 'NET CREDIT'} value={inr(Math.abs(s.netPayable))} bold />
        </Box>
      </div>

      <p className="text-[11px] text-[#dcc1ae]/50 mt-5">
        This is a verification summary, not a filing. Give it to your CA to cross-check against Tally before filing GSTR-3B.
      </p>
    </div>
  )
}

// ---------------- GSTR-1 (outward) ----------------
function Gstr1({ rows }: { rows: Out[] }) {
  const b2b = rows.filter(r => r.customer_type === 'B2B')
  const b2c = rows.filter(r => r.customer_type === 'B2C')
  const tot = (rs: Out[], k: keyof Out) => r2(rs.reduce((n, r) => n + Number(r[k] || 0), 0))

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <K label="Invoices" value={String(rows.length)} />
        <K label="Taxable Value" value={inr(tot(rows, 'taxable_value'))} />
        <K label="Total Tax" value={inr(tot(rows, 'total_tax'))} tone="amber" />
        <K label="Invoice Value" value={inr(tot(rows, 'invoice_value'))} />
      </div>

      <Table title={`B2B — Registered Clients (${b2b.length})`} rows={b2b} />
      <div className="h-5" />
      <Table title={`B2C — Unregistered (${b2c.length})`} rows={b2c} />
    </div>
  )
}

function Table({ title, rows }: { title: string; rows: Out[] }) {
  return (
    <div className="card overflow-hidden overflow-x-auto">
      <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
        <span className="text-sm font-semibold text-[#e2e2e8]">{title}</span>
        <ExportButtons filename="gstr1" title={title} rows={rows}
          columns={[
            { header: 'Invoice Date', get: (r: any) => r.voucher_date },
            { header: 'Invoice No.', get: (r: any) => r.invoice_no || r.voucher_no },
            { header: 'Customer', get: (r: any) => r.party_name || '—' },
            { header: 'GSTIN', get: (r: any) => r.party_gstin || '—' },
            { header: 'State', get: (r: any) => r.party_state || '—' },
            { header: 'Supply Type', get: (r: any) => r.supply_type },
            { header: 'Project', get: (r: any) => r.project_name || '—' },
            { header: 'Taxable Value', get: (r: any) => Number(r.taxable_value) },
            { header: 'CGST', get: (r: any) => Number(r.cgst) },
            { header: 'SGST', get: (r: any) => Number(r.sgst) },
            { header: 'IGST', get: (r: any) => Number(r.igst) },
            { header: 'Total Tax', get: (r: any) => Number(r.total_tax) },
            { header: 'Invoice Value', get: (r: any) => Number(r.invoice_value) },
          ]} />
      </div>
      <table className="w-full text-sm">
        <thead className="bg-[#282a2e]"><tr>
          {['Date', 'Invoice', 'Customer', 'GSTIN', 'Supply', 'Taxable', 'CGST', 'SGST', 'IGST', 'Invoice Value'].map(h => (
            <th key={h} className="px-3 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
          ))}
        </tr></thead>
        <tbody className="divide-y divide-white/[0.05]">
          {rows.map(r => (
            <tr key={r.voucher_id} className="hover:bg-white/[0.02]">
              <td className="px-3 py-2.5 font-mono text-[12px] text-[#dcc1ae]">{r.voucher_date}</td>
              <td className="px-3 py-2.5 font-mono text-[12px] text-[#e2e2e8]">{r.invoice_no || r.voucher_no}</td>
              <td className="px-3 py-2.5 text-[#e2e2e8]">{r.party_name || '—'}</td>
              <td className="px-3 py-2.5 font-mono text-[11px] text-[#dcc1ae]">{r.party_gstin || '—'}</td>
              <td className="px-3 py-2.5">
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border whitespace-nowrap ${
                  r.supply_type === 'Inter-state'
                    ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                    : 'bg-white/5 text-[#dcc1ae] border-white/10'}`}>{r.supply_type}</span>
              </td>
              <td className="px-3 py-2.5 font-mono text-[#e2e2e8] text-right whitespace-nowrap">{inr(r.taxable_value)}</td>
              <td className="px-3 py-2.5 font-mono text-[#dcc1ae] text-right whitespace-nowrap">{r.cgst ? inr(r.cgst) : '—'}</td>
              <td className="px-3 py-2.5 font-mono text-[#dcc1ae] text-right whitespace-nowrap">{r.sgst ? inr(r.sgst) : '—'}</td>
              <td className="px-3 py-2.5 font-mono text-[#dcc1ae] text-right whitespace-nowrap">{r.igst ? inr(r.igst) : '—'}</td>
              <td className="px-3 py-2.5 font-mono font-bold text-[#e2e2e8] text-right whitespace-nowrap">{inr(r.invoice_value)}</td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={10} className="px-4 py-8 text-center text-[#dcc1ae]/60 text-sm">No invoices in this period.</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

// ---------------- ITC register ----------------
function Itc({ rows }: { rows: In[] }) {
  const tot = (k: keyof In) => r2(rows.reduce((n, r) => n + Number(r[k] || 0), 0))
  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <K label="Purchase Bills" value={String(rows.length)} />
        <K label="Taxable Value" value={inr(tot('taxable_value'))} />
        <K label="ITC Available" value={inr(tot('itc_total'))} tone="emerald" />
        <K label="Bill Value" value={inr(tot('bill_value'))} />
      </div>
      <div className="card overflow-hidden overflow-x-auto">
        <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
          <span className="text-sm font-semibold text-[#e2e2e8]">Input Tax Credit Register</span>
          <ExportButtons filename="itc-register" title="ITC Register" rows={rows}
            columns={[
              { header: 'Date', get: (r: any) => r.voucher_date },
              { header: 'Bill No.', get: (r: any) => r.bill_no || r.voucher_no },
              { header: 'Vendor', get: (r: any) => r.party_name || '—' },
              { header: 'GSTIN', get: (r: any) => r.party_gstin || '—' },
              { header: 'Project', get: (r: any) => r.project_name || '—' },
              { header: 'Taxable Value', get: (r: any) => Number(r.taxable_value) },
              { header: 'Input CGST', get: (r: any) => Number(r.cgst) },
              { header: 'Input SGST', get: (r: any) => Number(r.sgst) },
              { header: 'Input IGST', get: (r: any) => Number(r.igst) },
              { header: 'ITC Total', get: (r: any) => Number(r.itc_total) },
              { header: 'Bill Value', get: (r: any) => Number(r.bill_value) },
            ]} />
        </div>
        <table className="w-full text-sm">
          <thead className="bg-[#282a2e]"><tr>
            {['Date', 'Bill No.', 'Vendor', 'GSTIN', 'Taxable', 'CGST', 'SGST', 'IGST', 'ITC Total'].map(h => (
              <th key={h} className="px-3 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
            ))}
          </tr></thead>
          <tbody className="divide-y divide-white/[0.05]">
            {rows.map(r => (
              <tr key={r.voucher_id} className="hover:bg-white/[0.02]">
                <td className="px-3 py-2.5 font-mono text-[12px] text-[#dcc1ae]">{r.voucher_date}</td>
                <td className="px-3 py-2.5 font-mono text-[12px] text-[#e2e2e8]">{r.bill_no || r.voucher_no}</td>
                <td className="px-3 py-2.5 text-[#e2e2e8]">{r.party_name || '—'}</td>
                <td className="px-3 py-2.5 font-mono text-[11px] text-[#dcc1ae]">{r.party_gstin || '—'}</td>
                <td className="px-3 py-2.5 font-mono text-[#e2e2e8] text-right whitespace-nowrap">{inr(r.taxable_value)}</td>
                <td className="px-3 py-2.5 font-mono text-[#dcc1ae] text-right whitespace-nowrap">{r.cgst ? inr(r.cgst) : '—'}</td>
                <td className="px-3 py-2.5 font-mono text-[#dcc1ae] text-right whitespace-nowrap">{r.sgst ? inr(r.sgst) : '—'}</td>
                <td className="px-3 py-2.5 font-mono text-[#dcc1ae] text-right whitespace-nowrap">{r.igst ? inr(r.igst) : '—'}</td>
                <td className="px-3 py-2.5 font-mono font-bold text-emerald-400 text-right whitespace-nowrap">{inr(r.itc_total)}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={9} className="px-4 py-8 text-center text-[#dcc1ae]/60 text-sm">
              No purchase bills with GST in this period. Post vendor bills to accounts to claim ITC.
            </td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ---------------- GST TDS ----------------
function TdsReport({ rows }: { rows: Tds[] }) {
  const total = r2(rows.reduce((n, r) => n + Number(r.tds_amount || 0), 0))
  return (
    <div>
      <div className="card p-4 mb-4 bg-blue-500/5 border-blue-500/15">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[13px] font-semibold text-blue-400">GST TDS deducted by your clients (Sec 51)</div>
            <div className="text-[11px] text-[#dcc1ae]/60 mt-0.5">
              Government clients deduct 2% GST TDS from your bills. Claim it in your GST cash ledger.
            </div>
          </div>
          <span className="font-mono text-[24px] font-bold text-blue-400">{inr(total)}</span>
        </div>
      </div>
      <div className="card overflow-hidden overflow-x-auto">
        <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
          <span className="text-sm font-semibold text-[#e2e2e8]">GST TDS Register</span>
          <ExportButtons filename="gst-tds" title="GST TDS Deducted" rows={rows}
            columns={[
              { header: 'Date', get: (r: any) => r.voucher_date },
              { header: 'Voucher', get: (r: any) => r.voucher_no },
              { header: 'Client', get: (r: any) => r.party_name || '—' },
              { header: 'GSTIN', get: (r: any) => r.party_gstin || '—' },
              { header: 'Ledger', get: (r: any) => r.ledger_name },
              { header: 'TDS Amount', get: (r: any) => Number(r.tds_amount) },
            ]} />
        </div>
        <table className="w-full text-sm">
          <thead className="bg-[#282a2e]"><tr>
            {['Date', 'Voucher', 'Client', 'GSTIN', 'Ledger', 'TDS Amount'].map(h => (
              <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider">{h}</th>
            ))}
          </tr></thead>
          <tbody className="divide-y divide-white/[0.05]">
            {rows.map((r, i) => (
              <tr key={i} className="hover:bg-white/[0.02]">
                <td className="px-4 py-2.5 font-mono text-[12px] text-[#dcc1ae]">{r.voucher_date}</td>
                <td className="px-4 py-2.5 font-mono text-[12px] text-[#e2e2e8]">{r.voucher_no}</td>
                <td className="px-4 py-2.5 text-[#e2e2e8]">{r.party_name || '—'}</td>
                <td className="px-4 py-2.5 font-mono text-[11px] text-[#dcc1ae]">{r.party_gstin || '—'}</td>
                <td className="px-4 py-2.5 text-[#dcc1ae]">{r.ledger_name}</td>
                <td className="px-4 py-2.5 font-mono font-bold text-blue-400 text-right">{inr(r.tds_amount)}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={6} className="px-4 py-8 text-center text-[#dcc1ae]/60 text-sm">No GST TDS deducted in this period.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ---------------- shared ----------------
function Box({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card p-5">
      <h3 className="text-sm font-semibold text-[#e2e2e8] mb-3">{title}</h3>
      {children}
    </div>
  )
}
function Line({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-1.5 ${bold ? 'border-t border-white/[0.08] mt-1.5 pt-2.5' : 'border-b border-white/[0.04]'}`}>
      <span className={`text-[12px] ${bold ? 'font-bold text-[#e2e2e8] uppercase tracking-wide' : 'text-[#dcc1ae]'}`}>{label}</span>
      <span className={`font-mono ${bold ? 'text-[15px] font-bold text-[#ffb87b]' : 'text-[13px] text-[#e2e2e8]'}`}>{value}</span>
    </div>
  )
}
function K({ label, value, tone }: { label: string; value: string; tone?: 'emerald' | 'amber' }) {
  const c = tone === 'emerald' ? 'text-emerald-400' : tone === 'amber' ? 'text-amber-400' : 'text-[#e2e2e8]'
  return (
    <div className="card p-3">
      <div className="text-[10px] text-[#dcc1ae]/60 uppercase tracking-wider mb-1">{label}</div>
      <div className={`font-mono text-[18px] font-bold ${c}`}>{value}</div>
    </div>
  )
}
function L({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-[10px] font-bold text-[#dcc1ae]/60 uppercase tracking-wider block mb-1">{label}</span>{children}</label>
}