import { PrintActions } from '@/components/print/PrintActions'
import { Header } from '@/components/layout/Header'

export const metadata = { title: 'User Guide' }

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="bg-slate-800 px-6 py-4">
        <h2 className="text-base font-bold text-white">{title}</h2>
      </div>
      <div className="px-6 py-5 space-y-3 text-sm text-slate-700 leading-relaxed">{children}</div>
    </section>
  )
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white text-xs font-bold rounded-full flex items-center justify-center mt-0.5">{n}</span>
      <p>{children}</p>
    </div>
  )
}

function Sub({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">{title}</h3>
      <div className="space-y-2 pl-2 border-l-2 border-slate-100">{children}</div>
    </div>
  )
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-2.5 text-xs text-blue-800">
      <strong>Tip:</strong> {children}
    </div>
  )
}

export default function UserGuidePage() {
  return (
    <div className="animate-fade-in">
      <Header
        title="User Guide"
        subtitle="Complete guide to using the system — click Print PDF to save"
        actions={<PrintActions label="Print PDF" />}
      />

      <div className="p-6 max-w-4xl space-y-6 print:p-4 print:space-y-4">

        {/* Cover */}
        <div className="bg-slate-900 rounded-2xl p-8 text-white print:rounded-none">
          <h1 className="text-3xl font-bold mb-2">FixOps — User Guide</h1>
          <p className="text-slate-400 text-sm">Maintenance Management System · Complete reference for all modules</p>
          <p className="text-slate-500 text-xs mt-4">Version 1.0 · {new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</p>
        </div>

        {/* Table of Contents */}
        <Section id="toc" title="Table of Contents">
          {[
            ['1', 'Getting Started — Login & Dashboard'],
            ['2', 'Operations — Complaints & Work Orders'],
            ['3', 'Customers'],
            ['4', 'Finance — Invoices & Payments'],
            ['5', 'Finance — Cash Book & Bank Book'],
            ['6', 'Finance — Receivables & Ledger'],
            ['7', 'AMC Contracts'],
            ['8', 'Inventory Management'],
            ['9', 'Suppliers & Purchase Orders'],
            ['10', 'Vendor Payments'],
            ['11', 'HR — Staff Management'],
            ['12', 'Attendance'],
            ['13', 'Payroll & Payslips'],
            ['14', 'Reports'],
            ['15', 'Settings'],
          ].map(([n, label]) => (
            <div key={n} className="flex items-baseline gap-2 py-1 border-b border-slate-50">
              <span className="text-xs font-bold text-blue-600 w-6">{n}.</span>
              <span>{label}</span>
            </div>
          ))}
        </Section>

        {/* 1. Getting Started */}
        <Section id="s1" title="1. Getting Started — Login & Dashboard">
          <Sub title="Logging In">
            <Step n={1}>Navigate to the system URL in your browser. You will see the login screen.</Step>
            <Step n={2}>Enter your email address and password, then click <strong>Sign In</strong>.</Step>
            <Step n={3}>New users who register must wait for an Admin to approve their account before they can log in.</Step>
          </Sub>
          <Sub title="Dashboard">
            <p>The Dashboard gives you a real-time overview of the business: open complaints, pending work orders, outstanding receivables, recent invoices, and inventory alerts. It updates automatically whenever data changes.</p>
          </Sub>
          <Sub title="Navigation">
            <p>The left sidebar is divided into sections: <strong>Operations, Finance, Inventory &amp; Assets, HR &amp; Payroll, Reports,</strong> and <strong>System</strong>. Click any item to navigate to that module. On mobile, tap the menu icon at the top-left.</p>
          </Sub>
          <Tip>Your role controls which modules you can access. Contact your Admin if you cannot see a module you need.</Tip>
        </Section>

        {/* 2. Operations */}
        <Section id="s2" title="2. Operations — Complaints & Work Orders">
          <Sub title="Logging a Complaint">
            <Step n={1}>Click <strong>Complaints</strong> in the sidebar, then click <strong>New Complaint</strong>.</Step>
            <Step n={2}>Select the customer, enter the complaint description, priority (Low / Medium / High / Critical), and category (AC, Plumbing, Electrical, etc.).</Step>
            <Step n={3}>Click <strong>Submit</strong>. The complaint is logged and appears in the complaints list.</Step>
          </Sub>
          <Sub title="Managing Complaints">
            <p>Click any complaint to view its full details. You can update the status (Open → In Progress → Resolved → Closed), add notes, and convert it directly to a Work Order.</p>
          </Sub>
          <Sub title="Work Orders">
            <Step n={1}>Click <strong>Work Orders</strong> then <strong>New Work Order</strong>.</Step>
            <Step n={2}>Fill in the customer, description, assigned technician, scheduled date, and parts used.</Step>
            <Step n={3}>As work progresses, update the status through: Pending → In Progress → Completed → Invoiced.</Step>
            <Step n={4}>Once work is completed, create an invoice directly from the Work Order.</Step>
          </Sub>
          <Tip>Work Orders can be linked to an existing Complaint or created independently.</Tip>
        </Section>

        {/* 3. Customers */}
        <Section id="s3" title="3. Customers">
          <Sub title="Adding a Customer">
            <Step n={1}>Click <strong>Customers</strong> → <strong>New Customer</strong>.</Step>
            <Step n={2}>Enter name, contact number, email, and billing address. Click <strong>Save</strong>.</Step>
          </Sub>
          <Sub title="Customer Profile">
            <p>Each customer has a profile showing all their complaints, work orders, invoices, payments, and the current outstanding balance. Use the search bar at the top to quickly find a customer.</p>
          </Sub>
        </Section>

        {/* 4. Finance — Invoices & Payments */}
        <Section id="s4" title="4. Finance — Invoices & Payments">
          <Sub title="Creating an Invoice">
            <Step n={1}>Go to <strong>Finance → Invoices</strong> → <strong>New Invoice</strong>.</Step>
            <Step n={2}>Select the customer and invoice date. Add line items (description, quantity, unit price). Apply any discounts or VAT as needed.</Step>
            <Step n={3}>Click <strong>Save Invoice</strong>. The invoice is generated with a unique invoice number.</Step>
            <Step n={4}>To print or save as PDF, open the invoice and click <strong>Print PDF</strong>.</Step>
          </Sub>
          <Sub title="Recording a Payment">
            <Step n={1}>Go to <strong>Finance → Payments</strong> → <strong>New Payment</strong>.</Step>
            <Step n={2}>Select the customer and invoice, enter the amount received, payment mode (Cash, Bank Transfer, Cheque, etc.), and date.</Step>
            <Step n={3}>Click <strong>Record Payment</strong>. The invoice balance updates automatically.</Step>
          </Sub>
          <Tip>Partial payments are supported. Record multiple payments against the same invoice until it is fully paid.</Tip>
        </Section>

        {/* 5. Cash Book & Bank Book */}
        <Section id="s5" title="5. Finance — Cash Book & Bank Book">
          <p>These pages are <strong>fully automatic</strong> — they aggregate all transactions in the system:</p>
          <ul className="list-disc pl-5 space-y-1 text-sm">
            <li><strong>Cash Book</strong>: Shows all cash receipts (from customers) and cash payments (to suppliers, salary payments in cash). Running balance is calculated row-by-row.</li>
            <li><strong>Bank Book</strong>: Shows all bank-mode transactions (Bank Transfer, Cheque, POS, Online, Card) — customer receipts, vendor payments, and salary payments.</li>
          </ul>
          <p className="mt-2">Use the <strong>From / To</strong> date filters to view any date range. Click <strong>Print</strong> to export as PDF with the company letterhead.</p>
          <Tip>No manual entry is needed in Cash Book or Bank Book. Everything flows in automatically when you record payments, vendor payments, or mark salaries as paid.</Tip>
        </Section>

        {/* 6. Receivables & Ledger */}
        <Section id="s6" title="6. Finance — Receivables & Ledger">
          <Sub title="Receivables">
            <p>Shows all outstanding invoices — what customers owe you. Colour-coded by payment status: green (current), amber (partial), red (overdue).</p>
          </Sub>
          <Sub title="Customer Ledger">
            <p>Full account statement per customer — every invoice and payment in chronological order with a running balance. Use the customer filter to view a single customer's history.</p>
          </Sub>
          <Sub title="Bill-wise Outstanding">
            <p>A consolidated view of unpaid invoices grouped by customer. Useful for collections follow-up.</p>
          </Sub>
        </Section>

        {/* 7. AMC Contracts */}
        <Section id="s7" title="7. AMC Contracts">
          <Sub title="Creating an AMC Contract">
            <Step n={1}>Go to <strong>AMC Contracts</strong> → <strong>New Contract</strong>.</Step>
            <Step n={2}>Select the customer, contract type, start/end dates, and contract amount. Specify visit frequency and number of included visits.</Step>
            <Step n={3}>Save. The contract is tracked and you can log visits against it.</Step>
          </Sub>
          <p>Contracts nearing expiry are flagged on the Dashboard.</p>
        </Section>

        {/* 8. Inventory */}
        <Section id="s8" title="8. Inventory Management">
          <Sub title="Adding an Item">
            <Step n={1}>Go to <strong>Inventory</strong> → <strong>New Item</strong>.</Step>
            <Step n={2}>Enter item name, category, unit of measure, reorder level, and opening stock.</Step>
          </Sub>
          <Sub title="Stock Movements">
            <p>Stock levels update automatically when:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Purchase Order is received</strong> — stock increases by quantity received</li>
              <li><strong>Parts used in Work Order</strong> — stock decreases</li>
            </ul>
          </Sub>
          <Sub title="Stock Trial Balance">
            <p>Go to <strong>Stock Trial</strong> to see all items with their opening stock, purchases, issues, and closing balance for any date range.</p>
          </Sub>
          <Tip>Items below reorder level are highlighted in red on the Inventory page.</Tip>
        </Section>

        {/* 9. Suppliers & POs */}
        <Section id="s9" title="9. Suppliers & Purchase Orders">
          <Sub title="Adding a Supplier">
            <Step n={1}>Go to <strong>Suppliers &amp; PO</strong> → <strong>New Supplier</strong>.</Step>
            <Step n={2}>Enter supplier name, code, contact person, phone, email, and payment terms.</Step>
          </Sub>
          <Sub title="Creating a Purchase Order">
            <Step n={1}>Click <strong>New PO</strong> on the Suppliers page.</Step>
            <Step n={2}>Select the supplier and add line items: description, category (AC/HVAC, Electrical, Plumbing, etc.), quantity, and unit price.</Step>
            <Step n={3}>Click <strong>Create PO</strong>. The PO is saved with status <em>Draft</em>.</Step>
          </Sub>
          <Sub title="Receiving Goods">
            <Step n={1}>Open the PO → click <strong>Receive Goods</strong>.</Step>
            <Step n={2}>Enter the quantity received for each item and click <strong>Confirm Receipt</strong>.</Step>
            <Step n={3}>Inventory automatically updates. If the item doesn't exist in inventory, it is created automatically.</Step>
          </Sub>
          <Sub title="Purchase Register">
            <p>Go to <strong>Purchase Register</strong> to see all POs with their totals, amount paid, and outstanding balance.</p>
          </Sub>
        </Section>

        {/* 10. Vendor Payments */}
        <Section id="s10" title="10. Vendor Payments">
          <Sub title="Recording a Payment">
            <Step n={1}>Go to <strong>Vendor Payments</strong> → <strong>Record Payment</strong>.</Step>
            <Step n={2}>Select the supplier and optionally link to a specific PO. The outstanding balance auto-fills.</Step>
            <Step n={3}>Enter the amount, payment mode, reference/cheque number, and date. Click <strong>Record Payment</strong>.</Step>
            <Step n={4}>The PO balance updates automatically and the payment appears in the Bank Book or Cash Book depending on the payment mode.</Step>
          </Sub>
          <Tip>You can also record a payment directly from the PO detail page using the "Record Vendor Payment" button.</Tip>
        </Section>

        {/* 11. HR — Staff */}
        <Section id="s11" title="11. HR — Staff Management">
          <Sub title="Adding a Staff Member">
            <Step n={1}>Go to <strong>Staff</strong> → <strong>New Staff</strong>.</Step>
            <Step n={2}>Fill in: full name, designation, department, joining date, and salary details (basic, housing, transport, food, other allowances).</Step>
            <Step n={3}>Add document details: passport number & expiry, visa number & expiry, Emirates/Civil ID.</Step>
            <Step n={4}>Add bank details for salary transfer (bank name, IBAN).</Step>
          </Sub>
          <Sub title="Editing a Profile">
            <p>Click any staff member to open their profile. Use the <strong>Edit Profile</strong> section at the bottom to update any information. Click <strong>Save Changes</strong>.</p>
          </Sub>
          <Sub title="Document Expiry Alerts">
            <p>When a visa or passport is expiring within 60 days, an amber warning banner appears on the staff profile. Plan renewals early.</p>
          </Sub>
        </Section>

        {/* 12. Attendance */}
        <Section id="s12" title="12. Attendance">
          <Sub title="Marking Attendance">
            <Step n={1}>Go to <strong>Attendance</strong> → <strong>Mark Attendance</strong>.</Step>
            <Step n={2}>Select the staff member, date, and status: Present, Absent, Half Day, or Leave.</Step>
            <Step n={3}>For Present/Half Day, enter Check In and Check Out times. The system automatically calculates regular hours, fixed overtime (5:30–8:00 PM), and normal overtime (after 8 PM).</Step>
            <Step n={4}>Click <strong>Save Attendance</strong>.</Step>
          </Sub>
          <Sub title="Viewing Records">
            <p>The main Attendance page shows all records for the current month. Use the month selector and staff filter to drill down. Summary cards show total Present, Absent, Half Day, and Leave counts.</p>
          </Sub>
          <Tip>Overtime worked between 5:30 PM and 8:00 PM is tracked as Fixed Overtime — the monthly fixed OT amount is set in each staff member's profile.</Tip>
        </Section>

        {/* 13. Payroll */}
        <Section id="s13" title="13. Payroll & Payslips">
          <Sub title="Processing Payroll">
            <Step n={1}>Go to <strong>Payslips</strong> → select the month and year → click <strong>Process X Payslips</strong>.</Step>
            <Step n={2}>The system generates payslips for all active employees based on their salary structure.</Step>
            <Step n={3}>Review the summary table showing Basic, Allowances, Overtime, Deductions, and Net pay per employee.</Step>
          </Sub>
          <Sub title="Marking Salaries as Paid">
            <Step n={1}>After processing, click <strong>Pay X Salaries</strong> button (green, top right).</Step>
            <Step n={2}>Select the payment mode (Bank Transfer, Cheque, or Cash) and payment date.</Step>
            <Step n={3}>Click <strong>Confirm Payment</strong>. All payslips are marked as paid and the transactions appear in the Bank Book or Cash Book automatically.</Step>
          </Sub>
          <Sub title="Printing a Payslip">
            <p>Click the <strong>Print</strong> link next to any employee in the Payslips table. The payslip opens in a print-friendly view. Click <strong>Print PDF</strong> to save or print it.</p>
          </Sub>
        </Section>

        {/* 14. Reports */}
        <Section id="s14" title="14. Reports">
          <p>Go to <strong>Reports</strong> to access the Finance Report dashboard. Select a date range using the tabs at the top:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>This Month / Last Month</strong> — for monthly review</li>
            <li><strong>This Quarter</strong> — for quarterly review</li>
            <li><strong>This Year</strong> — for annual overview</li>
            <li><strong>All Time</strong> — full history</li>
          </ul>
          <Sub title="What's Included">
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>KPI Cards</strong>: Total Invoiced, Total Collected, Outstanding, Collection Rate</li>
              <li><strong>Monthly Revenue Chart</strong>: Last 6 months bar chart — Invoiced vs Collected</li>
              <li><strong>Payment Mode Breakdown</strong>: How customers are paying (Cash, Bank, Card, etc.)</li>
              <li><strong>Receivables Aging</strong>: Current, 1–30 days, 31–60 days, 60+ days overdue</li>
              <li><strong>Top 10 Customers</strong>: By revenue for the selected period</li>
            </ul>
          </Sub>
          <Sub title="Exporting">
            <p>Click <strong>Export CSV</strong> to download invoice data as a spreadsheet. Click <strong>Print PDF</strong> to save the full report as a PDF with your company letterhead.</p>
          </Sub>
        </Section>

        {/* 15. Settings */}
        <Section id="s15" title="15. Settings">
          <Sub title="Company Settings">
            <Step n={1}>Go to <strong>Settings → Company Settings</strong>.</Step>
            <Step n={2}>Update your company name, logo URL, contact details, address, and tax/VAT information.</Step>
            <Step n={3}>Add your bank account details (Bank Name, Account Number, IBAN, SWIFT). These appear on invoices and payslips.</Step>
            <Step n={4}>Click <strong>Save Company Settings</strong>.</Step>
          </Sub>
          <Sub title="User Management">
            <p>Admins can view all team members, change their roles (Owner, Admin, Manager, Accounts, Technician, HR), and activate or deactivate accounts. New registrations appear as Pending and must be approved.</p>
          </Sub>
          <Sub title="Module Access">
            <p>The <strong>Module Access</strong> matrix controls which roles can access each module (Operations, Finance, HR, Inventory, Reports). Click any cell to cycle between Full, View, and None.</p>
          </Sub>
          <Sub title="Audit Trail">
            <p>Every create, update, and delete action in the system is logged with the user name, timestamp, and details. Go to <strong>Settings → Audit Trail</strong> to review the history.</p>
          </Sub>
          <Tip>Only Owner and Admin roles can access Settings and Company Settings. Keep at least one Owner account active at all times.</Tip>
        </Section>

        {/* Footer */}
        <div className="text-center text-xs text-slate-400 py-4 border-t border-slate-100 print:mt-8">
          <p>FixOps Maintenance Management System · Confidential · For authorised users only</p>
          <p className="mt-1">For support, contact your system administrator.</p>
        </div>

      </div>
    </div>
  )
}
