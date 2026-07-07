import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { exportExcel, exportPDF } from '../lib/exporters'

export type Col<T> = { header: string; get: (r: T) => string | number }

// Detailed export with an optional From→To date range filter.
// The dropdown renders in a portal so it's never clipped by table cards.
export default function ExportButtons<T>({
  filename, title, rows, columns, dateField,
}: {
  filename: string
  title: string
  rows: T[]
  columns: Col<T>[]
  dateField?: keyof T
}) {
  const [open, setOpen] = useState(false)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [pos, setPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    setPos({ top: r.bottom + 8, right: window.innerWidth - r.right })
  }, [open])

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) setOpen(false)
    }
    function onScroll() { setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [open])

  const filtered = rows.filter(r => {
    if (!dateField) return true
    const d = String((r as Record<string, unknown>)[dateField as string] ?? '')
    if (from && d < from) return false
    if (to && d > to) return false
    return true
  })

  const headers = columns.map(c => c.header)
  const matrix = filtered.map(r => columns.map(c => c.get(r)))
  const count = filtered.length

  function thisMonth() {
    const now = new Date()
    const first = new Date(now.getFullYear(), now.getMonth(), 1)
    setFrom(first.toISOString().slice(0, 10))
    setTo(now.toISOString().slice(0, 10))
  }

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen(v => !v)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--line)] text-[11px] font-semibold text-[var(--text-2)] hover:text-[var(--text)] hover:border-[var(--text-2)] transition-colors"
      >
        <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>download</span>
        Export
        <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>{open ? 'expand_less' : 'expand_more'}</span>
      </button>

      {open && createPortal(
        <div
          ref={panelRef}
          style={{ position: 'fixed', top: pos.top, right: pos.right, zIndex: 9999 }}
          className="w-72 max-h-[80vh] overflow-y-auto bg-[var(--card)] border border-[var(--line)] rounded-xl shadow-[0_20px_50px_-12px_rgba(0,0,0,0.45)] p-4"
        >
          {dateField && (
            <>
              <div className="text-[10px] font-mono uppercase tracking-[0.16em] text-[var(--faint)] mb-2">Date range (optional)</div>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <label className="block">
                  <span className="text-[10px] text-[var(--faint)] block mb-1">From</span>
                  <input type="date" value={from} onChange={e => setFrom(e.target.value)}
                    className="w-full text-[12px] px-2 py-1.5 rounded-lg border border-[var(--line)] bg-[var(--bg)] text-[var(--text)]" />
                </label>
                <label className="block">
                  <span className="text-[10px] text-[var(--faint)] block mb-1">To</span>
                  <input type="date" value={to} onChange={e => setTo(e.target.value)}
                    className="w-full text-[12px] px-2 py-1.5 rounded-lg border border-[var(--line)] bg-[var(--bg)] text-[var(--text)]" />
                </label>
              </div>
              <div className="flex items-center gap-2 mb-3">
                <button onClick={thisMonth} className="text-[10px] font-semibold px-2 py-1 rounded-md border border-[var(--line)] text-[var(--text-2)] hover:text-[var(--text)] hover:border-[var(--text-2)] transition-colors">This month</button>
                <button onClick={() => { setFrom(''); setTo('') }} className="text-[10px] font-semibold px-2 py-1 rounded-md border border-[var(--line)] text-[var(--text-2)] hover:text-[var(--text)] hover:border-[var(--text-2)] transition-colors">All dates</button>
              </div>
            </>
          )}

          <div className="text-[11px] text-[var(--text-2)] mb-3">
            <span className="font-semibold text-[var(--text)]">{count}</span> record{count === 1 ? '' : 's'} · {columns.length} columns
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => { if (count) exportExcel(filename, headers, matrix); setOpen(false) }}
              disabled={!count}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 text-white text-[12px] font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>table_view</span> Excel (detailed)
            </button>
            <button
              onClick={() => { if (count) exportPDF(title, headers, matrix); setOpen(false) }}
              disabled={!count}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--line)] text-[12px] font-semibold text-[var(--text-2)] hover:text-[var(--text)] hover:border-[var(--text-2)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>picture_as_pdf</span> PDF
            </button>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}