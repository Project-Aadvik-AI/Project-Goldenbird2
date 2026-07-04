export default function Placeholder({ title }: { title: string }) {
  return (
    <div>
      <h1 className="text-xl font-black">{title}</h1>
      <div className="card p-8 mt-4 text-center text-muted">
        <div className="text-4xl mb-3">🛠️</div>
        This module is coming in the next phase.<br/>
        <span className="text-sm text-faint">The pattern is set by Daily Expenses — we port each module the same way.</span>
      </div>
    </div>
  )
}