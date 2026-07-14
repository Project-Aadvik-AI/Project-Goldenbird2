import { createContext, useContext, useEffect, useState, ReactNode } from 'react'

/**
 * WHICH WORKSPACE AM I IN?
 *
 * THE BUG THIS FIXES
 *
 *   The app used to decide this from the URL:
 *
 *       const inHeadOffice = isAdmin && HO_ROUTES.has(pathname)
 *
 *   HO_ROUTES was a hand-maintained list of paths. So if you were in Head
 *   Office and clicked a page that happened NOT to be on that list —
 *   Employees, Vendors, Inventory, Warehouses — the app concluded you were
 *   no longer in Head Office and silently flipped you into a project
 *   workspace. You never chose a project. It chose one for you.
 *
 *   And every new page I added made it worse, because I had to remember to
 *   add it to the list. Anything I forgot became a trapdoor.
 *
 * THE FIX
 *
 *   The workspace is a CHOICE, not a side-effect of the URL. You are in
 *   Head Office because you SAID so, and you stay there until you say
 *   otherwise. The URL has no vote.
 */
export type Workspace = 'head-office' | 'project'

type Ctx = {
  workspace: Workspace
  /** go to Head Office. Explicit. */
  enterHeadOffice: () => void
  /** go into a project workspace. Explicit. */
  enterProject: () => void
  inHeadOffice: boolean
}

const WorkspaceCtx = createContext<Ctx>({
  workspace: 'project',
  enterHeadOffice: () => {},
  enterProject: () => {},
  inHeadOffice: false,
})

const KEY = 'aadvik.workspace'

export function WorkspaceProvider({ children, isAdmin }: {
  children: ReactNode
  isAdmin: boolean
}) {
  const [workspace, setWorkspace] = useState<Workspace>(() => {
    // survive a refresh and a direct URL — the workspace is yours, not the URL's
    const saved = localStorage.getItem(KEY)
    return saved === 'head-office' ? 'head-office' : 'project'
  })

  // a non-admin has no Head Office. If their role changes, don't strand them.
  useEffect(() => {
    if (!isAdmin && workspace === 'head-office') {
      setWorkspace('project')
      localStorage.setItem(KEY, 'project')
    }
  }, [isAdmin, workspace])

  const set = (w: Workspace) => {
    setWorkspace(w)
    localStorage.setItem(KEY, w)
  }

  return (
    <WorkspaceCtx.Provider value={{
      workspace,
      inHeadOffice: isAdmin && workspace === 'head-office',
      enterHeadOffice: () => set('head-office'),
      enterProject: () => set('project'),
    }}>
      {children}
    </WorkspaceCtx.Provider>
  )
}

export const useWorkspace = () => useContext(WorkspaceCtx)