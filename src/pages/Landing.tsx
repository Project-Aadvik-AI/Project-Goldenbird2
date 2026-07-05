import { useNavigate } from 'react-router-dom'
import { ThemeToggle } from '../lib/theme'

// ============================================================
// Aadvik AI · Construction OS — landing (v2, themed)
// Architectural minimalism, now driven by CSS variables so it
// flips dark/light. One survey "datum line" as the signature.
// ============================================================

const MODULES: { n: string; name: string }[] = [
  { n: '01', name: 'Daily expenses & cash' },
  { n: '02', name: 'Store in / out ledger' },
  { n: '03', name: 'Machinery & fuel' },
  { n: '04', name: 'Labour & wages' },
  { n: '05', name: 'Daily progress · DPR' },
  { n: '06', name: 'Purchase & work orders' },
  { n: '07', name: 'Drawings & revisions' },
  { n: '08', name: 'Vendor bills to finance' },
  { n: '09', name: 'Reports & exports' },
  { n: '10', name: 'AI site brief' },
]

const SPEC: { k: string; v: string; accent?: boolean; dot?: boolean }[] = [
  { k: 'Client', v: 'RITES Ltd.' },
  { k: 'Owner', v: 'NALCO — Damanjodi' },
  { k: 'Location', v: 'Damanjodi, Odisha' },
  { k: 'Contract value', v: '₹33.55 Cr', accent: true },
  { k: 'Supervision', v: 'RITES' },
  { k: 'Status', v: 'Active', dot: true },
]

export default function Landing() {
  const navigate = useNavigate()
  const go = () => navigate('/login')

  return (
    <div className="relative min-h-screen bg-[var(--bg)] text-[var(--text)] overflow-x-hidden antialiased">
      <LandingStyles />
      <div className="grain" aria-hidden />

      {/* ---------- top bar ---------- */}
      <header className="relative z-20 border-b border-[var(--line)]">
        <div className="mx-auto max-w-[1180px] px-8 lg:px-12 h-[72px] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="w-[7px] h-[7px] bg-[var(--accent)] rounded-[1px] mt-[1px]" />
            <span className="text-[13px] font-semibold tracking-[0.28em] text-[var(--text)]">AADVIK</span>
            <span className="hidden sm:inline text-[10px] tracking-[0.28em] text-[var(--faint)] uppercase">Construction OS</span>
          </div>
          <nav className="flex items-center gap-5">
            <ThemeToggle />
            <button onClick={go} className="hidden sm:inline text-[13px] text-[var(--text-2)] hover:text-[var(--text)] transition-colors">
              Create account
            </button>
            <button onClick={go}
              className="group inline-flex items-center gap-2 text-[13px] font-medium text-[var(--text)]">
              Sign in
              <span className="w-6 h-px bg-[var(--text)] transition-all duration-300 group-hover:w-9" />
            </button>
          </nav>
        </div>
      </header>

      {/* ---------- hero ---------- */}
      <section className="relative z-10">
        <div className="mx-auto max-w-[1180px] px-8 lg:px-12">
          <div className="grid lg:grid-cols-[1fr_auto] gap-16 lg:gap-20 pt-24 lg:pt-32 pb-20">
            {/* left */}
            <div className="max-w-[36rem]">
              <div className="reveal flex items-center gap-3 mb-10" style={{ animationDelay: '0.05s' }}>
                <span className="w-6 h-px bg-[var(--accent)]" />
                <span className="text-[11px] tracking-[0.3em] uppercase text-[var(--text-2)] font-mono">
                  Construction Operations Platform
                </span>
              </div>

              <h1 className="reveal font-light text-[var(--text)] leading-[1.04] tracking-[-0.03em]
                             text-[clamp(2.7rem,5.2vw,4.4rem)]" style={{ animationDelay: '0.12s' }}>
                Run the site,<br />not the spreadsheet.
              </h1>

              <p className="reveal mt-8 text-[15px] leading-[1.7] text-[var(--text-2)] max-w-[30rem]" style={{ animationDelay: '0.2s' }}>
                Every voucher, challan, DPR and vendor bill from the field — captured once,
                visible in real time, and closed out on schedule.
              </p>

              <div className="reveal mt-11 flex items-center gap-8" style={{ animationDelay: '0.28s' }}>
                <button onClick={go}
                  className="group inline-flex items-center gap-3 bg-[var(--text)] text-[var(--bg)] text-[13px] font-semibold px-6 py-3.5 rounded-full hover:opacity-90 transition-colors">
                  Sign in to your site
                  <span className="material-symbols-outlined transition-transform duration-300 group-hover:translate-x-0.5" style={{ fontSize: '17px' }}>arrow_forward</span>
                </button>
                <button onClick={go} className="text-[13px] text-[var(--text-2)] hover:text-[var(--text)] transition-colors">
                  Create your company
                </button>
              </div>
            </div>

            {/* right — quiet project spec */}
            <div className="reveal w-full lg:w-[340px]" style={{ animationDelay: '0.36s' }}>
              <div className="flex items-baseline justify-between mb-6">
                <span className="text-[10px] tracking-[0.3em] uppercase text-[var(--faint)] font-mono">Live project</span>
                <span className="text-[10px] tracking-[0.2em] uppercase text-[var(--faint)] font-mono">01 / 10</span>
              </div>
              <h2 className="text-[19px] font-normal text-[var(--text)] leading-snug mb-6">
                Railway Siding Augmentation
              </h2>
              <dl className="border-t border-[var(--line)]">
                {SPEC.map(r => (
                  <div key={r.k} className="flex items-center justify-between py-3 border-b border-[var(--line)]">
                    <dt className="text-[11px] tracking-[0.14em] uppercase text-[var(--faint)] font-mono">{r.k}</dt>
                    <dd className={`text-[13px] flex items-center gap-2 ${r.accent ? 'text-[var(--accent)] font-mono' : 'text-[var(--text)]'}`}>
                      {r.dot && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/90" />}
                      {r.v}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </div>

        {/* the signature — a survey datum line */}
        <div className="relative mx-auto max-w-[1180px] px-8 lg:px-12">
          <div className="relative h-10">
            <div className="datum absolute left-8 right-8 lg:left-12 lg:right-12 top-1/2 h-px bg-[var(--line)]" />
            <div className="absolute left-8 lg:left-12 top-1/2 -translate-y-1/2 flex items-center gap-2">
              <span className="text-[var(--accent)] leading-none" style={{ fontSize: '9px' }}>▽</span>
              <span className="font-mono text-[10px] tracking-[0.2em] text-[var(--faint)]">DATUM · SYSTEMS OPERATIONAL</span>
            </div>
            <div className="absolute right-8 lg:right-12 top-1/2 -translate-y-1/2">
              <span className="font-mono text-[10px] tracking-[0.2em] text-[var(--faint)]">+00.000</span>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- index ---------- */}
      <section className="relative z-10 mt-24 lg:mt-32">
        <div className="mx-auto max-w-[1180px] px-8 lg:px-12">
          <div className="flex items-baseline justify-between mb-12">
            <h3 className="text-[13px] tracking-[0.3em] uppercase text-[var(--text-2)] font-mono">Index — everything the site runs on</h3>
            <span className="hidden sm:inline text-[11px] tracking-[0.2em] uppercase text-[var(--faint)] font-mono">One login</span>
          </div>
          <div className="grid sm:grid-cols-2 gap-x-16 border-t border-[var(--line)]">
            {MODULES.map(m => (
              <div key={m.n} className="group flex items-baseline gap-6 py-5 border-b border-[var(--line)]">
                <span className="font-mono text-[12px] text-[var(--faint)] tabular-nums w-6">{m.n}</span>
                <span className="text-[15px] text-[var(--text)]/90 group-hover:text-[var(--text)] transition-colors flex-1">{m.name}</span>
                <span className="material-symbols-outlined text-transparent group-hover:text-[var(--faint)] transition-colors" style={{ fontSize: '16px' }}>arrow_outward</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- project ---------- */}
      <section className="relative z-10 mt-24 lg:mt-32">
        <div className="mx-auto max-w-[1180px] px-8 lg:px-12">
          <h3 className="text-[13px] tracking-[0.3em] uppercase text-[var(--text-2)] font-mono mb-12">On site now</h3>
          <button onClick={go} className="group block w-full text-left">
            <div className="grid sm:grid-cols-[auto_1fr_auto] items-center gap-6 sm:gap-10 py-8 border-y border-[var(--line)] group-hover:border-[var(--text-2)] transition-colors">
              <span className="font-mono text-[11px] tracking-[0.2em] uppercase text-[var(--faint)]">NALCO-DMJ</span>
              <div>
                <div className="text-[22px] font-light text-[var(--text)] tracking-[-0.01em]">Railway Siding Augmentation</div>
                <div className="text-[13px] text-[var(--text-2)] mt-1">RITES · NALCO Damanjodi · Odisha</div>
              </div>
              <div className="flex items-center gap-8">
                <div className="text-right">
                  <div className="font-mono text-[17px] text-[var(--text)]">₹33.55 Cr</div>
                  <div className="text-[10px] tracking-[0.2em] uppercase text-[var(--faint)] font-mono mt-0.5">Contract value</div>
                </div>
                <span className="material-symbols-outlined text-[var(--faint)] group-hover:text-[var(--accent)] group-hover:translate-x-1 transition-all" style={{ fontSize: '22px' }}>arrow_forward</span>
              </div>
            </div>
          </button>
          <p className="mt-6 text-[13px] text-[var(--faint)]">Your other projects live here once you sign in.</p>
        </div>
      </section>

      {/* ---------- footer ---------- */}
      <footer className="relative z-10 mt-28 border-t border-[var(--line)]">
        <div className="mx-auto max-w-[1180px] px-8 lg:px-12 py-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <span className="w-[6px] h-[6px] bg-[var(--accent)] rounded-[1px]" />
            <span className="text-[12px] tracking-[0.28em] text-[var(--text-2)]">AADVIK</span>
            <span className="text-[10px] tracking-[0.2em] uppercase text-[var(--faint)]">Construction OS</span>
          </div>
          <div className="flex items-center gap-8">
            <span className="text-[12px] text-[var(--faint)]">© {new Date().getFullYear()} Aadvik AI</span>
            <button onClick={go} className="group inline-flex items-center gap-2 text-[12px] text-[var(--text-2)] hover:text-[var(--text)] transition-colors">
              Sign in
              <span className="w-5 h-px bg-current transition-all duration-300 group-hover:w-7" />
            </button>
          </div>
        </div>
      </footer>
    </div>
  )
}

function LandingStyles() {
  return (
    <style>{`
      .grain {
        position: fixed; inset: 0; z-index: 0; pointer-events: none; opacity: 0.035;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
      }
      .reveal { opacity: 0; animation: reveal 0.9s cubic-bezier(0.22,1,0.36,1) forwards; }
      @keyframes reveal { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
      .datum { transform-origin: left center; animation: draw 1.2s cubic-bezier(0.65,0,0.35,1) 0.5s both; }
      @keyframes draw { from { transform: scaleX(0); } to { transform: scaleX(1); } }
      @media (prefers-reduced-motion: reduce) {
        .reveal, .datum { animation: none; opacity: 1; transform: none; }
      }
    `}</style>
  )
}