import { useNavigate } from 'react-router-dom'
import { ThemeToggle } from '../lib/theme'

// ============================================================
// Aadvik AI · Construction OS — landing (v3, Dayos-style)
// Heavy tight display type, alternating cream / ink bands,
// pill buttons, flat CSS-isometric cube accents, and a logo
// wall of the real construction ecosystem. Themes dark/light.
// ============================================================

const TRIWORDS = [
  { w: 'Site.', s: 'Everything from the field — vouchers, challans, DPRs, machinery — captured once.' },
  { w: 'Office.', s: 'The gap between site and head office, closed. Real-time, one source of truth.' },
  { w: 'Closed.', s: 'Bills verified and pushed to finance, contracts tracked, work orders issued.' },
]

const FEATURES = [
  { t: 'Capture', d: 'Expenses, store, labour and progress logged from the field the moment they happen.', colors: ['#B8EFC8', '#8Fe0a8', '#5cc47f'] },
  { t: 'Track', d: 'Live stock, cash balances, machine status and daily progress against BoQ.', colors: ['#CBB6F6', '#a98ff0', '#8a6be6'] },
  { t: 'Close', d: 'Vendor bills move submitted → verified → finance → paid, with a full audit trail.', colors: ['#ffcf8f', '#ff8f00', '#e07f00'] },
]

const ECOSYSTEM = ['NALCO', 'RITES', 'OMC Ltd.', 'SECR', 'CPWD', 'GST', 'RailTel', 'PWD']

const MODULES = [
  'Daily Expenses', 'Store IN / OUT', 'Machinery & Fuel', 'Labour & Wages',
  'Daily Progress · DPR', 'Purchase & Work Orders', 'Drawings & Revisions',
  'Vendor Bills → Finance', 'Reports & Exports', 'AI Site Brief',
]

export default function Landing() {
  const navigate = useNavigate()
  const go = () => navigate('/login')

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] antialiased overflow-x-hidden">
      {/* ---------- Nav ---------- */}
      <header className="sticky top-0 z-40 bg-[var(--bg)]/85 backdrop-blur-md border-b border-[var(--line)]">
        <div className="mx-auto max-w-[1200px] px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="w-[9px] h-[9px] bg-[var(--accent)] rounded-[2px]" />
            <span className="text-[15px] font-bold tracking-[0.16em] text-[var(--text)]">AADVIK</span>
          </div>
          <nav className="hidden md:flex items-center gap-8 text-[13px] text-[var(--text-2)]">
            <a href="#modules" className="hover:text-[var(--text)] transition-colors">Modules</a>
            <a href="#ecosystem" className="hover:text-[var(--text)] transition-colors">Ecosystem</a>
            <a href="#capabilities" className="hover:text-[var(--text)] transition-colors">Platform</a>
          </nav>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <button onClick={go} className="text-[13px] font-semibold text-[var(--text)] bg-[var(--text)]/0 hover:bg-[var(--card-2)] px-3 py-2 rounded-full transition-colors hidden sm:inline">Sign in</button>
            <button onClick={go} className="text-[13px] font-bold text-[var(--bg)] bg-[var(--text)] hover:opacity-90 px-5 py-2.5 rounded-full transition-opacity">Get started</button>
          </div>
        </div>
      </header>

      {/* ---------- Hero (band A) ---------- */}
      <section className="relative mx-auto max-w-[1200px] px-6 lg:px-8 pt-16 lg:pt-24 pb-20 lg:pb-28">
        <div className="grid lg:grid-cols-[1.15fr_0.85fr] gap-12 items-center">
          <div>
            <div className="inline-flex items-center gap-2 mb-8 px-3 py-1.5 rounded-full border border-[var(--line)] text-[11px] tracking-[0.16em] uppercase text-[var(--text-2)] font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" /> Construction Operations Platform
            </div>
            <h1 className="display text-[clamp(3rem,7vw,6rem)] text-[var(--text)]">
              Run the site,<br />not the<br />spreadsheet.
            </h1>
            <p className="mt-8 text-[16px] leading-relaxed text-[var(--text-2)] max-w-[34rem]">
              The site software your project deserves — expenses, store, machinery, labour, DPR,
              purchase and live cash-flow, in one login, real-time, with an AI site brief.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-3">
              <button onClick={go} className="inline-flex items-center gap-2 text-[14px] font-bold text-[var(--bg)] bg-[var(--text)] hover:opacity-90 px-7 py-3.5 rounded-full transition-opacity">
                Get started
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>arrow_forward</span>
              </button>
              <button onClick={go} className="inline-flex items-center text-[14px] font-semibold text-[var(--text)] border border-[var(--line)] hover:border-[var(--text-2)] px-7 py-3.5 rounded-full transition-colors">
                Sign in
              </button>
            </div>
          </div>
          {/* cube cluster */}
          <div className="relative h-[300px] lg:h-[380px] hidden sm:block">
            <div className="absolute left-[8%] top-[18%]"><Cube size={130} faces={['#ffcf8f', '#ff8f00', '#c96f00']} /></div>
            <div className="absolute right-[10%] top-0"><Cube size={92} faces={['#CBB6F6', '#a98ff0', '#7d5fd8']} /></div>
            <div className="absolute right-[22%] bottom-[6%]"><Cube size={110} faces={['#B8EFC8', '#7fe0a0', '#4fbf7a']} /></div>
            <div className="absolute left-[30%] bottom-0"><Cube size={70} faces={['#BFE0F5', '#8fc9ef', '#5aa9e0']} /></div>
          </div>
        </div>
      </section>

      {/* ---------- Tri-word band (INK) ---------- */}
      <section className="bg-[var(--ink)] text-[var(--ink-fg)]">
        <div className="mx-auto max-w-[1200px] px-6 lg:px-8 py-20 lg:py-28 grid md:grid-cols-3 gap-12 md:gap-8">
          {TRIWORDS.map(t => (
            <div key={t.w}>
              <h2 className="display text-[clamp(2.6rem,5vw,4rem)] text-[var(--ink-fg)] mb-4">{t.w}</h2>
              <p className="text-[14px] leading-relaxed text-[var(--ink-fg)]/60 max-w-[22rem]">{t.s}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- Statement + features (INK continues) ---------- */}
      <section className="bg-[var(--ink)] text-[var(--ink-fg)] border-t border-white/[0.06]">
        <div className="mx-auto max-w-[1200px] px-6 lg:px-8 py-20 lg:py-28">
          <h2 className="display text-[clamp(2rem,4.5vw,3.4rem)] text-[var(--ink-fg)] max-w-[20ch] mb-6">
            We're changing how sites get run.
          </h2>
          <p className="text-[15px] leading-relaxed text-[var(--ink-fg)]/60 max-w-[42rem] mb-16">
            You don't need another spreadsheet, another WhatsApp group, or paper vouchers piling up in a drawer.
            You need the site's real numbers — today, not at month-end.
          </p>

          <div className="grid md:grid-cols-3 gap-10 lg:gap-8">
            {FEATURES.map(f => (
              <div key={f.t}>
                <div className="mb-6"><Cube size={76} faces={f.colors} /></div>
                <h3 className="display text-[1.7rem] text-[var(--ink-fg)] mb-3">{f.t}</h3>
                <p className="text-[14px] leading-relaxed text-[var(--ink-fg)]/60 max-w-[24rem]">{f.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Ecosystem logo wall (band A) ---------- */}
      <section id="ecosystem" className="mx-auto max-w-[1200px] px-6 lg:px-8 py-20 lg:py-28">
        <h2 className="display text-[clamp(2rem,4.5vw,3.4rem)] text-[var(--text)] max-w-[16ch] mb-4">
          Built for how India builds.
        </h2>
        <p className="text-[15px] text-[var(--text-2)] max-w-[40rem] mb-12">
          Made for public-sector infrastructure work — the clients, consultants and compliance you already deal with.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {ECOSYSTEM.map(name => (
            <div key={name} className="h-20 rounded-2xl border border-[var(--line)] bg-[var(--card)] flex items-center justify-center">
              <span className="text-[16px] font-bold tracking-[0.08em] text-[var(--text)]/80">{name}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- Capabilities (INK) ---------- */}
      <section id="modules" className="bg-[var(--ink)] text-[var(--ink-fg)]">
        <div className="mx-auto max-w-[1200px] px-6 lg:px-8 py-20 lg:py-28">
          <div className="flex items-end justify-between flex-wrap gap-6 mb-14">
            <h2 className="display text-[clamp(2rem,4.5vw,3.4rem)] text-[var(--ink-fg)] max-w-[14ch]">
              Run a better site.
            </h2>
            <span className="font-mono text-[12px] tracking-[0.2em] uppercase text-[var(--ink-fg)]/40">10 modules · 1 login</span>
          </div>
          <div id="capabilities" className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {MODULES.map((m, i) => (
              <button key={m} onClick={go}
                className="group text-left rounded-2xl border border-white/[0.08] hover:border-white/[0.2] bg-white/[0.02] hover:bg-white/[0.04] p-6 transition-colors">
                <div className="flex items-start justify-between mb-8">
                  <span className="font-mono text-[12px] text-[var(--ink-fg)]/40 tabular-nums">{String(i + 1).padStart(2, '0')}</span>
                  <span className="material-symbols-outlined text-[var(--ink-fg)]/20 group-hover:text-[var(--accent)] transition-colors" style={{ fontSize: '18px' }}>arrow_outward</span>
                </div>
                <div className="text-[16px] font-semibold text-[var(--ink-fg)]">{m}</div>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- CTA + footer (band A) ---------- */}
      <footer className="mx-auto max-w-[1200px] px-6 lg:px-8 py-20 lg:py-28">
        <div className="grid md:grid-cols-2 gap-4 mb-16">
          <button onClick={go} className="group text-left rounded-3xl bg-[var(--text)] text-[var(--bg)] p-10 lg:p-12 flex items-start justify-between">
            <div>
              <div className="display text-[clamp(1.8rem,3vw,2.6rem)]">Get started</div>
              <p className="text-[14px] opacity-70 mt-3 max-w-[24rem] normal-case tracking-normal font-sans font-normal">Set up your company workspace and add your first project in minutes.</p>
            </div>
            <span className="material-symbols-outlined group-hover:translate-x-1 transition-transform" style={{ fontSize: '28px' }}>arrow_forward</span>
          </button>
          <button onClick={go} className="group text-left rounded-3xl border border-[var(--line)] hover:border-[var(--text-2)] p-10 lg:p-12 flex items-start justify-between transition-colors">
            <div>
              <div className="display text-[clamp(1.8rem,3vw,2.6rem)] text-[var(--text)]">Sign in</div>
              <p className="text-[14px] text-[var(--text-2)] mt-3 max-w-[24rem] normal-case tracking-normal font-normal">Already have an account? Jump straight to your site.</p>
            </div>
            <span className="material-symbols-outlined text-[var(--text-2)] group-hover:translate-x-1 transition-transform" style={{ fontSize: '28px' }}>arrow_outward</span>
          </button>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 pt-10 border-t border-[var(--line)]">
          <div className="flex items-center gap-2.5">
            <span className="w-[9px] h-[9px] bg-[var(--accent)] rounded-[2px]" />
            <span className="text-[14px] font-bold tracking-[0.16em] text-[var(--text)]">AADVIK</span>
            <span className="text-[11px] tracking-[0.2em] uppercase text-[var(--faint)] ml-1">Construction OS</span>
          </div>
          <div className="text-[12px] text-[var(--faint)]">© {new Date().getFullYear()} Aadvik AI. All rights reserved.</div>
        </div>
      </footer>
    </div>
  )
}

/* ---------- flat CSS-isometric cube (SVG) ---------- */
function Cube({ size = 100, faces }: { size?: number; faces: [string, string, string] | string[] }) {
  const [top, right, left] = faces
  return (
    <svg width={size} height={size * 1.16} viewBox="0 0 100 116" fill="none" xmlns="http://www.w3.org/2000/svg"
      style={{ filter: 'drop-shadow(0 12px 24px rgba(0,0,0,0.28))' }}>
      <polygon points="50,0 100,29 50,58 0,29" fill={top} />
      <polygon points="100,29 100,87 50,116 50,58" fill={right} />
      <polygon points="0,29 50,58 50,116 0,87" fill={left} />
    </svg>
  )
}