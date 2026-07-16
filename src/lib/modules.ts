// Central registry of ERP modules for the permission system.
// To expose a NEW module in the Permissions page, just add one line here —
// no other code change needed (spec point 14: future modules auto-appear).

export type ModuleDef = { key: string; label: string; group: string }

export const MODULES: ModuleDef[] = [
  // ── Site Operations ──
  { key: 'expenses', label: 'Daily Expenses', group: 'Site Operations' },
  { key: 'dpr', label: 'Daily Progress (DPR)', group: 'Site Operations' },
  { key: 'labour', label: 'Labour & Wages', group: 'Site Operations' },
  { key: 'machines', label: 'Machine Status', group: 'Site Operations' },
  { key: 'hindrances', label: 'Site Instructions / Hindrances', group: 'Site Operations' },
  { key: 'eot', label: 'EOT Claims', group: 'Site Operations' },

  // ── BOQ & Billing ──
  { key: 'boq', label: 'BOQ', group: 'BOQ & Billing' },
  { key: 'boq_dashboard', label: 'BOQ Dashboard', group: 'BOQ & Billing' },
  { key: 'boq_budget', label: 'BOQ Budget', group: 'BOQ & Billing' },
  { key: 'measurement_book', label: 'Measurement Book', group: 'BOQ & Billing' },
  { key: 'billing', label: 'RA Billing', group: 'BOQ & Billing' },
  { key: 'boq_schedules', label: 'Schedule Master', group: 'BOQ & Billing' },

  // ── Procurement & Vendors ──
  { key: 'purchase_requests', label: 'Purchase Requests', group: 'Procurement & Vendors' },
  { key: 'work_orders', label: 'Work Orders', group: 'Procurement & Vendors' },
  { key: 'vendors', label: 'Vendors', group: 'Procurement & Vendors' },
  { key: 'vendor_bills', label: 'Vendor Bills', group: 'Procurement & Vendors' },
  { key: 'vendor_payments', label: 'Vendor Payments', group: 'Procurement & Vendors' },
  { key: 'vendor_progress', label: 'Vendor Progress', group: 'Procurement & Vendors' },
  { key: 'vendor_reports', label: 'Vendor Reports', group: 'Procurement & Vendors' },

  // ── Store & Inventory ──
  { key: 'store', label: 'Store IN / OUT', group: 'Store & Inventory' },
  { key: 'inventory', label: 'Inventory Masters', group: 'Store & Inventory' },
  { key: 'warehouses', label: 'Warehouses', group: 'Store & Inventory' },

  // ── Finance & Accounting ──
  { key: 'accounting', label: 'Accounting', group: 'Finance & Accounting' },
  { key: 'credit', label: 'Credit Management', group: 'Finance & Accounting' },
  { key: 'bank_recon', label: 'Bank Reconciliation', group: 'Finance & Accounting' },
  { key: 'gst_reports', label: 'GST Reports', group: 'Finance & Accounting' },
  { key: 'finance_reports', label: 'Finance Reports', group: 'Finance & Accounting' },
  { key: 'accounting_export', label: 'Accounting Export', group: 'Finance & Accounting' },
  { key: 'imprest', label: 'Staff Imprest (Give)', group: 'Finance & Accounting' },

  // ── HR & Payroll ──
  { key: 'employees', label: 'Employees', group: 'HR & Payroll' },
  { key: 'attendance', label: 'Attendance', group: 'HR & Payroll' },
  { key: 'leaves', label: 'Leave & Holidays', group: 'HR & Payroll' },
  { key: 'designations', label: 'Designations', group: 'HR & Payroll' },
  { key: 'payroll', label: 'Payroll', group: 'HR & Payroll' },

  // ── Documents & Communication ──
  { key: 'drawings', label: 'Drawings', group: 'Documents & Communication' },
  { key: 'correspondence', label: 'Correspondence', group: 'Documents & Communication' },
  { key: 'contracts', label: 'Contracts', group: 'Documents & Communication' },
  { key: 'documents', label: 'Documents', group: 'Documents & Communication' },
  { key: 'notices', label: 'Notice Board', group: 'Documents & Communication' },

  // ── Reports & Planning ──
  { key: 'reports', label: 'Reports', group: 'Reports & Planning' },
  { key: 'monthly_performance', label: 'Monthly Performance', group: 'Reports & Planning' },
  { key: 'tasks', label: 'Tasks', group: 'Reports & Planning' },
  { key: 'project_resources', label: 'Project Resources', group: 'Reports & Planning' },
  { key: 'ai_brief', label: 'AI Brief', group: 'Reports & Planning' },

  // ── Organisation ──
  { key: 'projects', label: 'Projects', group: 'Organisation' },
  { key: 'team', label: 'Team', group: 'Organisation' },
  { key: 'bug_reports', label: 'Bug Reports', group: 'Organisation' },
]

export const PERMS = ['view', 'create', 'edit', 'delete', 'approve', 'export'] as const
export type PermKey = typeof PERMS[number]