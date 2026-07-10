import { useState } from 'react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { ThemeToggle } from '../lib/theme'

// ============================================================
// Auth — matched to the landing's architectural-minimal look.
// Near-black, hairlines, light-weight type, one orange mark,
// off-white pill primary. Left: quiet brand + live project.
// Right: the form.
// ============================================================

export default function AuthPages() {
  const { signIn, signUp, signUpJoin, sendPasswordReset } = useAuth()
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [signupMode, setSignupMode] = useState<'create' | 'join'>('create')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [orgName, setOrgName] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function forgotPassword() {
    if (!email.trim()) { setMsg('Enter your email above first, then click "Forgot password".'); return }
    setBusy(true); setMsg(null)
    const { error } = await sendPasswordReset(email.trim())
    setBusy(false)
    setMsg(error ? error : 'Password reset link sent — check your email.')
  }

  async function resolveLoginEmail(input: string): Promise<string> {
    const v = input.trim()
    if (v.includes('@')) return v  // already an email
    // looks like an Employee ID → look up its login email
    try {
      const { data, error } = await supabase.rpc('login_email_for_code', { p_code: v })
      if (!error && data) return data as string
    } catch { /* ignore, fall through */ }
    return v  // fall back to what they typed
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMsg(null)
    let res: { error?: string }
    if (mode === 'in') {
      const loginEmail = await resolveLoginEmail(email)
      res = await signIn(loginEmail, password)
    }
    else if (signupMode === 'create') res = await signUp(email, password, fullName, orgName)
    else res = await signUpJoin(email, password, fullName, inviteCode)
    setBusy(false)
    if (res.error) setMsg(res.error)
  }

  return (
    <div className="flex min-h-screen bg-[var(--bg)] text-[var(--text)] antialiased">
      {/* ---------- Left — brand + live project (desktop) ---------- */}
      <section className="relative hidden lg:flex flex-col justify-between w-[46%] border-r border-[var(--line)] px-14 py-12">
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

        <div>
          <div className="flex items-baseline justify-between mb-4">
            <span className="text-[10px] tracking-[0.3em] uppercase text-[var(--faint)] font-mono">Live project</span>
            <span className="text-[10px] tracking-[0.2em] uppercase text-[var(--faint)] font-mono">01 / 10</span>
          </div>
          <div className="text-[15px] mb-4">Railway Siding Augmentation</div>
          <div className="grid grid-cols-3 gap-6 border-t border-[var(--line)] pt-4">
            <Stat k="Contract" v="₹33.55 Cr" accent />
            <Stat k="Owner" v="NALCO" />
            <Stat k="Supervision" v="RITES" />
          </div>
        </div>
      </section>

      {/* ---------- Right — form ---------- */}
      <main className="flex-1 flex flex-col justify-center items-center px-6 relative">
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
            <Field label={mode === 'in' ? 'Employee ID or Email' : 'Email'}>
              <input className="input" type={mode === 'in' ? 'text' : 'email'} value={email} onChange={e => setEmail(e.target.value)} placeholder={mode === 'in' ? 'e.g. AS260001 or you@email.com' : ''} required />
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
            {mode === 'in' && (
              <button type="button" onClick={forgotPassword} className="text-[12px] text-[var(--text-2)] hover:text-[var(--text)] hover:underline w-full text-center mt-1">
                Forgot password?
              </button>
            )}
          </form>

          <div className="text-[13px] text-[var(--text-2)] mt-7 text-center">
            {mode === 'in' ? 'New to Aadvik AI? ' : 'Already have an account? '}
            <button type="button" className="text-[var(--text)] font-semibold hover:underline ml-1"
              onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setMsg(null) }}>
              {mode === 'in' ? 'Create account' : 'Sign in'}
            </button>
          </div>
        </div>

        {/* status */}
        <div className="absolute bottom-8 flex items-center gap-2">
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

function Stat({ k, v, accent }: { k: string; v: string; accent?: boolean }) {
  return (
    <div>
      <div className={`text-[15px] ${accent ? 'text-[var(--accent)] font-mono' : 'text-[var(--text)]'}`}>{v}</div>
      <div className="text-[9px] tracking-[0.2em] uppercase text-[var(--faint)] font-mono mt-1">{k}</div>
    </div>
  )
}