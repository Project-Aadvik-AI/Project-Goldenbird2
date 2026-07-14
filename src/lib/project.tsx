import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react'
import { supabase } from './supabase'
import { useWorkspace } from './workspace'

export type Project = {
  id: string
  name: string
  code: string | null
  client: string | null
  contract_no: string | null
  contract_value: number | null
  location: string | null
  start_date: string | null
  end_date: string | null
  status: string
  created_at: string
}

type ProjectCtx = {
  projects: Project[]
  activeProject: Project | null
  setActiveProject: (p: Project | null) => void
  loading: boolean
  reload: () => Promise<void>
}

const Ctx = createContext<ProjectCtx>(null as unknown as ProjectCtx)
export const useProject = () => useContext(Ctx)

const STORAGE_KEY = 'aadvik.activeProjectId'

export function ProjectProvider({ children }: { children: ReactNode }) {
  const { inHeadOffice } = useWorkspace()
  const [projects, setProjects] = useState<Project[]>([])
  const [activeProject, setActiveProjectState] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: false })
    const list = (data as Project[]) ?? []
    setProjects(list)
    const savedId = localStorage.getItem(STORAGE_KEY)
    let next: Project | null = null
    if (savedId) next = list.find(p => p.id === savedId) ?? null

    // ⚠️ REMOVED: `if (!next && list.length > 0) next = list[0]`
    //
    //    The app used to AUTO-SELECT the first project if you had not chosen
    //    one. So a Head Office user who never picked a project was silently
    //    given one — and every page then filtered by it, showing ONE project's
    //    data while they believed they were looking at the whole company.
    //
    //    Nothing should choose a project on your behalf. If you have not
    //    picked one, you have not picked one.
    setActiveProjectState(next)
    if (next) localStorage.setItem(STORAGE_KEY, next.id)
    else localStorage.removeItem(STORAGE_KEY)
    setLoading(false)
  }, [])

  useEffect(() => { reload() }, [reload])

  const setActiveProject = (p: Project | null) => {
    setActiveProjectState(p)
    if (p) localStorage.setItem(STORAGE_KEY, p.id)
    else localStorage.removeItem(STORAGE_KEY)
  }

  // ⚠️ IN HEAD OFFICE, THERE IS NO ACTIVE PROJECT.
  //
  //    Every page already does:
  //        if (activeProject) query = query.eq('project_id', activeProject.id)
  //
  //    So a NULL activeProject naturally means "every project" — which is
  //    precisely what Head Office means. We do not have to touch 40 pages;
  //    we just stop lying to them about which project they are in.
  //
  //    The chosen project is REMEMBERED (it stays in localStorage), so
  //    stepping into Head Office and back does not lose your place.
  const effectiveProject = inHeadOffice ? null : activeProject

  return (
    <Ctx.Provider value={{
      projects,
      activeProject: effectiveProject,
      setActiveProject,
      loading,
      reload,
    }}>
      {children}
    </Ctx.Provider>
  )
}

/** Small reusable "no project selected" prompt for module pages */
export function NoProjectPrompt() {
  return (
    <div className="card p-8 text-center max-w-md mx-auto mt-8">
      <div className="w-12 h-12 rounded-full bg-[#ff8f00]/10 grid place-items-center mx-auto mb-3">
        <span className="material-symbols-outlined text-[#ffb87b]" style={{ fontSize: '24px' }}>folder_open</span>
      </div>
      <h2 className="font-headline text-lg font-semibold text-[#e2e2e8] mb-1">Pick a project first</h2>
      <p className="text-sm text-[#dcc1ae] mb-4">
        This module works inside a project. Use the switcher in the top bar, or create your first project.
      </p>
      <a href="/projects" className="btn btn-primary inline-flex">
        <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span>
        Go to Projects
      </a>
    </div>
  )
}