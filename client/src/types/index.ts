export interface InventoryItem {
  id: string;
  name: string;
  unit: string;
  current_stock_grams: number;
  reorder_threshold_grams: number;
  cost_per_gram: number;
  notes?: string;
  is_low_stock?: boolean;
  created_at: string;
  updated_at: string;
}

export interface RecipeItem {
  id?: string;
  inventory_item_id: string;
  inventory_name?: string;
  quantity_grams: number;
  cost_per_gram?: number;
  item_cost?: number;
  notes?: string;
}

export interface Service {
  id: string;
  name: string;
  price: number;
  description?: string;
  category?: string;
  egs_code?: string;
  media_url?: string;
  media_type?: 'none' | 'image' | 'video';
  status: 'active' | 'inactive';
  recipes?: RecipeItem[];
  estimated_material_cost?: number;
  created_at: string;
  updated_at: string;
}


export interface Employee {
  id: string;
  name: string;
  phone?: string;
  role: string;
  hourly_rate: number;
  overtime_hourly_rate?: number | null;
  target_weekly_days: number;
  target_weekly_hours: number;
  weekly_off_day?: string;
  is_paid_weekly_off?: boolean;
  pin_code?: string;
  status: 'active' | 'inactive' | 'on_leave';
  hire_date?: string;
  created_at: string;
  updated_at?: string;
}

export interface Order {
  id: string;
  order_code: string;
  car_plate?: string;
  car_type?: string;
  customer_name?: string;
  customer_phone?: string;
  service_id: string;
  service_name?: string;
  service_egs_code?: string;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  payment_method: 'cash' | 'card' | 'transfer' | 'split';
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  assigned_employee_id?: string;
  assigned_employee_name?: string;
  eta_uuid?: string;
  eta_submission_id?: string;
  eta_status?: 'not_synced' | 'pending' | 'valid' | 'invalid' | 'failed';
  eta_share_url?: string;
  eta_synced_at?: string;
  eta_error_message?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface Attendance {
  id: string;
  employee_id: string;
  employee_name?: string;
  employee_role?: string;
  work_date: string;
  check_in: string;
  check_out?: string;
  actual_hours: number;
  overtime_hours: number;
  deducted_hours: number;
  notes?: string;
  created_at: string;
}

export interface EmployeeTransaction {
  id: string;
  employee_id: string;
  employee_name?: string;
  type: 'advance' | 'bonus' | 'deduction';
  amount: number;
  date: string;
  notes?: string;
  status: 'pending' | 'settled' | 'cancelled';
  created_at: string;
}

export interface PayrollCalculation {
  employee: {
    id: string;
    name: string;
    role: string;
    hourly_rate: number;
    overtime_hourly_rate?: number | null;
    target_weekly_days?: number;
    target_weekly_hours?: number;
    weekly_off_day?: string;
    is_paid_weekly_off?: boolean;
    pin_code?: string;
  };
  period: {
    start: string;
    end: string;
  };
  work_metrics: {
    attendance_days: number;
    total_hours_worked: number;
    paid_weekly_off_days?: number;
    paid_weekly_off_hours?: number;
    total_overtime_hours: number;
    total_deducted_hours: number;
  };
  financial_breakdown: {
    attended_hours_amount?: number;
    paid_weekly_off_amount?: number;
    base_salary_amount: number;
    overtime_amount: number;
    effective_overtime_rate?: number;
    bonuses_amount: number;
    hours_deduction_amount?: number;
    penalty_deductions_amount?: number;
    deductions_amount: number;
    advances_deducted: number;
    net_payable_salary: number;
    is_debt?: boolean;
    carried_debt_amount?: number;
  };
  pending_transactions: EmployeeTransaction[];
}

export interface PayrollPayout {
  id: string;
  payout_code: string;
  employee_id: string;
  employee_name?: string;
  period_start: string;
  period_end: string;
  total_hours_worked: number;
  base_salary_amount: number;
  overtime_amount: number;
  bonuses_amount: number;
  deductions_amount: number;
  advances_deducted: number;
  net_paid: number;
  payment_date: string;
  payment_method: string;
  notes?: string;
  created_at: string;
}

export interface DashboardStats {
  today: {
    today_orders_count: number;
    today_revenue: number;
    today_completed_washes: number;
    today_in_progress: number;
  };
  all_time: {
    total_all_time_orders: number;
    total_all_time_revenue: number;
  };
  inventory: {
    low_stock_count: number;
    low_stock_items: InventoryItem[];
  };
  hr: {
    active_employees_count: number;
    attended_today_count: number;
  };
  top_services: Array<{
    id: string;
    name: string;
    total_orders: number;
    total_revenue: number;
  }>;
  recent_orders: Order[];
  cashier_sales?: Array<{
    cashier_id: string;
    cashier_name: string;
    cashier_role: string;
    orders_count: number;
    total_sales: number;
    cash_sales: number;
    card_sales: number;
    transfer_sales: number;
  }>;
  generated_at: string;
}

export interface TaxSettings {
  id?: string;
  is_enabled: boolean;
  eta_sync_enabled?: boolean;
  environment: 'preprod' | 'production';
  client_id?: string | null;
  client_secret?: string | null;
  tax_registration_number?: string | null;
  pos_serial?: string | null;
  branch_code?: string;
  pos_os_version?: string;
  remote_signer_url?: string | null;
  remote_signer_token?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface TaxStats {
  orders: {
    total_orders: number;
    synced_valid_count: number;
    pending_count: number;
    failed_count: number;
    not_synced_count: number;
  };
  queue: {
    total_queue_items: number;
    queue_pending: number;
    queue_processing: number;
    queue_failed: number;
  };
}

export interface EtaQueueItem {
  id: string;
  order_id: string;
  status: 'pending' | 'processing' | 'synced' | 'failed';
  attempts: number;
  last_attempt_at?: string;
  next_retry_at?: string;
  error_log?: string;
  created_at: string;
  updated_at: string;
  order_code?: string;
  customer_name?: string;
  total_amount?: number;
  eta_status?: string;
  eta_uuid?: string;
  service_name?: string;
}

export interface PosSettings {
  id?: string;
  pos_background_url?: string | null;
  pos_background_type: 'none' | 'image' | 'video';
  pos_background_opacity: number;
  primary_color?: string;
  secondary_color?: string;
  accent_color?: string;
  card_bg_color?: string;
  border_color?: string;
  app_bg_color?: string;
  header_bg_color?: string;
  created_at?: string;
  updated_at?: string;
}

export interface MonthlyVatReport {
  period: string;
  year: number;
  month: number;
  tax_rate_percent: number;
  tax_registration_number: string;
  branch_code: string;
  eta_sync_enabled: boolean;
  summary: {
    total_orders_count: number;
    valid_orders_count: number;
    cancelled_orders_count: number;
    total_sales_gross: number;
    total_taxable_base: number;
    total_vat_14: number;
    cancelled_total_amount: number;
    eta_valid_count: number;
    eta_valid_vat: number;
    eta_pending_count: number;
    eta_failed_count: number;
    eta_not_synced_count: number;
  };
  payment_breakdown: Array<{
    payment_method: string;
    count: number;
    total_gross: number;
    total_net: number;
    total_vat: number;
  }>;
  service_breakdown: Array<{
    id: string;
    name: string;
    category?: string;
    egs_code?: string;
    orders_count: number;
    total_gross: number;
    total_net: number;
    total_vat: number;
  }>;
  invoices: Array<{
    id: string;
    order_code: string;
    car_plate?: string;
    car_type?: string;
    customer_name?: string;
    customer_phone?: string;
    service_name?: string;
    egs_code?: string;
    payment_method: string;
    subtotal: number;
    tax_amount: number;
    total_amount: number;
    status: string;
    eta_status: string;
    eta_uuid?: string;
    eta_share_url?: string;
    created_at: string;
  }>;
  generated_at: string;
}

export interface MaterialConsumptionReport {
  period: string;
  year: number;
  month: number;
  total_completed_washes: number;
  total_grams_consumed: number;
  total_cost_egp: number;
  materials: Array<{
    id: string;
    name: string;
    unit: string;
    cost_per_gram: number;
    current_stock_grams: number;
    reorder_threshold_grams: number;
    is_low_stock: boolean;
    total_consumed_grams: number;
    total_consumed_cost: number;
    washes_count: number;
  }>;
  service_consumption: Array<{
    service_id: string;
    service_name: string;
    item_id: string;
    item_name: string;
    recipe_grams_per_wash: number;
    completed_washes_count: number;
    total_grams_consumed: number;
    total_cost_egp: number;
  }>;
  detailed_logs: Array<{
    order_id: string;
    order_code: string;
    car_plate?: string;
    car_type?: string;
    created_at: string;
    service_name: string;
    item_id: string;
    item_name: string;
    quantity_grams: number;
    cost_egp: number;
  }>;
  generated_at: string;
}

export interface Expense {
  id: string;
  title: string;
  category: 'إيجار' | 'كهرباء ومياه' | 'صيانة ومعدات' | 'أدوات ومواد نظافة' | 'بوفيه ومصاريف إدارية' | 'ضرائب ورسوم' | 'أخرى';
  amount: number;
  expense_date: string;
  payment_method: 'cash' | 'card' | 'transfer';
  receipt_reference?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateExpenseInput {
  title: string;
  category?: string;
  amount: number;
  expense_date?: string;
  payment_method?: 'cash' | 'card' | 'transfer';
  receipt_reference?: string;
  notes?: string;
}

export interface PnLSummary {
  period: string;
  year: number;
  month: number;
  financials: {
    gross_revenue: number;
    net_taxable_revenue: number;
    total_vat_collected: number;
    total_salaries: number;
    total_expenses: number;
    total_operating_costs: number;
    net_profit: number;
    profit_margin: number;
    is_profitable: boolean;
    cash_net_profit?: number;
    cash_profit_margin?: number;
    accrual_net_profit?: number;
    accrual_profit_margin?: number;
  };
  revenue_metrics: {
    total_orders: number;
    valid_orders: number;
    cancelled_orders: number;
    cash_revenue: number;
    card_revenue: number;
    transfer_revenue: number;
  };
  payroll_metrics: {
    payouts_count: number;
    base_salaries: number;
    overtime_paid: number;
    bonuses_paid: number;
    disbursed_salaries?: number;
    disbursed_payouts_count?: number;
    accrued_salaries?: number;
    active_staff_count?: number;
    unpaid_accrued_salaries?: number;
  };
  expenses_metrics: {
    expenses_count: number;
    cash_expenses: number;
    card_expenses: number;
    transfer_expenses: number;
    categories_breakdown: Array<{
      category: string;
      count: number;
      total_amount: number;
      percentage: number;
    }>;
  };
  six_months_trend: Array<{
    month: string;
    revenue: number;
    payroll: number;
    expenses: number;
    net_profit: number;
  }>;
  generated_at: string;
}

