/**
 * Print the current page.
 *
 * We use the browser's own print, with a print stylesheet that hides
 * the chrome (sidebar, buttons, filters) and prints only the content.
 * That is simpler and more reliable than generating a separate PDF —
 * and what the person sees on screen is what comes out of the printer.
 */
export default function PrintButton({ title }: { title?: string }) {
  function go() {
    const old = document.title
    if (title) document.title = title
    window.print()
    setTimeout(() => { document.title = old }, 500)
  }

  return (
    <button className="btn btn-ghost no-print" style={{ padding: '6px 12px', fontSize: '12px' }}
      onClick={go} title="Print">
      <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>print</span>
      Print
    </button>
  )
}