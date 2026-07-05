import { useNavigate } from 'react-router-dom'
import { ThemeToggle } from '../lib/theme'
import { useState } from 'react'

// ============================================================
// AADVIK — corporate landing (single rich scrolling page).
// Sections: home, about, projects, growth, leadership, contact.
// ============================================================

const NAV = [
  { label: 'Home', to: '#home' },
  { label: 'About Us', to: '#about' },
  { label: 'Projects', to: '#projects' },
  { label: 'Growth', to: '#growth' },
  { label: 'Leadership', to: '#leadership' },
  { label: 'Contact', to: '#contact' },
]

const STATS = [
  { icon: 'payments', value: '₹500 Cr+', label: 'Works Executed' },
  { icon: 'architecture', value: '120+', label: 'Projects Delivered' },
  { icon: 'public', value: '8', label: 'States Reached' },
  { icon: 'groups', value: '1,200+', label: 'Workforce On-Site' },
]

const CHART = [
  { year: '2018', works: 45, projects: 8 },
  { year: '2019', works: 62, projects: 12 },
  { year: '2020', works: 70, projects: 15 },
  { year: '2021', works: 95, projects: 22 },
  { year: '2022', works: 118, projects: 28 },
  { year: '2023', works: 140, projects: 35 },
]
const WORKS_MAX = 140
const PROJ_MAX = 35

const YOY = [
  { region: 'Eastern India', pct: 42 },
  { region: 'Western India', pct: 28 },
  { region: 'Southern India', pct: 15 },
]

const TIMELINE = [
  { year: '2009', title: 'Founding & First Pillar', body: 'AADVIK was founded by field engineers with a single commitment: precision. We secured our first municipal contract in residential infrastructure.' },
  { year: '2015', title: 'Industrial Expansion', body: 'Diversifying into heavy industrial sectors, AADVIK adopted prefabricated concrete modules, cutting project timelines significantly.' },
  { year: '2021', title: 'Modern Site Operations', body: 'We digitised on-site operations — expenses, store, machinery, labour and daily progress — moving to real-time reporting across projects.' },
  { year: '2024', title: 'The NALCO Milestone', body: 'AADVIK secured the ₹33.55 Cr NALCO Damanjodi railway-siding project under RITES — our largest infrastructure package to date.' },
]

export default function Landing() {
  const navigate = useNavigate()
  const login = () => navigate('/login')
  const [menu, setMenu] = useState(false)

  return (
    <div className="page-lines min-h-screen bg-[var(--bg)] text-[var(--text)] antialiased overflow-x-hidden">
      <style>{`html{scroll-behavior:smooth}`}</style>

      {/* ---------- Nav ---------- */}
      <header className="sticky top-0 z-40 bg-[var(--bg)]/85 backdrop-blur-md border-b border-[var(--line)]">
        <div className="mx-auto max-w-[1200px] px-6 lg:px-8 h-16 flex items-center justify-between">
          <a href="#home" className="flex items-center gap-2.5">
            <span className="w-[9px] h-[9px] bg-[var(--accent)] rounded-[2px]" />
            <span className="text-[15px] font-bold tracking-[0.16em] text-[var(--text)]">AADVIK</span>
          </a>
          <nav className="hidden lg:flex items-center gap-7 text-[13px] text-[var(--text-2)]">
            {NAV.map(n => <a key={n.to} href={n.to} className="hover:text-[var(--text)] transition-colors">{n.label}</a>)}
          </nav>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <a href="#contact" className="hidden sm:inline text-[13px] font-semibold text-[var(--text)] hover:bg-[var(--card-2)] px-3 py-2 rounded-full transition-colors">Get a Quote</a>
            <button onClick={login} className="text-[13px] font-bold text-[var(--bg)] bg-[var(--text)] hover:opacity-90 px-5 py-2.5 rounded-full transition-opacity">Employee Login</button>
            <button className="lg:hidden text-[var(--text)]" onClick={() => setMenu(v => !v)}>
              <span className="material-symbols-outlined">{menu ? 'close' : 'menu'}</span>
            </button>
          </div>
        </div>
        {menu && (
          <div className="lg:hidden border-t border-[var(--line)] px-6 py-4 flex flex-col gap-3 bg-[var(--bg)]">
            {NAV.map(n => <a key={n.to} href={n.to} onClick={() => setMenu(false)} className="text-[14px] text-[var(--text-2)] hover:text-[var(--text)]">{n.label}</a>)}
          </div>
        )}
      </header>

      {/* ---------- Hero (home) ---------- */}
      <section id="home" className="relative mx-auto max-w-[1200px] px-6 lg:px-8 pt-16 lg:pt-24 pb-20 lg:pb-28 scroll-mt-20">
        <div className="grid lg:grid-cols-[1.15fr_0.85fr] gap-12 items-center">
          <div>
            <div className="inline-flex items-center gap-2 mb-8 px-3 py-1.5 rounded-full border border-[var(--line)] text-[11px] tracking-[0.16em] uppercase text-[var(--text-2)] font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" /> Strategic Expansion
            </div>
            <h1 className="display text-[clamp(2.6rem,6.5vw,5.4rem)] text-[var(--text)]">
              Building the future,<br />at scale.
            </h1>
            <p className="mt-8 text-[16px] leading-relaxed text-[var(--text-2)] max-w-[36rem]">
              Since inception, AADVIK has maintained a steady, sustainable growth trajectory — expanding our
              operational capacity through engineering precision and strategic partnerships.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-3">
              <a href="#contact" className="inline-flex items-center gap-2 text-[14px] font-bold text-[var(--bg)] bg-[var(--text)] hover:opacity-90 px-7 py-3.5 rounded-full transition-opacity">
                Get a Quote
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>arrow_forward</span>
              </a>
              <a href="#projects" className="inline-flex items-center text-[14px] font-semibold text-[var(--text)] border border-[var(--line)] hover:border-[var(--text-2)] px-7 py-3.5 rounded-full transition-colors">
                View Projects
              </a>
            </div>
          </div>
          <div className="relative h-[300px] lg:h-[380px] hidden sm:block">
            <div className="absolute left-[8%] top-[18%]"><Cube size={130} faces={['#ffcf8f', '#ff8f00', '#c96f00']} /></div>
            <div className="absolute right-[10%] top-0"><Cube size={92} faces={['#CBB6F6', '#a98ff0', '#7d5fd8']} /></div>
            <div className="absolute right-[22%] bottom-[6%]"><Cube size={110} faces={['#B8EFC8', '#7fe0a0', '#4fbf7a']} /></div>
            <div className="absolute left-[30%] bottom-0"><Cube size={70} faces={['#BFE0F5', '#8fc9ef', '#5aa9e0']} /></div>
          </div>
        </div>
      </section>

      {/* ---------- Stats band (growth) ---------- */}
      <section id="growth" className="bg-[var(--ink)] text-[var(--ink-fg)] scroll-mt-16">
        <div className="mx-auto max-w-[1200px] px-6 lg:px-8 py-16 lg:py-20 grid grid-cols-2 lg:grid-cols-4 gap-10">
          {STATS.map(s => (
            <div key={s.label}>
              <span className="material-symbols-outlined text-[var(--accent)] mb-3" style={{ fontSize: '26px' }}>{s.icon}</span>
              <div className="display text-[clamp(1.8rem,3.5vw,2.8rem)] text-[var(--ink-fg)]">{s.value}</div>
              <div className="text-[12px] tracking-[0.16em] uppercase text-[var(--ink-fg)]/50 mt-1 font-mono">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- Performance chart ---------- */}
      <section className="bg-[var(--ink)] text-[var(--ink-fg)] border-t border-white/[0.06]">
        <div className="mx-auto max-w-[1200px] px-6 lg:px-8 py-16 lg:py-24">
          <div className="mb-2 text-[11px] tracking-[0.3em] uppercase text-[var(--accent)] font-mono">Performance Velocity</div>
          <h2 className="display text-[clamp(1.8rem,4vw,3rem)] text-[var(--ink-fg)] max-w-[18ch] mb-3">Aggregate works & project count</h2>
          <p className="text-[14px] text-[var(--ink-fg)]/50 mb-10">2018 – 2023</p>

          <div className="flex items-center gap-6 mb-6 text-[12px] font-mono uppercase tracking-wider text-[var(--ink-fg)]/60">
            <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-[2px] bg-[var(--accent)]" /> Works (₹Cr)</span>
            <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-[2px] bg-[#7f6bff]" /> Projects</span>
          </div>

          <div className="grid grid-cols-6 gap-3 sm:gap-6 items-end h-[240px] border-b border-white/[0.1] pb-0">
            {CHART.map(d => (
              <div key={d.year} className="flex items-end justify-center gap-1.5 sm:gap-2 h-full">
                <div className="relative flex-1 max-w-[26px] bg-[var(--accent)] rounded-t-[3px] transition-all"
                  style={{ height: `${(d.works / WORKS_MAX) * 100}%` }} title={`Works ₹${d.works} Cr`}>
                  <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] font-mono text-[var(--ink-fg)]/50 whitespace-nowrap">{d.works}</span>
                </div>
                <div className="relative flex-1 max-w-[26px] bg-[#7f6bff] rounded-t-[3px] transition-all"
                  style={{ height: `${(d.projects / PROJ_MAX) * 100}%` }} title={`${d.projects} projects`}>
                  <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] font-mono text-[var(--ink-fg)]/50">{d.projects}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-6 gap-3 sm:gap-6 mt-3">
            {CHART.map(d => <div key={d.year} className="text-center text-[11px] font-mono text-[var(--ink-fg)]/50">{d.year}</div>)}
          </div>

          <div className="mt-16 grid lg:grid-cols-[0.9fr_1.1fr] gap-10 items-center">
            <div>
              <div className="text-[11px] tracking-[0.3em] uppercase text-[var(--accent)] font-mono mb-2">Growth Metric</div>
              <h3 className="display text-[clamp(1.5rem,3vw,2.2rem)] text-[var(--ink-fg)]">Year-on-year expansion</h3>
            </div>
            <div className="space-y-5">
              {YOY.map(y => (
                <div key={y.region}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[14px] text-[var(--ink-fg)]/80">{y.region}</span>
                    <span className="font-mono text-[14px] text-[var(--accent)]">+{y.pct}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-white/[0.08] overflow-hidden">
                    <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${(y.pct / 42) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-12">
            <a href="#contact" className="inline-flex items-center gap-2 text-[14px] font-bold text-[var(--bg)] bg-[var(--ink-fg)] hover:opacity-90 px-7 py-3.5 rounded-full transition-opacity">
              Partner With Us
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>arrow_forward</span>
            </a>
          </div>
        </div>
      </section>

      {/* ---------- Timeline (about) ---------- */}
      <section id="about" className="mx-auto max-w-[1200px] px-6 lg:px-8 py-16 lg:py-24 scroll-mt-16">
        <div className="text-[11px] tracking-[0.3em] uppercase text-[var(--accent)] font-mono mb-2">Decades of Momentum</div>
        <h2 className="display text-[clamp(1.8rem,4vw,3rem)] text-[var(--text)] max-w-[20ch] mb-4">From a local firm to an infrastructure powerhouse</h2>
        <p className="text-[15px] text-[var(--text-2)] max-w-[42rem] mb-14">Tracing our path across fifteen years of disciplined, engineering-led growth.</p>

        <div className="grid md:grid-cols-2 gap-x-12 gap-y-10">
          {TIMELINE.map((t, i) => (
            <div key={t.year} className="flex gap-6">
              <div className="flex flex-col items-center">
                <div className="display text-[1.6rem] text-[var(--accent)] leading-none">{t.year}</div>
                {i < TIMELINE.length - 1 && <div className="w-px flex-1 bg-[var(--line)] mt-3" />}
              </div>
              <div className="pb-2">
                <h3 className="text-[18px] font-semibold text-[var(--text)] mb-2">{t.title}</h3>
                <p className="text-[14px] leading-relaxed text-[var(--text-2)] max-w-[26rem]">{t.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- Projects ---------- */}
      <section id="projects" className="bg-[var(--ink)] text-[var(--ink-fg)] scroll-mt-16">
        <div className="mx-auto max-w-[1200px] px-6 lg:px-8 py-16 lg:py-24">
          <div className="text-[11px] tracking-[0.3em] uppercase text-[var(--accent)] font-mono mb-2">Flagship Project</div>
          <h2 className="display text-[clamp(1.8rem,4vw,3rem)] text-[var(--ink-fg)] mb-12">On site now</h2>
          <div className="grid sm:grid-cols-[auto_1fr_auto] items-center gap-6 sm:gap-10 py-8 border-y border-white/[0.1]">
            <span className="font-mono text-[11px] tracking-[0.2em] uppercase text-[var(--ink-fg)]/50">NALCO-DMJ</span>
            <div>
              <div className="text-[22px] font-light text-[var(--ink-fg)]">Railway Siding Augmentation</div>
              <div className="text-[13px] text-[var(--ink-fg)]/60 mt-1">RITES · NALCO Damanjodi · Odisha</div>
            </div>
            <div className="text-right">
              <div className="font-mono text-[18px] text-[var(--accent)]">₹33.55 Cr</div>
              <div className="text-[10px] tracking-[0.2em] uppercase text-[var(--ink-fg)]/50 font-mono mt-0.5">Contract value</div>
            </div>
          </div>
          <p className="mt-6 text-[13px] text-[var(--ink-fg)]/50">120+ projects delivered across 8 states — from municipal infrastructure to heavy industrial sidings.</p>
        </div>
      </section>

      {/* ---------- Leadership ---------- */}
      <section id="leadership" className="mx-auto max-w-[1200px] px-6 lg:px-8 py-16 lg:py-24 scroll-mt-16">
        <div className="grid lg:grid-cols-[1fr_1fr] gap-12 items-center">
          <div>
            <div className="text-[11px] tracking-[0.3em] uppercase text-[var(--accent)] font-mono mb-2">Leadership</div>
            <h2 className="display text-[clamp(1.8rem,4vw,3rem)] text-[var(--text)] max-w-[16ch] mb-6">Led by field engineers</h2>
            <p className="text-[15px] leading-relaxed text-[var(--text-2)] max-w-[36rem]">
              AADVIK was built by people who have stood on-site in the monsoon and signed off on the last pour of the day.
              That engineering-first discipline runs through every contract we take — precision over promises,
              schedule over spectacle.
            </p>
          </div>
          <div className="relative h-[260px] hidden lg:block">
            <div className="absolute left-[14%] top-[10%]"><Cube size={120} faces={['#ffcf8f', '#ff8f00', '#c96f00']} /></div>
            <div className="absolute right-[16%] bottom-[6%]"><Cube size={100} faces={['#B8EFC8', '#7fe0a0', '#4fbf7a']} /></div>
          </div>
        </div>
      </section>

      {/* ---------- Contact / CTA ---------- */}
      <section id="contact" className="bg-[var(--ink)] text-[var(--ink-fg)] scroll-mt-16">
        <div className="mx-auto max-w-[1200px] px-6 lg:px-8 py-20 lg:py-28 text-center">
          <div className="text-[11px] tracking-[0.3em] uppercase text-[var(--accent)] font-mono mb-4">Invest in Excellence</div>
          <h2 className="display text-[clamp(2rem,5vw,4rem)] text-[var(--ink-fg)] max-w-[16ch] mx-auto mb-6">Build with AADVIK.</h2>
          <p className="text-[15px] text-[var(--ink-fg)]/60 max-w-[38rem] mx-auto mb-10">
            Our growth is your opportunity for unparalleled infrastructure reliability.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <a href="mailto:contact@aadvik.example" className="inline-flex items-center gap-2 text-[14px] font-bold text-[var(--bg)] bg-[var(--ink-fg)] hover:opacity-90 px-8 py-4 rounded-full transition-opacity">
              Partner With Us
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>arrow_forward</span>
            </a>
            <button onClick={login} className="inline-flex items-center gap-2 text-[14px] font-semibold text-[var(--ink-fg)] border border-white/[0.2] hover:border-white/[0.4] px-8 py-4 rounded-full transition-colors">
              Employee Login
            </button>
          </div>
        </div>
      </section>

      {/* ---------- Footer ---------- */}
      <footer className="mx-auto max-w-[1200px] px-6 lg:px-8 py-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <div className="flex items-center gap-2.5">
          <span className="w-[9px] h-[9px] bg-[var(--accent)] rounded-[2px]" />
          <span className="text-[14px] font-bold tracking-[0.16em] text-[var(--text)]">AADVIK</span>
          <span className="text-[11px] tracking-[0.2em] uppercase text-[var(--faint)] ml-1">Construction OS</span>
        </div>
        <div className="text-[12px] text-[var(--faint)]">© {new Date().getFullYear()} Aadvik AI. All rights reserved.</div>
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