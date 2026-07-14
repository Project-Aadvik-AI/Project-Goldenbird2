/**
 * Apply a project filter ONLY when a project is active.
 *
 * In a project workspace  -> scoped to that project
 * In Head Office (none)   -> no filter, so every project is shown
 *
 * The old pattern was  .eq('project_id', activeProject?.id ?? '')
 * which filtered on an empty string when no project was selected — matching
 * nothing, and making Head Office look broken.
 */
export function scopeToProject<T>(query: T, projectId: string | null | undefined, column = 'project_id'): T {
  if (!projectId) return query
  return (query as any).eq(column, projectId) as T
}