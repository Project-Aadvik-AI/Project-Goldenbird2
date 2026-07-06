import { createContext, useContext, useEffect, useState } from 'react'

// ============================================================
// i18n — English / Hindi. Hindi for everyday words, English
// kept for construction & finance jargon. t(englishString)
// returns the Hindi translation when language is 'hi'.
// ============================================================

type Lang = 'en' | 'hi'

const HI: Record<string, string> = {
  'Overview': 'अवलोकन',
  'Project Home': 'प्रोजेक्ट होम',
  'Daily Expenses': 'रोज़ाना खर्च',
  'Store IN / OUT': 'Store IN / OUT',
  'Machine Status': 'मशीन स्थिति',
  'Daily Progress': 'दैनिक प्रगति',
  'Labour & Wages': 'श्रमिक व मज़दूरी',
  'Purchase Requests': 'Purchase Requests',
  'Work Orders': 'Work Orders',
  'Drawings': 'Drawings',
  'Tasks': 'कार्य',
  'Vendor Bills': 'Vendor Bills',
  'Reports': 'रिपोर्ट्स',
  'AI Site Brief': 'AI Site Brief',
  'Employees': 'कर्मचारी',
  'Attendance': 'उपस्थिति',
  'Leave & Holidays': 'छुट्टी व अवकाश',
  'Documents': 'दस्तावेज़',
  'Correspondence': 'पत्राचार',
  'Contracts': 'अनुबंध',
  'Master Data': 'Master Data',
  // nav groups
  'Site Operations': 'साइट ऑपरेशन्स',
  'Procurement': 'Procurement',
  'HR Management': 'HR Management',
  'Reports & AI': 'Reports & AI',
  // admin
  'Admin': 'व्यवस्थापन',
  'Staff & Permissions': 'स्टाफ व अनुमतियाँ',
  'Projects': 'प्रोजेक्ट्स',
  'Reports & Export': 'रिपोर्ट्स व Export',
  'Invite Code': 'इनवाइट कोड',
  'Team': 'टीम',
  // shell chrome
  'Logout': 'लॉगआउट',
  'Live': 'Live',
  'member': 'सदस्य',
  'Project': 'प्रोजेक्ट',
  'Switch project': 'प्रोजेक्ट बदलें',
  'New project': 'नया प्रोजेक्ट',
  'Create first project': 'पहला प्रोजेक्ट बनाएँ',
  'Loading projects…': 'प्रोजेक्ट लोड हो रहे…',
  'Pick a project': 'प्रोजेक्ट चुनें',
  'Store': 'Store',
  'Expenses': 'खर्च',
  'More': 'और',
}

type Ctx = { lang: Lang; setLang: (l: Lang) => void; toggle: () => void; t: (s: string) => string }
const LangContext = createContext<Ctx>({ lang: 'en', setLang: () => {}, toggle: () => {}, t: (s) => s })

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem('aadvik-lang')
    if (saved === 'en' || saved === 'hi') return saved
  } catch { /* ignore */ }
  return 'en'
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang)

  useEffect(() => {
    document.documentElement.setAttribute('lang', lang)
    try { localStorage.setItem('aadvik-lang', lang) } catch { /* ignore */ }
  }, [lang])

  const setLang = (l: Lang) => setLangState(l)
  const toggle = () => setLangState(l => (l === 'en' ? 'hi' : 'en'))
  const t = (s: string) => (lang === 'hi' ? (HI[s] ?? s) : s)

  return <LangContext.Provider value={{ lang, setLang, toggle, t }}>{children}</LangContext.Provider>
}

export function useLang() {
  return useContext(LangContext)
}

export function LanguageToggle({ className = '' }: { className?: string }) {
  const { lang, toggle } = useLang()
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={lang === 'en' ? 'हिंदी में बदलें' : 'Switch to English'}
      title={lang === 'en' ? 'हिंदी' : 'English'}
      className={`inline-flex items-center justify-center h-9 px-3 rounded-lg border border-[var(--line)] text-[var(--text-2)] hover:text-[var(--text)] hover:border-[var(--text-2)] transition-colors text-[12px] font-semibold tracking-wide ${className}`}
    >
      {lang === 'en' ? 'EN' : 'हिं'}
    </button>
  )
}