export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type UserRole = 'owner' | 'admin' | 'manager' | 'call_center' | 'technician' | 'accounts' | 'hr' | 'store' | 'attendance_kiosk'
export type LeaveType = 'annual_leave' | 'sick_leave' | 'compensation_leave'
export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'
export type UserStatus = 'pending' | 'active' | 'inactive' | 'rejected'
export type CustomerType = 'individual' | 'company' | 'amc' | 'one_time' | 'credit'
export type ComplaintStatus = 'new' | 'under_review' | 'assigned' | 'accepted' | 'on_the_way' | 'work_started' | 'waiting_parts' | 'waiting_approval' | 'completed' | 'verified' | 'invoiced' | 'paid' | 'cancelled' | 'reopened'
export type WorkOrderStatus = 'new' | 'assigned' | 'accepted' | 'on_the_way' | 'work_started' | 'waiting_parts' | 'waiting_approval' | 'completed' | 'verified' | 'invoiced' | 'paid' | 'cancelled'
export type PriorityLevel = 'low' | 'medium' | 'high' | 'emergency'
export type ServiceCategory = 'ac_maintenance' | 'plumbing' | 'electrical' | 'general' | 'emergency' | 'amc_visit' | 'installation' | 'inspection' | 'quotation'
export type InvoiceStatus = 'draft' | 'issued' | 'partial' | 'paid' | 'overdue' | 'cancelled' | 'written_off'
export type PaymentMode = 'cash' | 'bank_transfer' | 'card' | 'pos' | 'cheque' | 'online' | 'other'
export type PaymentStatus = 'unpaid' | 'partial' | 'paid' | 'overdue' | 'written_off'
export type AssetCondition = 'excellent' | 'good' | 'fair' | 'poor' | 'out_of_service'
export type AssetStatus = 'available' | 'assigned' | 'maintenance' | 'disposed'
export type AssetCategory = 'it_equipment' | 'tools_equipment' | 'vehicles' | 'furniture_fixtures' | 'machinery' | 'office_equipment' | 'leasehold_improvements' | 'safety_equipment' | 'other'
export type AssetPaymentMethod = 'cash' | 'bank_transfer' | 'cheque'
export type DisposalMethod = 'sold' | 'scrapped' | 'donated' | 'lost' | 'other'
export type AssetEventType = 'created' | 'updated' | 'assigned' | 'unassigned' | 'status_changed' | 'disposed'

export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string
          name: string
          slug: string
          logo_url: string | null
          email: string | null
          phone: string | null
          address: string | null
          city: string | null
          country: string
          currency: string
          timezone: string
          vat_number: string | null
          vat_rate: number
          language: string
          working_days: string[]
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['organizations']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['organizations']['Insert']>
      }
      users: {
        Row: {
          id: string
          organization_id: string | null
          full_name: string
          email: string
          phone: string | null
          role: UserRole
          status: UserStatus
          avatar_url: string | null
          language: string
          last_login_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['users']['Row'], 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['users']['Insert']>
      }
      customers: {
        Row: {
          id: string
          organization_id: string
          customer_code: string
          customer_type: CustomerType
          full_name: string
          company_name: string | null
          contact_person: string | null
          mobile_number: string
          whatsapp_number: string | null
          email: string | null
          address: string | null
          building_number: string | null
          area: string | null
          city: string | null
          map_location_url: string | null
          vat_number: string | null
          payment_terms: number
          credit_limit: number
          advance_balance: number
          status: string
          notes: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['customers']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['customers']['Insert']>
      }
      complaints: {
        Row: {
          id: string
          organization_id: string
          complaint_number: string
          customer_id: string
          title: string | null
          complaint_source: string
          service_category: ServiceCategory
          priority: PriorityLevel
          description: string
          preferred_date: string | null
          preferred_time: string | null
          location: string | null
          status: ComplaintStatus
          assigned_to: string | null
          assigned_staff_id: string | null
          technician_name: string | null
          visit_order: number | null
          work_order_id: string | null
          notes: string | null
          resolution_notes: string | null
          closed_at: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['complaints']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['complaints']['Insert']>
      }
      complaint_internal_notes: {
        Row: {
          id: string
          organization_id: string
          complaint_id: string
          note: string
          author_name: string
          created_by: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['complaint_internal_notes']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['complaint_internal_notes']['Insert']>
      }
      quotations: {
        Row: {
          id: string
          organization_id: string
          quotation_number: string
          customer_id: string
          work_order_id: string | null
          quotation_date: string
          valid_until: string | null
          status: string
          subtotal: number
          discount_amount: number
          tax_amount: number
          total_amount: number
          terms_and_conditions: string | null
          notes: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['quotations']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['quotations']['Insert']>
      }
      quotation_items: {
        Row: {
          id: string
          organization_id: string
          quotation_id: string
          description: string
          quantity: number
          unit_price: number
          total_price: number
          sort_order: number
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['quotation_items']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['quotation_items']['Insert']>
      }
      work_orders: {
        Row: {
          id: string
          organization_id: string
          work_order_number: string
          complaint_id: string | null
          customer_id: string
          service_category: ServiceCategory | null
          assigned_to: string | null
          scheduled_date: string | null
          scheduled_time: string | null
          priority: PriorityLevel
          job_description: string | null
          estimated_amount: number
          labour_charge: number
          visit_charge: number
          parts_charge: number
          discount_amount: number
          tax_amount: number
          final_amount: number
          status: WorkOrderStatus
          payment_status: PaymentStatus
          completion_notes: string | null
          verified_by: string | null
          verified_at: string | null
          invoice_id: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['work_orders']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['work_orders']['Insert']>
      }
      invoices: {
        Row: {
          id: string
          organization_id: string
          invoice_number: string
          customer_id: string
          work_order_id: string | null
          amc_contract_id: string | null
          quotation_id: string | null
          invoice_date: string
          due_date: string | null
          invoice_type: string
          subtotal: number
          discount_amount: number
          tax_rate: number
          tax_amount: number
          total_amount: number
          amount_paid: number
          balance_due: number
          status: InvoiceStatus
          terms_and_conditions: string | null
          notes: string | null
          cancelled_reason: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['invoices']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['invoices']['Insert']>
      }
      payments: {
        Row: {
          id: string
          organization_id: string
          payment_number: string
          customer_id: string
          invoice_id: string | null
          payment_date: string
          amount_received: number
          payment_mode: PaymentMode
          reference_number: string | null
          is_advance: boolean
          advance_used_amount: number
          notes: string | null
          is_cancelled: boolean
          cancelled_reason: string | null
          cancelled_by: string | null
          cancelled_at: string | null
          received_by: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['payments']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['payments']['Insert']>
      }
      inventory_items: {
        Row: {
          id: string
          organization_id: string
          item_code: string
          item_name: string
          category: string | null
          brand: string | null
          unit_of_measure: string
          current_stock: number
          minimum_stock_level: number
          purchase_price: number
          selling_price: number
          storage_location: string | null
          is_active: boolean
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['inventory_items']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['inventory_items']['Insert']>
      }
      amc_contracts: {
        Row: {
          id: string
          organization_id: string
          contract_number: string
          customer_id: string
          contract_type: string | null
          start_date: string
          end_date: string
          contract_amount: number
          billing_frequency: string
          services_included: string[] | null
          visits_included: number
          visits_used: number
          parts_included: boolean
          payment_terms: number
          status: string
          renewal_reminder_date: string | null
          document_url: string | null
          notes: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['amc_contracts']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['amc_contracts']['Insert']>
      }
      staff: {
        Row: {
          id: string
          organization_id: string
          user_id: string | null
          staff_code: string
          full_name: string
          email: string | null
          mobile_number: string | null
          emergency_contact: string | null
          department: string | null
          designation: string | null
          joining_date: string
          employment_status: string
          basic_salary: number
          housing_allowance: number
          transport_allowance: number
          other_allowance: number
          overtime_eligible: boolean
          overtime_rate: number
          labour_card_number: string | null
          emirates_id: string | null
          passport_number: string | null
          visa_expiry_date: string | null
          bank_name: string | null
          bank_account_number: string | null
          iban: string | null
          notes: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['staff']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['staff']['Insert']>
      }
      leave_applications: {
        Row: {
          id: string
          organization_id: string
          staff_id: string
          leave_type: LeaveType
          start_date: string
          end_date: string
          requested_days: number
          reason: string
          status: LeaveStatus
          idempotency_key: string | null
          active_period: string | null
          submitted_by: string
          reviewed_by: string | null
          reviewed_at: string | null
          review_note: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['leave_applications']['Row'], 'id' | 'status' | 'idempotency_key' | 'active_period' | 'reviewed_by' | 'reviewed_at' | 'review_note' | 'created_at' | 'updated_at'> & {
          status?: LeaveStatus
          idempotency_key?: string | null
          reviewed_by?: string | null
          reviewed_at?: string | null
          review_note?: string | null
        }
        Update: Partial<Database['public']['Tables']['leave_applications']['Insert']>
      }
      customer_ledger_entries: {
        Row: {
          id: string
          organization_id: string
          customer_id: string
          entry_date: string
          entry_type: string
          debit_amount: number
          credit_amount: number
          running_balance: number
          description: string
          reference_type: string | null
          reference_id: string | null
          created_by: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['customer_ledger_entries']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['customer_ledger_entries']['Insert']>
      }
      assets: {
        Row: {
          id: string
          organization_id: string
          asset_code: string
          asset_name: string
          category: string
          serial_number: string | null
          purchase_date: string | null
          purchase_cost: number
          assigned_to: string | null
          assigned_staff_id: string | null
          supplier_id: string | null
          payment_method: string | null
          purchase_reference: string | null
          location: string | null
          condition: AssetCondition
          warranty_expiry: string | null
          service_due_date: string | null
          status: AssetStatus
          depreciation_start_date: string | null
          useful_life_months: number | null
          salvage_value: number
          disposal_date: string | null
          disposal_method: string | null
          disposal_proceeds: number | null
          disposal_reason: string | null
          notes: string | null
          document_url: string | null
          created_by: string | null
          updated_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['assets']['Row'], 'id' | 'asset_code' | 'created_at' | 'updated_at'> & {
          id?: string
          asset_code?: string
        }
        Update: Partial<Database['public']['Tables']['assets']['Insert']>
      }
      asset_events: {
        Row: {
          id: string
          organization_id: string
          asset_id: string
          event_type: AssetEventType
          changes: Json
          created_by: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['asset_events']['Row'], 'id' | 'created_at'>
        Update: never
      }
      audit_logs: {
        Row: {
          id: string
          organization_id: string | null
          user_id: string | null
          action: string
          module_name: string
          table_name: string | null
          record_id: string | null
          old_value: Json | null
          new_value: Json | null
          ip_address: string | null
          user_agent: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['audit_logs']['Row'], 'id' | 'created_at'>
        Update: never
      }
    }
    Views: Record<string, never>
    Functions: {
      generate_sequence_number: {
        Args: { p_org_id: string; p_type: string; p_prefix?: string }
        Returns: string
      }
      get_user_organization_id: {
        Args: Record<string, never>
        Returns: string
      }
      get_user_role: {
        Args: Record<string, never>
        Returns: string
      }
      count_leave_working_days: {
        Args: {
          p_org_id: string
          p_start_date: string
          p_end_date: string
        }
        Returns: number
      }
      submit_leave_application: {
        Args: {
          p_org_id: string
          p_staff_id: string
          p_submitter_id: string
          p_leave_type: LeaveType
          p_start_date: string
          p_end_date: string
          p_reason: string
          p_idempotency_key?: string | null
        }
        Returns: Array<{
          application: Database['public']['Tables']['leave_applications']['Row']
          created: boolean
        }>
      }
      review_leave_application: {
        Args: {
          p_application_id: string
          p_org_id: string
          p_reviewer_id: string
          p_decision: 'approved' | 'rejected'
          p_review_note?: string | null
        }
        Returns: Array<{
          application: Database['public']['Tables']['leave_applications']['Row']
          changed: boolean
        }>
      }
      settle_leave_salary: {
        Args: {
          p_org_id: string
          p_paid_by: string
          p_staff_id: string
          p_settlement_date: string
          p_amount: number
          p_expected_balance: number
          p_payment_method?: string
          p_notes?: string | null
        }
        Returns: Array<{
          advance_id: string
          balance_after: number
        }>
      }
      update_staff_profile_with_opening_balance: {
        Args: {
          p_org_id: string
          p_updated_by: string
          p_staff_id: string
          p_expected_opening_advance: number
          p_expected_opening_loan: number
          p_updates: Json
        }
        Returns: undefined
      }
      process_payroll: {
        Args: {
          p_org_id: string
          p_processed_by: string
          p_month: number
          p_year: number
          p_manual_entries?: Json
        }
        Returns: string
      }
      reset_payroll_run: {
        Args: {
          p_org_id: string
          p_reset_by: string
          p_run_id: string
        }
        Returns: undefined
      }
      pay_salary_run: {
        Args: {
          p_org_id: string
          p_paid_by: string
          p_run_id: string
          p_payment_date: string
          p_entries: Json
        }
        Returns: undefined
      }
      create_asset_with_expense: {
        Args: {
          p_org_id: string
          p_actor_id: string
          p_asset_id: string
          p_asset_name: string
          p_category: string
          p_purchase_date: string
          p_purchase_cost: number
          p_payment_method: string
          p_useful_life_months: number
          p_depreciation_start_date: string
          p_salvage_value?: number
          p_serial_number?: string | null
          p_supplier_id?: string | null
          p_purchase_reference?: string | null
          p_location?: string | null
          p_assigned_staff_id?: string | null
          p_warranty_expiry?: string | null
          p_service_due_date?: string | null
          p_condition?: string
          p_status?: string
          p_notes?: string | null
        }
        Returns: Array<{
          asset_id: string
          expense_id: string
          asset_code: string
          created: boolean
        }>
      }
      update_asset: {
        Args: {
          p_org_id: string
          p_actor_id: string
          p_asset_id: string
          p_expected_updated_at: string
          p_asset_name: string
          p_category: string
          p_purchase_date: string
          p_purchase_cost: number
          p_payment_method: string
          p_useful_life_months: number
          p_depreciation_start_date: string
          p_salvage_value: number
          p_serial_number: string | null
          p_supplier_id: string | null
          p_purchase_reference: string | null
          p_location: string | null
          p_assigned_staff_id: string | null
          p_warranty_expiry: string | null
          p_service_due_date: string | null
          p_condition: string
          p_status: string
          p_notes: string | null
          p_disposal_date: string | null
          p_disposal_method: string | null
          p_disposal_proceeds: number | null
          p_disposal_reason: string | null
        }
        Returns: Array<{
          asset_id: string
          expense_id: string
          updated_at: string
          changed: boolean
          history_event_type: string
        }>
      }
    }
    Enums: Record<string, never>
  }
}
