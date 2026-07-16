import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

// Global, app-styled replacements for the browser's alert / confirm / prompt.
//   appAlert(msg)            → styled notice, resolves when dismissed
//   await appConfirm(msg)    → true / false
//   await appPrompt(msg)     → string, or null when cancelled
// The first line of the message becomes the dialog title, the rest the body.
// <DialogHost /> is mounted once in AppShell. If it isn't mounted (edge case),
// the calls fall back to the native popups so nothing ever breaks.

type Req = {
  kind: 'alert' | 'confirm' | 'prompt'
  text: string
  resolve: (v: any) => void
}

let push: ((r: Req) => void) | null = null

export function appAlert(text: string): Promise<void> {
  return new Promise(res => {
    if (push) push({ kind: 'alert', text, resolve: res })
    else { window.alert(text); res() }
  })
}
export function appConfirm(text: string): Promise<boolean> {
  return new Promise(res => {
    if (push) push({ kind: 'confirm', text, resolve: res })
    else res(window.confirm(text))
  })
}
export function appPrompt(text: string): Promise<string | null> {
  return new Promise(res => {
    if (push) push({ kind: 'prompt', text, resolve: res })
    else res(window.prompt(text))
  })
}

export function DialogHost() {
  const [queue, setQueue] = useState<Req[]>([])
  const [value, setValue] = useState('')

  useEffect(() => {
    push = (r: Req) => setQueue(q => [...q, r])
    return () => { push = null }
  }, [])

  const cur = queue[0] ?? null
  useEffect(() => { setValue('') }, [cur])
  if (!cur) return null

  const lines = (cur.text ?? '').split('\n').filter(Boolean)
  const title = lines[0] ?? ''
  const body = lines.slice(1).join('\n')
  const isErr = /could not|failed|error|cannot/i.test(title)

  const done = (v: any) => { cur.resolve(v); setQueue(q => q.slice(1)) }
  const ok = () => done(cur.kind === 'prompt' ? value.trim() : cur.kind === 'confirm' ? true : undefined)
  const cancel = () => done(cur.kind === 'prompt' ? null : cur.kind === 'confirm' ? false : undefined)

  return createPortal((
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={cancel}>
      <div onClick={e => e.stopPropagation()}
        className={`bg-[#1B1F2A] border rounded-2xl w-full max-w-md shadow-[0px_10px_30px_rgba(0,0,0,0.5)] ${isErr ? 'border-red-500/30' : 'border-white/[0.08]'}`}>
        <div className="p-5 border-b border-white/5 flex items-start gap-2.5">
          <span className={`material-symbols-outlined mt-0.5 ${isErr ? 'text-red-400' : 'text-[#ffb87b]'}`}>
            {isErr ? 'error' : cur.kind === 'prompt' ? 'edit_note' : cur.kind === 'confirm' ? 'help' : 'info'}
          </span>
          <h3 className="font-headline text-lg font-semibold text-[#e2e2e8] leading-snug">{title}</h3>
        </div>
        {(body || cur.kind === 'prompt') && (
          <div className="p-5">
            {body && <p className="text-[13px] text-[#dcc1ae] whitespace-pre-line">{body}</p>}
            {cur.kind === 'prompt' && (
              <input className={`input w-full ${body ? 'mt-3' : ''}`} autoFocus
                value={value} onChange={e => setValue(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') ok() }} />
            )}
          </div>
        )}
        <div className="p-5 pt-2 flex gap-3">
          {cur.kind !== 'alert' && <button className="btn btn-ghost flex-1" onClick={cancel}>Cancel</button>}
          <button className="btn flex-[2]"
            style={isErr ? { background: 'rgba(248,113,113,0.15)', color: '#f87171' } : { background: 'var(--accent, #ff8f00)', color: '#0B0B0C' }}
            onClick={ok}>
            {cur.kind === 'alert' ? 'OK' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  ), document.body)
}