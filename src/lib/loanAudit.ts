import { supabase } from './supabase'

// Writes to loan_audit_log — mirrors vendor_audit_log / payroll_audit_log.
// Best-effort: an audit failure must never block the actual loan operation.

export type Actor = { id: string | null; name: string | null }

export async function logLoanAudit(
  loanId: string,
  action: string,
  opts?: { field?: string; oldValue?: unknown; newValue?: unknown; actor?: Actor; orgId?: string | null }
) {
  try {
    await supabase.from('loan_audit_log').insert({
      org_id: opts?.orgId ?? null,
      loan_id: loanId,
      user_id: opts?.actor?.id ?? null,
      user_name: opts?.actor?.name ?? null,
      action,
      field: opts?.field ?? null,
      old_value: opts?.oldValue != null ? String(opts.oldValue) : null,
      new_value: opts?.newValue != null ? String(opts.newValue) : null,
    })
  } catch { /* never block the operation on an audit write */ }
}

// Diff two field maps and log one row per changed field.
export async function logLoanDiff(
  loanId: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  labels: Record<string, string>,
  actor?: Actor,
  orgId?: string | null
) {
  for (const key of Object.keys(labels)) {
    const a = before[key]
    const b = after[key]
    if (String(a ?? '') !== String(b ?? '')) {
      await logLoanAudit(loanId, 'Updated', { field: labels[key], oldValue: a, newValue: b, actor, orgId })
    }
  }
}