import { createContext, useContext, useState, type ReactNode } from 'react'
import type { Lang } from '../i18n'
import { t, type TKey } from '../i18n'

interface LangCtx { lang: Lang; setLang: (l: Lang) => void; T: (k: TKey) => string }
const Ctx = createContext<LangCtx>({ lang: 'en', setLang: () => {}, T: k => k })

export function LangProvider({ children }: { children: ReactNode }) {
  const saved = (localStorage.getItem('pm_lang') as Lang) || 'en'
  const [lang, setLangState] = useState<Lang>(saved)
  const setLang = (l: Lang) => { setLangState(l); localStorage.setItem('pm_lang', l) }
  const T = (k: TKey) => t(lang, k)
  return <Ctx.Provider value={{ lang, setLang, T }}>{children}</Ctx.Provider>
}

export const useLang = () => useContext(Ctx)
