import SiteChrome from './SiteChrome'
import { useState } from 'react'

const PROJECT_TYPES = ['Roads & Highways', 'Bridges & Flyovers', 'Railway Infrastructure', 'Water & Urban Works', 'Industrial / Commercial', 'Structural Renovation']
const BUDGETS = ['Under ₹1 Cr', '₹1 Cr – ₹10 Cr', '₹10 Cr – ₹50 Cr', '₹50 Cr+']
const TO_EMAIL = 'projects@aadvik.com'

export default function Contact() {
  const [name, setName] = useState('')
  const [company, setCompany] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [ptype, setPtype] = useState('')
  const [budget, setBudget] = useState('')
  const [message, setMessage] = useState('')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const subject = `Project Enquiry — ${name}${company ? ' (' + company + ')' : ''}`
    const body =
      `Name: ${name}\n` +
      `Company: ${company || '—'}\n` +
      `Email: ${email}\n` +
      `Phone: ${phone || '—'}\n` +
      `Project type: ${ptype || '—'}\n` +
      `Budget range: ${budget || '—'}\n\n` +
      `Message / Technical Scope:\n${message}\n`
    window.location.href = `mailto:${TO_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  }

  return (
    <SiteChrome>
      {/* Hero */}
      <section className="mx-auto max-w-[1200px] px-6 lg:px-8 pt-16 lg:pt-24 pb-12">
        <div className="text-[11px] tracking-[0.3em] uppercase text-[var(--accent)] font-mono mb-4">Get in Touch</div>
        <h1 className="display text-[clamp(2.4rem,6vw,5rem)] text-[var(--text)] max-w-[16ch] mb-6">Connect with engineering excellence.</h1>
        <p className="text-[16px] leading-relaxed text-[var(--text-2)] max-w-[44rem]">
          Enquire about our civil engineering services or schedule a technical consultation for your next landmark project.
        </p>
      </section>

      {/* Form + details */}
      <section className="mx-auto max-w-[1200px] px-6 lg:px-8 pb-16 lg:pb-24 grid lg:grid-cols-[1.2fr_0.8fr] gap-6">
        {/* Enquiry form */}
        <div className="rounded-3xl border border-[var(--line)] bg-[var(--card)] p-6 lg:p-8">
          <div className="text-[11px] tracking-[0.2em] uppercase text-[var(--accent)] font-mono mb-2">Enquiry Form</div>
          <h2 className="text-[22px] font-semibold text-[var(--text)] mb-6">Project Enquiry</h2>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Full Name" required>
                <input className="input" value={name} onChange={e => setName(e.target.value)} required />
              </Field>
              <Field label="Company">
                <input className="input" value={company} onChange={e => setCompany(e.target.value)} />
              </Field>
              <Field label="Email Address" required>
                <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
              </Field>
              <Field label="Phone Number">
                <input className="input" value={phone} onChange={e => setPhone(e.target.value)} />
              </Field>
              <Field label="Project Type">
                <select className="input" value={ptype} onChange={e => setPtype(e.target.value)}>
                  <option value="">Select project type</option>
                  {PROJECT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="Budget Range">
                <select className="input" value={budget} onChange={e => setBudget(e.target.value)}>
                  <option value="">Select range</option>
                  {BUDGETS.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Message / Technical Scope" required>
              <textarea className="input" rows={5} value={message} onChange={e => setMessage(e.target.value)} required />
            </Field>
            <button className="btn btn-primary w-full" style={{ padding: '13px 16px', fontSize: '14px', borderRadius: '9999px' }}>
              Submit Enquiry <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>arrow_forward</span>
            </button>
          </form>
        </div>

        {/* Details */}
        <div className="space-y-4">
          <div className="rounded-3xl border border-[var(--line)] bg-[var(--card)] p-6 lg:p-8">
            <div className="text-[11px] tracking-[0.2em] uppercase text-[var(--accent)] font-mono mb-6">Corporate Office</div>
            <ContactRow icon="location_on" head="Office">
              102 Engineering Plaza, Sector 4<br />Gurugram, HR 122002, India
            </ContactRow>
            <ContactRow icon="call" head="Direct Line">
              <a href="tel:+911244567890" className="hover:text-[var(--text)] transition-colors">+91 (124) 456-7890</a>
            </ContactRow>
            <ContactRow icon="mail" head="Enquiries" last>
              <a href="mailto:projects@aadvik.com" className="hover:text-[var(--text)] transition-colors">projects@aadvik.com</a><br />
              <a href="mailto:info@aadvik.com" className="hover:text-[var(--text)] transition-colors">info@aadvik.com</a>
            </ContactRow>
          </div>

          <div className="rounded-3xl bg-[var(--ink)] text-[var(--ink-fg)] p-6 lg:p-8">
            <span className="material-symbols-outlined text-[var(--accent)] mb-4" style={{ fontSize: '28px' }}>health_and_safety</span>
            <h3 className="text-[17px] font-semibold text-[var(--ink-fg)] mb-2">Committed to zero-incident safety</h3>
            <p className="text-[13px] leading-relaxed text-[var(--ink-fg)]/55 mb-6">
              Our project management protocols meet and exceed industry safety standards.
            </p>
            <div className="grid grid-cols-2 gap-4 border-t border-white/[0.1] pt-6">
              <div>
                <div className="display text-[1.8rem] text-[var(--ink-fg)]">150+</div>
                <div className="text-[11px] tracking-[0.16em] uppercase text-[var(--ink-fg)]/50 font-mono mt-1">Engineers</div>
              </div>
              <div>
                <div className="display text-[1.8rem] text-[var(--ink-fg)]">1,200+</div>
                <div className="text-[11px] tracking-[0.16em] uppercase text-[var(--ink-fg)]/50 font-mono mt-1">Workforce</div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </SiteChrome>
  )
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] font-mono tracking-[0.16em] text-[var(--faint)] uppercase block mb-2">
        {label}{required && <span className="text-[var(--accent)]"> *</span>}
      </span>
      {children}
    </label>
  )
}

function ContactRow({ icon, head, children, last }: { icon: string; head: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div className={`flex gap-4 ${last ? '' : 'mb-6 pb-6 border-b border-[var(--line)]'}`}>
      <span className="material-symbols-outlined text-[var(--accent)] flex-shrink-0" style={{ fontSize: '20px' }}>{icon}</span>
      <div>
        <div className="text-[11px] tracking-[0.16em] uppercase text-[var(--faint)] font-mono mb-1">{head}</div>
        <div className="text-[14px] text-[var(--text-2)] leading-relaxed">{children}</div>
      </div>
    </div>
  )
}