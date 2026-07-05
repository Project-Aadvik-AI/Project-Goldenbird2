import { useState } from 'react'
import { useAuth } from '../lib/auth'
import { ThemeToggle } from '../lib/theme'

// ============================================================
// Auth — themed to match the landing. Colors from CSS variables
// so it flips dark/light. Flowing contour background + toggle.
// ============================================================

export default function AuthPages() {
  const { signIn, signUp, signUpJoin } = useAuth()
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [signupMode, setSignupMode] = useState<'create' | 'join'>('create')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [orgName, setOrgName] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMsg(null)
    let res: { error?: string }
    if (mode === 'in') res = await signIn(email, password)
    else if (signupMode === 'create') res = await signUp(email, password, fullName, orgName)
    else res = await signUpJoin(email, password, fullName, inviteCode)
    setBusy(false)
    if (res.error) setMsg(res.error)
  }

  return (
    <div className="flow-bg flex min-h-screen bg-[var(--bg)] text-[var(--text)] antialiased">
      {/* ---------- Left — brand (desktop) ---------- */}
      <section className="relative hidden lg:flex flex-col justify-between w-[46%] border-r border-[var(--line)] px-14 py-12 z-10">
        <div className="flex items-center gap-3">
          <span className="w-[7px] h-[7px] bg-[var(--accent)] rounded-[1px] mt-[1px]" />
          <span className="text-[13px] font-semibold tracking-[0.28em]">AADVIK</span>
          <span className="text-[10px] tracking-[0.28em] text-[var(--faint)] uppercase">Construction OS</span>
        </div>

        <div className="max-w-[26rem]">
          <div className="flex items-center gap-3 mb-8">
            <span className="w-6 h-px bg-[var(--accent)]" />
            <span className="text-[11px] tracking-[0.3em] uppercase text-[var(--text-2)] font-mono">Construction Operations Platform</span>
          </div>
          <h1 className="font-light leading-[1.05] tracking-[-0.03em] text-[clamp(2.2rem,3vw,3rem)]">
            Run the site,<br />not the spreadsheet.
          </h1>
          <p className="mt-6 text-[14px] leading-[1.7] text-[var(--text-2)]">
            Every voucher, challan, DPR and vendor bill from the field — captured once,
            visible in real time, and closed out on schedule.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/90" />
          <span className="text-[10px] tracking-[0.2em] text-[var(--faint)] font-mono uppercase">Systems operational</span>
        </div>
      </section>

      {/* ---------- Right — form ---------- */}
      <main className="flex-1 flex flex-col justify-center items-center px-6 relative z-10">
        <div className="absolute top-6 right-6">
          <ThemeToggle />
        </div>
        <div className="w-full max-w-[400px]">
          {/* mobile brand */}
          <div className="lg:hidden flex items-center gap-3 mb-10">
            <span className="w-[7px] h-[7px] bg-[var(--accent)] rounded-[1px] mt-[1px]" />
            <span className="text-[13px] font-semibold tracking-[0.28em]">AADVIK</span>
            <span className="text-[10px] tracking-[0.28em] text-[var(--faint)] uppercase">Construction OS</span>
          </div>

          <header className="mb-8">
            <h2 className="text-[26px] font-light tracking-[-0.02em] mb-1.5">
              {mode === 'in' ? 'Welcome back' : signupMode === 'create' ? 'Create account' : 'Join company'}
            </h2>
            <p className="text-[13px] text-[var(--text-2)]">
              {mode === 'in'
                ? 'Enter your credentials to access the OS.'
                : signupMode === 'create'
                ? 'Start your company workspace.'
                : 'Enter your invite code to join your team.'}
            </p>
          </header>

          {mode === 'up' && (
            <div className="flex gap-1 p-1 rounded-lg border border-[var(--line)] mb-6">
              <button type="button"
                className={`flex-1 px-3 py-2 rounded-md text-[11px] font-semibold uppercase tracking-[0.12em] transition-colors ${signupMode === 'create' ? 'bg-[var(--card-2)] text-[var(--text)]' : 'text-[var(--faint)] hover:text-[var(--text-2)]'}`}
                onClick={() => { setSignupMode('create'); setMsg(null) }}>
                Create a company
              </button>
              <button type="button"
                className={`flex-1 px-3 py-2 rounded-md text-[11px] font-semibold uppercase tracking-[0.12em] transition-colors ${signupMode === 'join' ? 'bg-[var(--card-2)] text-[var(--text)]' : 'text-[var(--faint)] hover:text-[var(--text-2)]'}`}
                onClick={() => { setSignupMode('join'); setMsg(null) }}>
                Join a company
              </button>
            </div>
          )}

          <form onSubmit={submit} className="space-y-4">
            {mode === 'up' && (
              <>
                <Field label="Your name">
                  <input className="input" value={fullName} onChange={e => setFullName(e.target.value)} required />
                </Field>
                {signupMode === 'create' ? (
                  <Field label="Company / firm">
                    <input className="input" value={orgName} onChange={e => setOrgName(e.target.value)} placeholder="Shanti Construction" required />
                  </Field>
                ) : (
                  <Field label="Invite code">
                    <input className="input mono uppercase" value={inviteCode} onChange={e => setInviteCode(e.target.value.toUpperCase())} placeholder="ABC12345" required />
                  </Field>
                )}
              </>
            )}
            <Field label="Email">
              <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
            </Field>
            <Field label="Password">
              <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} minLength={6} required />
            </Field>

            {msg && (
              <div className="p-3 rounded-lg bg-red-500/[0.08] border border-red-500/20 text-[13px] text-red-400">
                {msg}
              </div>
            )}

            <button className="btn btn-primary w-full" style={{ padding: '13px 16px', fontSize: '14px', marginTop: '10px', borderRadius: '9999px' }} disabled={busy}>
              {busy ? 'Please wait…' : mode === 'in' ? 'Sign in' : 'Create account'}
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>arrow_forward</span>
            </button>
          </form>

          <div className="text-[13px] text-[var(--text-2)] mt-7 text-center">
            {mode === 'in' ? 'New to Aadvik AI? ' : 'Already have an account? '}
            <button type="button" className="text-[var(--text)] font-semibold hover:underline ml-1"
              onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setMsg(null) }}>
              {mode === 'in' ? 'Create account' : 'Sign in'}
            </button>
          </div>
        </div>

        {/* status (mobile / small screens) */}
        <div className="absolute bottom-8 flex items-center gap-2 lg:hidden">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/90" />
          <span className="text-[10px] tracking-[0.2em] text-[var(--faint)] font-mono uppercase">Systems operational</span>
        </div>
      </main>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] font-mono tracking-[0.16em] text-[var(--faint)] uppercase block mb-2">{label}</span>
      {children}
    </label>
  )
}