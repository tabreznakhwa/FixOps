export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type UserRole = 'owner' | 'admin' | 'manager' | 'call_center' | 'technician' | 'accounts' | 'hr' | 'store'
export type UserStatus = 'pending' | 'active' | 'inactive' | 'rejected'
export type CustomerType = 'individual' | 'company' | 'amc' | 'one_time' | 'credit'
export type ComplaintStatus = 'new' | 'under_review' | 'assigned' | 'accepted' | 'on_the_way' | 'work_started' | 'waiting_parts' | 'waiting_approval' | 'completed' | 'verified' | 'invoiced' | 'paid' | 'cancelled' | 'reopened'
export type WorkOrderStatus = 'new' | 'assigned' | 'accepted' | 'on_the_way' | 'work_started' | 'waiting_parts' | 'waiting_approval' | 'completed' | 'verified' | 'invoiced' | 'paid' | 'cancelled'
export type PriorityLevel = 'low' | 'medium' | 'high' | 'emergency'
export type ServiceCategory = 'ac_maintenance' | 'plumbing' | 'electrical' | 'general' | 'emergency' | 'amc_visit' | 'installation' | 'inspection' | 'quotation'
export type InvoiceStatus = 'draft' | 'issued' | 'partial' | 'paid' | 'overdue' | 'cancelled' | 'written_off'
export type PaymentMode = 'cash' | 'bank_transfer' | 'card' | 'pos' | 'cheque' | 'online' | 'other'
export type PaymentStatus = 'unpaid' | 'partial' | 'paid' | 'overdue' | 'written_off'

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
          complaint_source: string
          service_category: ServiceCategory
          priority: PriorityLevel
          description: string
          preferred_date: string | null
          preferred_time: string | null
          location: string | null
          status: ComplaintStatus
          assigned_to: string | null
          work_order_id: string | null
          resolution_notes: string | null
          closed_at: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['complaints']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['complaints']['Insert']>
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
    }
    Enums: Record<string, never>
  }
}
