// Backend javoblari turlari (backend/apps/*/serializers.py bilan bir xil).
export type Money = string
export type Currency = 'USD' | 'UZS'

export interface Page<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

export interface Position {
  id: number
  code: string
  name: string
  is_team_share: boolean
}

export interface ClientAccess {
  id: number
  name: string
  role: string
  can_see_payments: boolean
  tariff: string | null
  features: string[]
}

export interface Me {
  id: number
  phone: string
  email: string
  full_name: string
  role: string
  role_label: string
  positions: Position[]
  permissions: string[]
  is_client: boolean
  clients: ClientAccess[]
}

export interface StaffUser {
  id: number
  phone: string
  full_name: string
  role: string
  role_label: string
  positions: Position[]
  is_active: boolean
  last_login: string | null
}

export interface Invite {
  id: number
  phone: string
  full_name: string
  role: string
  client: number | null
  created_at: string
  expires_at: string
  accepted_at: string | null
  is_usable: boolean
  link: string | null
}

export interface TariffVersion {
  id: number
  tariff: number
  price: Money
  currency: Currency
  valid_from: string
  revisions_per_item: number
  panel_features: string[]
  limits: { content_kind: string; quantity: number }[]
  notes: string
}

export interface Tariff {
  id: number
  code: string
  name: string
  description: string
  is_active: boolean
  current_version: TariffVersion | null
  versions: TariffVersion[]
}

export interface Service {
  id: number
  name: string
  unit: string
  unit_label: string
  price: Money | null
  currency: Currency
  price_negotiable: boolean
}

export interface Contact {
  id: number
  client: number
  full_name: string
  position: string
  phone: string
  email: string
  is_primary: boolean
}

export interface SocialAccount {
  id: number
  client: number
  platform: string
  platform_label: string
  username: string
  url: string
  followers_start: number
}

export interface Client {
  id: number
  name: string
  niche: string
  niche_label: string
  city: string
  status: string
  status_label: string
  source: string
  notes?: string
  contacts: Contact[]
  social_accounts: SocialAccount[]
  active_project: { id: number; tariff: string; price: Money; currency: Currency } | null
  created_at: string
}

export interface Assignment {
  id: number
  project: number
  user: number
  user_name: string
  position: number
  position_detail: Position
  share_percent: Money | null
  started_at: string
  ended_at: string | null
}

export interface Project {
  id: number
  client: number
  client_name: string
  tariff_version: number
  tariff_name: string
  title: string
  price?: Money
  currency: Currency
  discount_percent?: Money
  monthly_amount?: Money
  start_date: string
  end_date: string | null
  status: string
  status_label: string
  contract_number: string
  assignments: Assignment[]
  limits: Record<string, number>
}

export interface Version {
  id: number
  number: number
  file_url: string | null
  file_name: string | null
  link: string
  note: string
  client_visible: boolean
  uploaded_by_name: string | null
  created_at: string
}

export interface Approval {
  id: number
  version_number: number
  decision: 'approved' | 'changes'
  comment: string
  timecode: string
  decided_by_name: string
  created_at: string
}

export interface Comment {
  id: number
  body: string
  is_internal: boolean
  author_name: string
  created_at: string
}

export interface ContentItem {
  id: number
  project: number
  project_title: string
  client_name: string
  kind: string
  kind_label: string
  title: string
  caption: string
  internal_notes: string
  planned_date: string | null
  status: string
  status_label: string
  published_at: string | null
  published_url: string
  revisions_used: number
  revisions_left: number
  latest_version: Version | null
  versions?: Version[]
  approvals?: Approval[]
  comments?: Comment[]
}

export interface Task {
  id: number
  project: number
  client_name: string
  content_item: number | null
  content_title: string | null
  title: string
  description: string
  assignee: number | null
  assignee_name: string | null
  due_date: string | null
  status: string
  status_label: string
  priority: string
  is_overdue: boolean
}

export interface WorkLogEntry {
  id: number
  user: number
  user_name: string
  project: number
  client_name: string
  date: string
  kind: string
  kind_label: string
  quantity: number
  title: string
  link: string
  internal_note: string
  source_label: string
  status: string
  status_label: string
  client_visible: boolean
  created_at: string
}

export interface InvoiceLine {
  id: number
  kind: string
  description: string
  quantity: Money
  unit_price: Money
  amount: Money
}

export interface Invoice {
  id: number
  number: string
  project: number
  client_id: number
  client_name: string
  tariff_name: string
  period_start: string
  period_end: string
  currency: Currency
  total: Money
  transit_total: Money
  paid_amount: Money
  outstanding: Money
  due_date: string
  issued_at: string | null
  status: string
  status_label: string
  lines: InvoiceLine[]
}

export interface Payment {
  id: number
  client: number
  client_name: string
  amount: Money
  currency: Currency
  rate_to_uzs: Money
  amount_uzs: Money
  method: string
  method_label: string
  paid_on: string
  note: string
  allocations: { id: number; invoice: number; invoice_number: string; amount: Money }[]
  unallocated_amount: Money
  cancelled_at: string | null
  cancel_reason: string
}

export interface Expense {
  id: number
  category: number
  category_name: string
  amount: Money
  currency: Currency
  amount_uzs: Money
  spent_on: string
  description: string
  status: string
  status_label: string
  created_by_name: string | null
  cancelled_at: string | null
}

export interface ExpenseCategory {
  id: number
  name: string
}

export interface CompensationRule {
  id: number
  position: number
  position_name: string
  percent: Money
  valid_from: string
  tariff: number | null
  tariff_name: string | null
  project: number | null
  project_title: string | null
  scope: 'global' | 'tariff' | 'project'
  note: string
}

export interface SheetRow {
  user_id: number
  full_name: string
  accrued_uzs: Money
  adjustments_uzs: Money
  payable_uzs: Money
  paid_uzs: Money
  remaining_uzs: Money
  items: number
}

export interface PayrollSheet {
  year: number
  month: number
  status: 'draft' | 'approved' | 'paid'
  status_label: string
  rows: SheetRow[]
}

export interface MyPayroll {
  month: string
  total_uzs: Money
  accruals: {
    client_name: string
    position_name: string
    base_amount: Money
    percent: Money
    amount: Money
    currency: Currency
    amount_uzs: Money
    accrued_on: string
    status_label: string
  }[]
  adjustments: { kind_label: string; amount_uzs: Money; reason: string }[]
}

export interface Notification {
  id: number
  kind: string
  title: string
  body: string
  link: string
  created_at: string
  read_at: string | null
}
