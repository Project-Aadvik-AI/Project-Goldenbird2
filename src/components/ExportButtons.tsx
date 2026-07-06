import { exportExcel, exportPDF } from '../lib/exporters'

type Cell = string | number
export default function ExportButtons({
  filename, title, headers, rows,
}: { filename: string; title: string; headers: string[]; rows: Cell[][] }) {
  const disabled = rows.length === 0
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => exportExcel(filename, headers, rows)}
        disabled={disabled}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--line)] text-[11px] font-semibold text-[var(--text-2)] hover:text-[var(--text)] hover:border-[var(--text-2)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>table_view</span> Excel
      </button>
      <button
        onClick={() => exportPDF(title, headers, rows)}
        disabled={disabled}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--line)] text-[11px] font-semibold text-[var(--text-2)] hover:text-[var(--text)] hover:border-[var(--text-2)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>picture_as_pdf</span> PDF
      </button>
    </div>
  )
}