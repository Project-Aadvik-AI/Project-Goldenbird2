import { Link } from 'react-router-dom'
import SiteChrome from './SiteChrome'
import { IMAGES } from '../../lib/images'
import { useEffect, useRef, useState } from 'react'

// ---- reveal-on-scroll hook ----
function useInView<T extends HTMLElement>(once = true) {
  const ref = useRef<T | null>(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setInView(true); if (once) obs.disconnect() }
      else if (!once) setInView(false)
    }, { threshold: 0.25 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [once])
  return { ref, inView }
}

// ---- count-up number ----
function CountUp({ target, prefix = '', suffix = '', decimals = 0, run }: { target: number; prefix?: string; suffix?: string; decimals?: number; run: boolean }) {
  const [val, setVal] = useState(0)
  useEffect(() => {
    if (!run) return
    let raf = 0
    const dur = 1400, t0 = performance.now()
    const tick = (t: number) => {
      const p = Math.min((t - t0) / dur, 1)
      const eased = 1 - Math.pow(1 - p, 3)
      setVal(target * eased)
      if (p < 1) raf = requestAnimationFrame(tick)
      else setVal(target)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [run, target])
  const shown = decimals > 0 ? val.toFixed(decimals) : Math.round(val).toLocaleString('en-IN')
  return <span>{prefix}{shown}{suffix}</span>
}

const STATS = [
  { icon: 'payments', target: 500, prefix: '₹', suffix: ' Cr+', label: 'Works Executed' },
  { icon: 'architecture', target: 120, suffix: '+', label: 'Projects Delivered' },
  { icon: 'public', target: 8, suffix: '', label: 'States Reached' },
  { icon: 'groups', target: 1200, suffix: '+', label: 'Workforce On-Site' },
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
  { year: '2009', title: 'Founding & First Pillar', body: 'AADVIK was founded by field engineers with a single commitment: precision. We secured our first municipal contract in residential infrastructure.', img: IMAGES.tl2009 },
  { year: '2015', title: 'Industrial Expansion', body: 'Diversifying into heavy industrial sectors, AADVIK adopted prefabricated concrete modules, cutting project timelines significantly.', img: IMAGES.tl2015 },
  { year: '2021', title: 'Modern Site Operations', body: 'We digitised on-site operations — expenses, store, machinery, labour and daily progress — moving to real-time reporting across projects.', img: IMAGES.tl2021 },
  { year: '2024', title: 'The NALCO Milestone', body: 'AADVIK secured the ₹33.55 Cr NALCO Damanjodi railway-siding project under RITES — our largest infrastructure package to date.', img: IMAGES.tl2024 },
]

export default function Growth() {
  const stats = useInView<HTMLDivElement>()
  const chart = useInView<HTMLDivElement>()
  const yoy = useInView<HTMLDivElement>()

  return (
    <SiteChrome>
      {/* Hero */}
      <section className="mx-auto max-w-[1200px] px-6 lg:px-8 pt-16 lg:pt-24 pb-12">
        <div className="text-[11px] tracking-[0.3em] uppercase text-[var(--accent)] font-mono mb-4">Strategic Expansion</div>
        <h1 className="display text-[clamp(2.4rem,6vw,5rem)] text-[var(--text)] max-w-[16ch] mb-6">Building the future, at scale.</h1>
        <p className="text-[16px] leading-relaxed text-[var(--text-2)] max-w-[44rem] mb-10">
          Since inception, AADVIK has maintained a steady, sustainable growth trajectory — expanding our operational
          capacity through engineering precision and strategic partnerships.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Link to="/contact" className="inline-flex items-center gap-2 text-[14px] font-bold text-[var(--bg)] bg-[var(--text)] hover:opacity-90 px-7 py-3.5 rounded-full transition-opacity">
            Get a Quote <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>arrow_forward</span>
          </Link>
          <Link to="/projects" className="inline-flex items-center text-[14px] font-semibold text-[var(--text)] border border-[var(--line)] hover:border-[var(--text-2)] px-7 py-3.5 rounded-full transition-colors">
            View Projects
          </Link>
        </div>
      </section>

      {/* Stats (count-up) */}
      <section className="bg-[var(--ink)] text-[var(--ink-fg)]">
        <div ref={stats.ref} className="mx-auto max-w-[1200px] px-6 lg:px-8 py-14 grid grid-cols-2 lg:grid-cols-4 gap-10">
          {STATS.map(s => (
            <div key={s.label}>
              <span className="material-symbols-outlined text-[var(--accent)] mb-3" style={{ fontSize: '26px' }}>{s.icon}</span>
              <div className="display text-[clamp(1.8rem,3.5vw,2.8rem)] text-[var(--ink-fg)]">
                <CountUp target={s.target} prefix={s.prefix} suffix={s.suffix} run={stats.inView} />
              </div>
              <div className="text-[12px] tracking-[0.16em] uppercase text-[var(--ink-fg)]/50 mt-1 font-mono">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Performance chart */}
      <section className="bg-[var(--ink)] text-[var(--ink-fg)] border-t border-white/[0.06]">
        <div className="mx-auto max-w-[1200px] px-6 lg:px-8 py-16 lg:py-24">
          <div className="mb-2 text-[11px] tracking-[0.3em] uppercase text-[var(--accent)] font-mono">Performance Velocity</div>
          <h2 className="display text-[clamp(1.8rem,4vw,3rem)] text-[var(--ink-fg)] max-w-[18ch] mb-3">Aggregate works & project count</h2>
          <p className="text-[14px] text-[var(--ink-fg)]/50 mb-10">2018 – 2023</p>

          <div className="flex items-center gap-6 mb-6 text-[12px] font-mono uppercase tracking-wider text-[var(--ink-fg)]/60">
            <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-[2px] bg-[var(--accent)]" /> Works (₹Cr)</span>
            <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-[2px] bg-[#7f6bff]" /> Projects</span>
          </div>

          <div ref={chart.ref} className="grid grid-cols-6 gap-3 sm:gap-6 items-end h-[240px] border-b border-white/[0.1]">
            {CHART.map((d, i) => (
              <div key={d.year} className="flex items-end justify-center gap-1.5 sm:gap-2 h-full">
                <div className="relative flex-1 max-w-[26px] bg-[var(--accent)] rounded-t-[3px]"
                  style={{ height: chart.inView ? `${(d.works / WORKS_MAX) * 100}%` : '0%', transition: `height 900ms cubic-bezier(0.22,1,0.36,1) ${i * 90}ms` }}
                  title={`Works ₹${d.works} Cr`}>
                  <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] font-mono text-[var(--ink-fg)]/50 whitespace-nowrap" style={{ opacity: chart.inView ? 1 : 0, transition: `opacity 400ms ${600 + i * 90}ms` }}>{d.works}</span>
                </div>
                <div className="relative flex-1 max-w-[26px] bg-[#7f6bff] rounded-t-[3px]"
                  style={{ height: chart.inView ? `${(d.projects / PROJ_MAX) * 100}%` : '0%', transition: `height 900ms cubic-bezier(0.22,1,0.36,1) ${i * 90 + 45}ms` }}
                  title={`${d.projects} projects`}>
                  <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] font-mono text-[var(--ink-fg)]/50" style={{ opacity: chart.inView ? 1 : 0, transition: `opacity 400ms ${600 + i * 90}ms` }}>{d.projects}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-6 gap-3 sm:gap-6 mt-3">
            {CHART.map(d => <div key={d.year} className="text-center text-[11px] font-mono text-[var(--ink-fg)]/50">{d.year}</div>)}
          </div>

          {/* YoY */}
          <div ref={yoy.ref} className="mt-16 grid lg:grid-cols-[0.9fr_1.1fr] gap-10 items-center">
            <div>
              <div className="text-[11px] tracking-[0.3em] uppercase text-[var(--accent)] font-mono mb-2">Growth Metric</div>
              <h3 className="display text-[clamp(1.5rem,3vw,2.2rem)] text-[var(--ink-fg)]">Year-on-year expansion</h3>
            </div>
            <div className="space-y-5">
              {YOY.map((y, i) => (
                <div key={y.region}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[14px] text-[var(--ink-fg)]/80">{y.region}</span>
                    <span className="font-mono text-[14px] text-[var(--accent)]">
                      +<CountUp target={y.pct} suffix="%" run={yoy.inView} />
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-white/[0.08] overflow-hidden">
                    <div className="h-full rounded-full bg-[var(--accent)]"
                      style={{ width: yoy.inView ? `${(y.pct / 42) * 100}%` : '0%', transition: `width 1000ms cubic-bezier(0.22,1,0.36,1) ${i * 120}ms` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-12">
            <Link to="/contact" className="inline-flex items-center gap-2 text-[14px] font-bold text-[#0B0B0C] bg-[#ECEBE6] hover:opacity-90 px-7 py-3.5 rounded-full transition-opacity">
              Partner With Us <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>arrow_forward</span>
            </Link>
          </div>
        </div>
      </section>

      {/* Timeline — alternating with photos */}
      <section className="mx-auto max-w-[1200px] px-6 lg:px-8 py-16 lg:py-24">
        <div className="text-center mb-16">
          <div className="text-[11px] tracking-[0.3em] uppercase text-[var(--accent)] font-mono mb-3">Decades of Momentum</div>
          <h2 className="display text-[clamp(1.8rem,4vw,3rem)] text-[var(--text)] mb-4">From a local firm to an infrastructure powerhouse</h2>
          <p className="text-[15px] text-[var(--text-2)] max-w-[42rem] mx-auto">Tracing our path across fifteen years of disciplined, engineering-led growth.</p>
        </div>

        <div className="relative">
          {/* center spine (desktop) */}
          <div className="hidden lg:block absolute left-1/2 top-0 bottom-0 w-px bg-[var(--line)] -translate-x-1/2" />

          <div className="space-y-12 lg:space-y-0">
            {TIMELINE.map((t, i) => {
              const left = i % 2 === 0
              return (
                <div key={t.year} className="lg:grid lg:grid-cols-[1fr_auto_1fr] lg:gap-10 items-center lg:mb-4">
                  {/* text side */}
                  <div className={`${left ? 'lg:col-start-1 lg:text-right lg:pr-4' : 'lg:col-start-3 lg:text-left lg:pl-4'} order-2`}>
                    <div className="display text-[2.2rem] text-[var(--faint)] leading-none mb-2">{t.year}</div>
                    <h3 className="text-[19px] font-semibold text-[var(--text)] mb-2">{t.title}</h3>
                    <p className={`text-[14px] leading-relaxed text-[var(--text-2)] ${left ? 'lg:ml-auto' : ''} max-w-[26rem]`}>{t.body}</p>
                  </div>

                  {/* node */}
                  <div className="hidden lg:flex lg:col-start-2 items-center justify-center">
                    <span className="w-3.5 h-3.5 rounded-[3px] bg-[var(--accent)] rotate-45 ring-4 ring-[var(--bg)]" />
                  </div>

                  {/* photo side */}
                  <div className={`${left ? 'lg:col-start-3 lg:pl-4' : 'lg:col-start-1 lg:pr-4 lg:row-start-1'} order-1 mb-5 lg:mb-0`}>
                    <div className="rounded-2xl overflow-hidden border border-[var(--line)] aspect-[16/10]">
                      <img src={t.img} alt={t.title} loading="lazy" className="w-full h-full object-cover hover:scale-105 transition-transform duration-500" />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-[var(--ink)] text-[var(--ink-fg)]">
        <div className="mx-auto max-w-[1200px] px-6 lg:px-8 py-20 lg:py-24 text-center">
          <h2 className="display text-[clamp(2rem,5vw,3.6rem)] text-[var(--ink-fg)] max-w-[18ch] mx-auto mb-6">Invest in excellence. Build with AADVIK.</h2>
          <p className="text-[15px] text-[var(--ink-fg)]/60 max-w-[40rem] mx-auto mb-10">
            Our growth is your opportunity for unparalleled infrastructure reliability.
          </p>
          <Link to="/contact" className="inline-flex items-center gap-2 text-[14px] font-bold text-[#0B0B0C] bg-[#ECEBE6] hover:opacity-90 px-8 py-4 rounded-full transition-opacity">
            Partner With Us <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>arrow_forward</span>
          </Link>
        </div>
      </section>
    </SiteChrome>
  )
}