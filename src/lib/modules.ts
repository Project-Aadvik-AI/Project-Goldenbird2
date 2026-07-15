// Central registry of ERP modules for the permission system.
// To expose a NEW module in the Permissions page, just add one line here —
// no other code change needed (spec point 14: future modules auto-appear).

export type ModuleDef = { key: string; label: string; group: string }

export const MODULES: ModuleDef[] = [
  // Site Operations
  { key: 'expenses', label: 'Daily Expenses', group: 'Site Operations' },
  { key: 'store', label: 'Store IN / OUT', group: 'Site Operations' },
  { key: 'machines', label: 'Machine Status', group: 'Site Operations' },
  { key: 'dpr', label: 'Daily Progress (DPR)', group: 'Site Operations' },
  { key: 'labour', label: 'Labour & Wages', group: 'Site Operations' },
  // BOQ & Billing
  { key: 'boq', label: 'BOQ', group: 'BOQ & Billing' },
  { key: 'boq_dashboard', label: 'BOQ Dashboard', group: 'BOQ & Billing' },
  { key: 'boq_budget', label: 'BOQ Budget', group: 'BOQ & Billing' },
  { key: 'measurement_book', label: 'Measurement Book', group: 'BOQ & Billing' },
  { key: 'billing', label: 'RA Billing', group: 'BOQ & Billing' },
  // Procurement
  { key: 'purchase_requests', label: 'Purchase Requests', group: 'Procurement' },
  { key: 'work_orders', label: 'Work Orders', group: 'Procurement' },
  { key: 'vendor_bills', label: 'Vendor Bills', group: 'Procurement' },
  // HR
  { key: 'employees', label: 'Employees', group: 'HR' },
  { key: 'designations', label: 'Designations', group: 'HR' },
  { key: 'attendance', label: 'Attendance', group: 'HR' },
  { key: 'leaves', label: 'Leave & Holidays', group: 'HR' },
  { key: 'payroll', label: 'Payroll', group: 'HR' },
  // Documents
  { key: 'drawings', label: 'Drawings', group: 'Documents' },
  { key: 'correspondence', label: 'Correspondence', group: 'Documents' },
  { key: 'contracts', label: 'Contracts', group: 'Documents' },
  { key: 'documents', label: 'Documents', group: 'Documents' },
  // Work & Reports
  { key: 'tasks', label: 'Tasks', group: 'Work & Reports' },
  { key: 'reports', label: 'Reports', group: 'Work & Reports' },
  { key: 'monthly_performance', label: 'Monthly Performance', group: 'Work & Reports' },
  // Finance
  { key: 'credit', label: 'Credit Management', group: 'Finance' },
]

export const PERMS = ['view', 'create', 'edit', 'delete', 'approve', 'export'] as const
export type PermKey = typeof PERMS[number]