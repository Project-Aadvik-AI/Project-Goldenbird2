import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'

// Password policy: min 8, upper, lower, number, special
function checkPolicy(pw: string): string[] {
  const issues: string[] = []
  if (pw.length < 8) issues.push('At least 8 characters')
  if (!/[A-Z]/.test(pw)) issues.push('An uppercase letter')
  if (!/[a-z]/.test(pw)) issues.push('A lowercase letter')
  if (!/[0-9]/.test(pw)) issues.push('A number')
  if (!/[^A-Za-z0-9]/.test(pw)) issues.push('A special character')
  return issues
}

export default function ChangePassword({ forced = false }: { forced?: boolean }) {
  const { changePassword, signOut } = useAuth()
  const navigate = useNavigate()
  const [pw, setPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const issues = checkPolicy(pw)
  const match = pw.length > 0 && pw === confirm

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (issues.length) { setErr('Password does not meet the requirements.'); return }
    if (!match) { setErr('Passwords do not match.'); return }
    setBusy(true); setErr(null)
    const { error } = await changePassword(pw)
    setBusy(false)
    if (error) { setErr(error); return }
    setDone(true)
    if (!forced) setTimeout(() => navigate('/'), 1200)
  }

  return (
    <div className={forced ? 'min-h-screen flex items-center justify-center p-4 bg-[var(--bg)]' : 'max-w-lg mx-auto'}>
      <div className="card p-6 w-full max-w-md">
        <div className="flex items-center gap-2 mb-1">
          <span className="material-symbols-outlined text-[#ffb87b]" style={{ fontSize: '22px' }}>lock_reset</span>
          <h1 className="font-headline text-xl font-semibold text-[#e2e2e8]">
            {forced ? 'Set a new password' : 'Change password'}
          </h1>
        </div>
        <p className="text-[13px] text-[#dcc1ae] mb-5">
          {forced
            ? 'For security, you must change your temporary password before continuing.'
            : 'Choose a new password for your account.'}
        </p>

        {done ? (
          <div className="text-center py-6">
            <span className="material-symbols-outlined text-emerald-400" style={{ fontSize: '40px' }}>check_circle</span>
            <p className="text-[#e2e2e8] font-semibold mt-2">Password changed successfully.</p>
            {forced
              ? <button className="btn btn-primary mt-4" onClick={() => navigate('/')}>Continue to dashboard</button>
              : <p className="text-[13px] text-[#dcc1ae] mt-1">Redirecting…</p>}
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <label className="block">
              <span className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider block mb-1">New password</span>
              <input type="password" className="input w-full" value={pw} onChange={e => setPw(e.target.value)} autoFocus />
            </label>
            <label className="block">
              <span className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider block mb-1">Confirm new password</span>
              <input type="password" className="input w-full" value={confirm} onChange={e => setConfirm(e.target.value)} />
            </label>

            <div className="rounded-lg bg-white/[0.03] border border-white/[0.05] p-3">
              <div className="text-[11px] text-[#dcc1ae]/60 uppercase tracking-wide mb-1.5">Requirements</div>
              {['At least 8 characters', 'An uppercase letter', 'A lowercase letter', 'A number', 'A special character'].map(req => {
                const ok = !issues.includes(req)
                return (
                  <div key={req} className={`text-[12px] flex items-center gap-1.5 ${ok ? 'text-emerald-400' : 'text-[#dcc1ae]/60'}`}>
                    <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>{ok ? 'check' : 'radio_button_unchecked'}</span>{req}
                  </div>
                )
              })}
              {confirm.length > 0 && (
                <div className={`text-[12px] flex items-center gap-1.5 mt-0.5 ${match ? 'text-emerald-400' : 'text-red-400'}`}>
                  <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>{match ? 'check' : 'close'}</span>Passwords match
                </div>
              )}
            </div>

            {err && <div className="text-sm text-red-400">{err}</div>}
            <button className="btn btn-primary w-full" disabled={busy || issues.length > 0 || !match}>
              {busy ? 'Saving…' : 'Change password'}
            </button>
            {forced && (
              <button type="button" className="btn btn-ghost w-full" onClick={() => signOut()}>Sign out instead</button>
            )}
          </form>
        )}
      </div>
    </div>
  )
}