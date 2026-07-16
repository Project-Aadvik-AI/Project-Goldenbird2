import { useState } from 'react'
import { createPortal } from 'react-dom'

// App-styled replacement for the browser's confirm() / prompt() / alert().
// kind:
//   'confirm' — OK / Cancel
//   'input'   — asks for a text reason, OK disabled until something is typed
//   'error'   — single OK, red accent
export type DialogSpec = {
  kind: 'confirm' | 'input' | 'error'
  title: string
  message?: string
  okLabel?: string
  onOk?: (value: string) => void
}

export default function AppDialog({ spec, onClose }: { spec: DialogSpec; onClose: () => void }) {
  const [value, setValue] = useState('')
  const isErr = spec.kind === 'error'

  function ok() {
    spec.onOk?.(value.trim())
    onClose()
  }

  return createPortal((
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className={`bg-[#1B1F2A] border rounded-2xl w-full max-w-md shadow-[0px_10px_30px_rgba(0,0,0,0.5)] ${isErr ? 'border-red-500/30' : 'border-white/[0.08]'}`}>
        <div className="p-5 border-b border-white/5 flex items-center gap-2.5">
          <span className={`material-symbols-outlined ${isErr ? 'text-red-400' : 'text-[#ffb87b]'}`}>
            {isErr ? 'error' : spec.kind === 'input' ? 'edit_note' : 'help'}
          </span>
          <h3 className="font-headline text-lg font-semibold text-[#e2e2e8]">{spec.title}</h3>
        </div>
        <div className="p-5">
          {spec.message && <p className="text-[13px] text-[#dcc1ae] whitespace-pre-line">{spec.message}</p>}
          {spec.kind === 'input' && (
            <input className="input mt-3 w-full" autoFocus placeholder="Reason…"
              value={value} onChange={e => setValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && value.trim()) ok() }} />
          )}
        </div>
        <div className="p-5 pt-0 flex gap-3">
          {spec.kind !== 'error' && <button className="btn btn-ghost flex-1" onClick={onClose}>Cancel</button>}
          <button
            className="btn flex-[2]"
            style={isErr
              ? { background: 'rgba(248,113,113,0.15)', color: '#f87171' }
              : { background: 'var(--accent, #ff8f00)', color: '#0B0B0C' }}
            disabled={spec.kind === 'input' && !value.trim()}
            onClick={ok}>
            {spec.okLabel ?? (isErr ? 'OK' : 'Confirm')}
          </button>
        </div>
      </div>
    </div>
  ), document.body)
}