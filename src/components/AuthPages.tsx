import { useState } from 'react'
import { useAuth } from '../lib/auth'

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
    <div className="flex min-h-screen bg-[#0c0e12]">
      {/* Left panel — desktop only */}
      <section className="relative hidden lg:flex flex-col justify-between w-[45%] h-screen overflow-hidden bg-[#0c0e12] border-r border-white/5 p-12">
        <div className="absolute inset-0 bg-gradient-to-tr from-[#0c0e12] via-[#0c0e12]/80 to-[#ff8f00]/10 pointer-events-none" />
        {/* Logo */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-12 h-12 rounded-lg bg-[#ff8f00] flex items-center justify-center flex-shrink-0">
            <span className="material-symbols-outlined text-[#0F1115] text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>precision_manufacturing</span>
          </div>
          <div>
            <div className="font-headline font-bold text-[#ffb87b] text-xl leading-tight">Aadvik AI</div>
            <div className="text-[10px] text-[#dcc1ae]/70 uppercase tracking-widest">Construction OS</div>
          </div>
        </div>
        {/* Hero */}
        <div className="relative z-10 max-w-md">
          <h1 className="font-headline text-4xl font-bold text-[#e2e2e8] leading-tight mb-4">
            Run your site,<br />
            <span className="text-[#ffb87b]">not your spreadsheets.</span>
          </h1>
          <p className="text-[#dcc1ae] text-sm leading-relaxed">
            Expenses, store, machinery, labour, DPR, purchase and live cash-flow — one login, real-time, with an AI site brief.
          </p>
        </div>
        {/* Stats */}
        <div className="relative z-10 grid grid-cols-2 gap-8">
          <div>
            <div className="font-mono text-[#ffb87b] text-lg font-bold mb-1">₹33.55 Cr</div>
            <div className="text-[10px] text-[#dcc1ae]/60 uppercase tracking-widest">Project Value</div>
          </div>
          <div>
            <div className="font-mono text-[#ffb87b] text-lg font-bold mb-1">NALCO</div>
            <div className="text-[10px] text-[#dcc1ae]/60 uppercase tracking-widest">Damanjodi · RITES</div>
          </div>
        </div>
      </section>

      {/* Right panel — form */}
      <main className="flex-1 flex flex-col justify-center items-center px-6 bg-[#0F1115]">
        <div className="w-full max-w-[420px]">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-lg bg-[#ff8f00] flex items-center justify-center">
              <span className="material-symbols-outlined text-[#0F1115]" style={{ fontVariationSettings: "'FILL' 1" }}>precision_manufacturing</span>
            </div>
            <div className="font-headline font-bold text-[#ffb87b] text-lg">Aadvik AI</div>
          </div>

          <header className="mb-6">
            <h2 className="font-headline text-2xl font-semibold text-[#e2e2e8] mb-1">
              {mode === 'in' ? 'Welcome Back' : signupMode === 'create' ? 'Create Account' : 'Join Company'}
            </h2>
            <p className="text-sm text-[#dcc1ae]">
              {mode === 'in'
                ? 'Enter your credentials to access the OS.'
                : signupMode === 'create'
                ? 'Start your company workspace.'
                : 'Enter your invite code to join your team.'}
            </p>
          </header>

          {mode === 'up' && (
            <div className="flex rounded-lg border border-white/10 overflow-hidden mb-6">
              <button type="button"
                className={`flex-1 px-3 py-2 text-[11px] font-bold uppercase tracking-wider ${signupMode === 'create' ? 'bg-[#ff8f00]/20 text-[#ffb87b]' : 'text-[#dcc1ae]'}`}
                onClick={() => { setSignupMode('create'); setMsg(null) }}>
                Create a company
              </button>
              <button type="button"
                className={`flex-1 px-3 py-2 text-[11px] font-bold uppercase tracking-wider ${signupMode === 'join' ? 'bg-[#ff8f00]/20 text-[#ffb87b]' : 'text-[#dcc1ae]'}`}
                onClick={() => { setSignupMode('join'); setMsg(null) }}>
                Join a company
              </button>
            </div>
          )}

          <form onSubmit={submit} className="space-y-4">
            {mode === 'up' && (
              <>
                <Field label="Your Name">
                  <input className="input" value={fullName} onChange={e => setFullName(e.target.value)} required />
                </Field>
                {signupMode === 'create' ? (
                  <Field label="Company / Firm">
                    <input className="input" value={orgName} onChange={e => setOrgName(e.target.value)} placeholder="Shanti Construction" required />
                  </Field>
                ) : (
                  <Field label="Invite Code">
                    <input className="input mono uppercase" value={inviteCode} onChange={e => setInviteCode(e.target.value.toUpperCase())} placeholder="ABC123" required />
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
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
                {msg}
              </div>
            )}

            <button className="btn btn-primary w-full" style={{ padding: '12px 16px', fontSize: '14px', marginTop: '8px' }} disabled={busy}>
              {busy ? 'Please wait…' : mode === 'in' ? 'Sign In' : 'Create Account'}
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>arrow_forward</span>
            </button>
          </form>

          <div className="text-sm text-[#dcc1ae] mt-6 text-center">
            {mode === 'in' ? 'New to Aadvik AI? ' : 'Already have an account? '}
            <button type="button" className="text-[#ffb87b] font-semibold hover:underline ml-1"
              onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setMsg(null) }}>
              {mode === 'in' ? 'Create account' : 'Sign in'}
            </button>
          </div>
        </div>

        {/* System status */}
        <div className="fixed bottom-6 flex items-center gap-2 px-3 py-1.5 bg-[#1a1c20] border border-white/5 rounded-full">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="text-[10px] text-[#dcc1ae]/60 font-semibold tracking-wider">SYSTEMS OPERATIONAL</span>
        </div>
      </main>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold text-[#dcc1ae] uppercase tracking-wider block mb-1">{label}</span>
      {children}
    </label>
  )
}