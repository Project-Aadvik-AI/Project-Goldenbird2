import { Link, useNavigate } from 'react-router-dom'
import SiteChrome, { Cube } from './SiteChrome'

const TIMELINE = [
  { year: '2009', title: 'Founding & First Pillar', body: 'AADVIK was founded by field engineers with a single commitment: precision. We secured our first municipal contract in residential infrastructure.' },
  { year: '2015', title: 'Industrial Expansion', body: 'Diversifying into heavy industrial sectors, AADVIK adopted prefabricated concrete modules, cutting project timelines significantly.' },
  { year: '2021', title: 'Modern Site Operations', body: 'We digitised on-site operations — expenses, store, machinery, labour and daily progress — moving to real-time reporting across projects.' },
  { year: '2024', title: 'The NALCO Milestone', body: 'AADVIK secured the ₹33.55 Cr NALCO Damanjodi railway-siding project under RITES — our largest infrastructure package to date.' },
]

const VALUES = [
  { icon: 'gavel', title: 'Integrity', body: 'Honesty in every contract and transparency in every structural inspection.' },
  { icon: 'verified', title: 'Quality', body: 'Exceeding standards through rigorous testing and precision engineering.' },
  { icon: 'health_and_safety', title: 'Safety', body: 'A zero-incident culture where the wellbeing of our crew comes first.' },
  { icon: 'lightbulb', title: 'Innovation', body: 'Modern methods, machinery and digital site operations on every project.' },
]

const WHY = [
  { icon: 'architecture', title: 'Technical Mastery', body: 'Experienced engineers with deep expertise in structural stability and earthworks.' },
  { icon: 'precision_manufacturing', title: 'Unrivaled Precision', body: 'Rigorous survey, quality control and machinery for every foundation and pour.' },
  { icon: 'history', title: 'On-Time Delivery', body: 'A strong record of meeting critical milestones through disciplined project management.' },
]

export default function About() {
  const navigate = useNavigate()
  return (
    <SiteChrome>
      {/* Hero */}
      <section className="relative mx-auto max-w-[1200px] px-6 lg:px-8 pt-16 lg:pt-24 pb-16 lg:pb-24">
        <div className="grid lg:grid-cols-[1.15fr_0.85fr] gap-12 items-center">
          <div>
            <div className="inline-flex items-center gap-2 mb-8 px-3 py-1.5 rounded-full border border-[var(--line)] text-[11px] tracking-[0.16em] uppercase text-[var(--text-2)] font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" /> Established 2009
            </div>
            <h1 className="display text-[clamp(2.4rem,6vw,5rem)] text-[var(--text)]">
              Engineering the future of infrastructure.
            </h1>
            <p className="mt-8 text-[16px] leading-relaxed text-[var(--text-2)] max-w-[36rem]">
              AADVIK is a civil construction firm dedicated to building the backbone of modern society. Our mission is to
              deliver structural excellence through technical precision, unwavering integrity, and industrial innovation.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-3">
              <Link to="/projects" className="inline-flex items-center gap-2 text-[14px] font-bold text-[var(--bg)] bg-[var(--text)] hover:opacity-90 px-7 py-3.5 rounded-full transition-opacity">
                View Our Work <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>arrow_forward</span>
              </Link>
              <a href="mailto:contact@aadvik.example" className="inline-flex items-center text-[14px] font-semibold text-[var(--text)] border border-[var(--line)] hover:border-[var(--text-2)] px-7 py-3.5 rounded-full transition-colors">
                Talk to Us
              </a>
            </div>
          </div>
          {/* Featured project card */}
          <div className="rounded-3xl border border-[var(--line)] bg-[var(--card)] p-8 relative overflow-hidden">
            <div className="absolute -right-6 -top-6"><Cube size={120} faces={['#ffcf8f', '#ff8f00', '#c96f00']} /></div>
            <div className="text-[11px] font-mono tracking-[0.2em] uppercase text-[var(--accent)] mb-6">Featured Project</div>
            <div className="text-[22px] font-semibold text-[var(--text)] mb-1">NALCO Damanjodi Siding</div>
            <div className="text-[13px] text-[var(--text-2)]">RITES · Odisha</div>
            <div className="mt-10 flex items-end justify-between">
              <div>
                <div className="display text-[2.4rem] text-[var(--text)] leading-none">15+</div>
                <div className="text-[11px] tracking-[0.16em] uppercase text-[var(--faint)] font-mono mt-1">Years Exp</div>
              </div>
              <div className="font-mono text-[16px] text-[var(--accent)]">₹33.55 Cr</div>
            </div>
          </div>
        </div>
      </section>

      {/* Journey */}
      <section className="bg-[var(--ink)] text-[var(--ink-fg)]">
        <div className="mx-auto max-w-[1200px] px-6 lg:px-8 py-16 lg:py-24">
          <div className="text-[11px] tracking-[0.3em] uppercase text-[var(--accent)] font-mono mb-3">Our Journey</div>
          <h2 className="display text-[clamp(1.8rem,4vw,3rem)] text-[var(--ink-fg)] mb-14">A decade and a half of momentum</h2>
          <div className="grid md:grid-cols-2 gap-x-12 gap-y-10">
            {TIMELINE.map((t, i) => (
              <div key={t.year} className="flex gap-6">
                <div className="flex flex-col items-center">
                  <div className="display text-[1.6rem] text-[var(--accent)] leading-none">{t.year}</div>
                  {i < TIMELINE.length - 1 && <div className="w-px flex-1 bg-white/[0.1] mt-3" />}
                </div>
                <div className="pb-2">
                  <h3 className="text-[18px] font-semibold text-[var(--ink-fg)] mb-2">{t.title}</h3>
                  <p className="text-[14px] leading-relaxed text-[var(--ink-fg)]/55 max-w-[26rem]">{t.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Philosophy / Values */}
      <section className="mx-auto max-w-[1200px] px-6 lg:px-8 py-16 lg:py-24">
        <div className="text-[11px] tracking-[0.3em] uppercase text-[var(--accent)] font-mono mb-3">Our Philosophy</div>
        <h2 className="display text-[clamp(1.8rem,4vw,3rem)] text-[var(--text)] max-w-[20ch] mb-4">The bedrock of our success</h2>
        <p className="text-[15px] text-[var(--text-2)] max-w-[42rem] mb-12">
          Values that aren't just written on a wall, but poured into every cubic metre of concrete.
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {VALUES.map(v => (
            <div key={v.title} className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-6">
              <span className="material-symbols-outlined text-[var(--accent)] mb-4" style={{ fontSize: '28px' }}>{v.icon}</span>
              <h3 className="text-[16px] font-semibold text-[var(--text)] mb-2">{v.title}</h3>
              <p className="text-[13px] leading-relaxed text-[var(--text-2)]">{v.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Why choose */}
      <section className="bg-[var(--ink)] text-[var(--ink-fg)]">
        <div className="mx-auto max-w-[1200px] px-6 lg:px-8 py-16 lg:py-24">
          <h2 className="display text-[clamp(1.8rem,4vw,3rem)] text-[var(--ink-fg)] mb-12">Why clients choose AADVIK</h2>
          <div className="grid md:grid-cols-3 gap-4 mb-16">
            {WHY.map(w => (
              <div key={w.title} className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6">
                <span className="material-symbols-outlined text-[var(--accent)] mb-4" style={{ fontSize: '28px' }}>{w.icon}</span>
                <h3 className="text-[16px] font-semibold text-[var(--ink-fg)] mb-2">{w.title}</h3>
                <p className="text-[13px] leading-relaxed text-[var(--ink-fg)]/55">{w.body}</p>
              </div>
            ))}
          </div>

          {/* Testimonial */}
          <figure className="border-t border-white/[0.1] pt-12 max-w-[52rem]">
            <blockquote className="display text-[clamp(1.4rem,3vw,2.2rem)] text-[var(--ink-fg)] leading-tight normal-case tracking-normal">
              "AADVIK's attention to structural detail and site discipline is what sets them apart in this industry."
            </blockquote>
            <figcaption className="mt-6 text-[13px] text-[var(--ink-fg)]/60">
              <span className="font-semibold text-[var(--ink-fg)]">Project Director</span> · RITES · NALCO Damanjodi
            </figcaption>
          </figure>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-[1200px] px-6 lg:px-8 py-20 lg:py-24 text-center">
        <h2 className="display text-[clamp(2rem,5vw,3.6rem)] text-[var(--text)] max-w-[18ch] mx-auto mb-6">Ready to build something great?</h2>
        <p className="text-[15px] text-[var(--text-2)] max-w-[38rem] mx-auto mb-10">
          Consult with our engineering team today to discuss your next landmark project.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <a href="mailto:contact@aadvik.example" className="inline-flex items-center gap-2 text-[14px] font-bold text-[var(--bg)] bg-[var(--text)] hover:opacity-90 px-8 py-4 rounded-full transition-opacity">
            Get a Quote <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>arrow_forward</span>
          </a>
          <button onClick={() => navigate('/projects')} className="inline-flex items-center text-[14px] font-semibold text-[var(--text)] border border-[var(--line)] hover:border-[var(--text-2)] px-8 py-4 rounded-full transition-colors">
            View Projects
          </button>
        </div>
      </section>
    </SiteChrome>
  )
}