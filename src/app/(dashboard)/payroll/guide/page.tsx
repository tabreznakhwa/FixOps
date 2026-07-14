import { Header } from '@/components/layout/Header'
import Link from 'next/link'
import { ArrowLeft, BookOpen, Users, Clock, Banknote, FileText, CheckCircle, AlertCircle, ChevronRight } from 'lucide-react'

export const metadata = { title: 'Payroll User Guide' }

function Section({ id, icon: Icon, title, children }: { id: string; icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <div id={id} className="bg-white rounded-xl border border-slate-200 p-6 scroll-mt-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0">
          <Icon className="w-5 h-5 text-blue-600" />
        </div>
        <h2 className="text-lg font-bold text-slate-900">{title}</h2>
      </div>
      {children}
    </div>
  )
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-600 text-white text-sm font-bold flex items-center justify-center mt-0.5">{n}</div>
      <div className="flex-1 pb-5 border-b border-slate-100 last:border-0 last:pb-0">
        <p className="font-semibold text-slate-900 mb-1">{title}</p>
        <div className="text-sm text-slate-600 space-y-1">{children}</div>
      </div>
    </div>
  )
}

function Field({ label, desc }: { label: string; desc: string }) {
  return (
    <div className="flex gap-3 py-2.5 border-b border-slate-50 last:border-0">
      <span className="font-semibold text-slate-800 min-w-[180px] text-sm">{label}</span>
      <span className="text-sm text-slate-600">{desc}</span>
    </div>
  )
}

function Note({ type = 'info', children }: { type?: 'info' | 'warn'; children: React.ReactNode }) {
  const styles = type === 'warn'
    ? 'bg-amber-50 border-amber-200 text-amber-800'
    : 'bg-blue-50 border-blue-200 text-blue-800'
  const Icon = type === 'warn' ? AlertCircle : CheckCircle
  return (
    <div className={`flex gap-2.5 border rounded-lg px-4 py-3 text-sm mt-3 ${styles}`}>
      <Icon className="w-4 h-4 mt-0.5 flex-shrink-0" />
      <span>{children}</span>
    </div>
  )
}

const TOC = [
  { id: 'overview', label: 'Overview' },
  { id: 'setup', label: 'Staff Salary Setup' },
  { id: 'attendance', label: 'Attendance & OT Rules' },
  { id: 'advances', label: 'Advances & Loans' },
  { id: 'process', label: 'Monthly Payroll Process' },
  { id: 'payslips', label: 'Payslips & Distribution' },
  { id: 'faq', label: 'FAQ' },
]

export default function PayrollGuidePage() {
  return (
    <div className="animate-fade-in">
      <Header
        title="Payroll User Guide"
        subtitle="Step-by-step guide for HR and Admin"
        actions={
          <Link href="/payroll"
            className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition">
            <ArrowLeft className="w-4 h-4" /> Back to Payroll
          </Link>
        }
      />

      <div className="p-6 max-w-5xl">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

          {/* Table of Contents */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl border border-slate-200 p-4 sticky top-6">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">On This Page</p>
              <nav className="space-y-1">
                {TOC.map(item => (
                  <a key={item.id} href={`#${item.id}`}
                    className="flex items-center gap-2 text-sm text-slate-600 hover:text-blue-600 py-1.5 px-2 rounded-lg hover:bg-blue-50 transition group">
                    <ChevronRight className="w-3 h-3 text-slate-400 group-hover:text-blue-500" />
                    {item.label}
                  </a>
                ))}
              </nav>
              <div className="mt-4 pt-4 border-t border-slate-100">
                <p className="text-xs text-slate-400 mb-2">Quick links</p>
                <Link href="/payroll/process" className="flex items-center gap-1.5 text-xs text-blue-600 hover:underline font-semibold">
                  <BookOpen className="w-3.5 h-3.5" /> Process Payroll →
                </Link>
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3 space-y-6">

            {/* Overview */}
            <Section id="overview" icon={BookOpen} title="Overview">
              <p className="text-sm text-slate-600 mb-4">
                The FixOps payroll module handles the complete salary cycle — from staff setup to monthly payslip generation.
                It supports multiple salary components, automatic overtime calculation based on attendance,
                advance/loan tracking, and one-click payslip printing.
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {[
                  { label: 'Staff Setup', desc: 'Configure salary components per employee' },
                  { label: 'Attendance', desc: 'Auto-calculates OT from clock-in/out records' },
                  { label: 'Advances', desc: 'Track advances and deduct from salary' },
                  { label: 'Payslips', desc: 'Generate and print monthly payslips' },
                  { label: 'WPS Export', desc: 'Wage Protection System file (coming soon)' },
                  { label: 'My Payslips', desc: 'Staff can view their own payslips' },
                ].map(item => (
                  <div key={item.label} className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                    <p className="font-semibold text-slate-800 text-sm">{item.label}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{item.desc}</p>
                  </div>
                ))}
              </div>
            </Section>

            {/* Staff Salary Setup */}
            <Section id="setup" icon={Users} title="Staff Salary Setup">
              <p className="text-sm text-slate-600 mb-4">
                Each employee's salary is configured in their staff profile. Go to <strong>HR → Staff</strong>,
                open a staff member, and fill in the salary section.
              </p>
              <div className="border border-slate-200 rounded-lg overflow-hidden mb-4">
                <div className="bg-slate-50 px-4 py-2 border-b border-slate-200">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Salary Components</p>
                </div>
                <div className="divide-y divide-slate-50 px-4">
                  <Field label="Basic Salary" desc="Core monthly salary before any allowances. This is the base for OT rate calculations." />
                  <Field label="Food Allowance" desc="Monthly food/meal allowance paid separately. Shown as its own line on payslip." />
                  <Field label="Other Allowance" desc="Any additional allowance (housing, transport, etc.). Use the Allowance Name field to label it." />
                  <Field label="Allowance Name" desc="Custom label for the other allowance — e.g. 'Housing Allowance', 'Transport Allowance'." />
                  <Field label="Fixed Overtime Monthly" desc="A fixed monthly OT amount paid regardless of hours worked — for staff on a fixed OT arrangement." />
                  <Field label="Overtime Eligible" desc="Enable for staff whose overtime is calculated from actual attendance hours (not fixed)." />
                  <Field label="Overtime Rate (KWD/hr)" desc="Hourly OT rate for overtime-eligible staff. Used to calculate normal OT pay from attendance records." />
                  <Field label="Friday OT Amount" desc="Daily KWD amount paid when the employee works on a Friday or public holiday." />
                </div>
              </div>
              <Note>
                The <strong>Total Monthly Bill</strong> on the Payroll overview shows the sum of Basic + Allowances + Food + Fixed OT for all active staff.
                This does not include variable OT — that is calculated per payroll run.
              </Note>
            </Section>

            {/* Attendance & OT */}
            <Section id="attendance" icon={Clock} title="Attendance & OT Rules">
              <p className="text-sm text-slate-600 mb-4">
                Overtime is calculated automatically from clock-in and clock-out records. The rules are:
              </p>
              <div className="space-y-3 mb-4">
                <div className="border border-slate-200 rounded-lg p-4">
                  <p className="font-semibold text-slate-800 text-sm mb-2">Regular Weekday (Mon – Thu, Sat)</p>
                  <ul className="text-sm text-slate-600 space-y-1 list-disc list-inside">
                    <li>Standard shift: 8:30 AM – 5:30 PM (8 hours)</li>
                    <li>1-hour lunch deducted if shift spans 1:00 – 2:00 PM</li>
                    <li><strong>Fixed OT band:</strong> 5:30 PM – 8:00 PM — paid at standard rate</li>
                    <li><strong>Normal OT:</strong> After 8:00 PM — paid at 1.25× (1 hour = 1.25 paid hours)</li>
                    <li>Hours worked capped at 8 for regular pay; OT is additional</li>
                  </ul>
                </div>
                <div className="border border-purple-200 bg-purple-50 rounded-lg p-4">
                  <p className="font-semibold text-purple-800 text-sm mb-2">Friday / Public Holiday</p>
                  <ul className="text-sm text-purple-700 space-y-1 list-disc list-inside">
                    <li>All hours count as OT (no regular hours deducted)</li>
                    <li>First 8 hours: Friday OT amount (flat KWD rate from staff profile)</li>
                    <li>After 8 hours: additional OT at 1.25×</li>
                    <li>The Friday OT amount is set per employee in their staff profile</li>
                  </ul>
                </div>
              </div>
              <p className="text-sm text-slate-600 mb-3">
                <strong>Self-clocking:</strong> Technicians and kiosk staff clock in/out via <em>My Attendance</em>.
                The system automatically detects Fridays and calculates OT accordingly.
                HR and Admin can view and edit any attendance record from <em>HR → Attendance</em>.
              </p>
              <Note type="warn">
                Public holidays (non-Friday) must be manually marked in the attendance record by HR.
                The system does not have an automatic public holiday calendar.
              </Note>
            </Section>

            {/* Advances & Loans */}
            <Section id="advances" icon={Banknote} title="Advances & Loans">
              <p className="text-sm text-slate-600 mb-4">
                Staff may request salary advances or loans. These are tracked per employee and deducted from their payslip.
              </p>
              <div className="space-y-4 mb-4">
                <div className="border border-slate-200 rounded-lg p-4">
                  <p className="font-semibold text-slate-800 text-sm mb-2">Recording an Advance</p>
                  <ol className="text-sm text-slate-600 space-y-1 list-decimal list-inside">
                    <li>Go to <strong>HR → Staff</strong> and open the employee</li>
                    <li>Click <strong>Add Advance / Loan</strong></li>
                    <li>Enter the amount, date, and reason</li>
                    <li>The outstanding balance updates immediately</li>
                  </ol>
                </div>
                <div className="border border-slate-200 rounded-lg p-4">
                  <p className="font-semibold text-slate-800 text-sm mb-2">Deducting from Payslip</p>
                  <ol className="text-sm text-slate-600 space-y-1 list-decimal list-inside">
                    <li>During payroll processing, the advance balance appears under <strong>Deductions</strong></li>
                    <li>Enter the amount to deduct this month (partial or full)</li>
                    <li>The remaining balance carries forward to next month</li>
                    <li>The payslip shows the deducted amount and remaining balance</li>
                  </ol>
                </div>
              </div>
              <Note type="warn">
                Always record advances <em>before</em> processing the payroll for that month.
                Advances added after payslips are generated will not appear on the current month's payslip.
              </Note>
            </Section>

            {/* Monthly Payroll Process */}
            <Section id="process" icon={FileText} title="Monthly Payroll Process">
              <p className="text-sm text-slate-600 mb-5">
                Run this checklist at the end of each month before generating payslips.
              </p>
              <div className="space-y-5">
                <Step n={1} title="Verify Attendance Records">
                  <p>Go to <strong>HR → Attendance</strong> and review the month's records.</p>
                  <p>Check that all staff have attendance for each working day. Mark any absences, leaves, or half-days.</p>
                  <p>Correct any wrong clock-in/out times (admins can edit any record).</p>
                </Step>
                <Step n={2} title="Mark Public Holidays">
                  <p>If any weekday was a public holiday, open each attendance record for that date and enable <strong>Public Holiday</strong>.</p>
                  <p>This ensures OT is calculated using Friday/holiday rules for those days.</p>
                </Step>
                <Step n={3} title="Record Advances and Deductions">
                  <p>Add any advances given during the month in each staff member's profile.</p>
                  <p>Note any additional deductions (disciplinary, missing equipment, etc.) to enter during processing.</p>
                </Step>
                <Step n={4} title="Process Payroll">
                  <p>Go to <strong>Payroll → Process Payroll</strong>.</p>
                  <p>Select the month and year, review the auto-calculated figures, and adjust if needed.</p>
                  <p>The system pulls hours worked and OT from attendance records automatically.</p>
                  <p>Review each employee's payslip total before confirming.</p>
                </Step>
                <Step n={5} title="Generate and Print Payslips">
                  <p>Once confirmed, click <strong>Generate Payslips</strong>.</p>
                  <p>Payslips are available under <strong>Payroll → Payslips</strong>.</p>
                  <p>Print or share individually, or bulk-print for all staff.</p>
                </Step>
                <Step n={6} title="Distribute to Staff">
                  <p>Each employee can view their own payslips at <strong>My Payslips</strong> (self-service).</p>
                  <p>Technicians and kiosk accounts can only see their own payslips — not other staff.</p>
                </Step>
              </div>
              <Note>
                <strong>Tip:</strong> Run payroll on the last working day of the month. Once payslips are generated for a period, avoid editing attendance records for that month as it will not automatically update the payslip.
              </Note>
            </Section>

            {/* Payslips */}
            <Section id="payslips" icon={FileText} title="Payslips & Distribution">
              <p className="text-sm text-slate-600 mb-4">Each payslip shows a complete breakdown of earnings and deductions.</p>
              <div className="grid md:grid-cols-2 gap-4 mb-4">
                <div className="border border-green-200 bg-green-50 rounded-lg p-4">
                  <p className="font-semibold text-green-800 text-sm mb-2">Earnings</p>
                  <ul className="text-sm text-green-700 space-y-1 list-disc list-inside">
                    <li>Basic Salary</li>
                    <li>Food Allowance</li>
                    <li>Other Allowance (with label)</li>
                    <li>Fixed Monthly OT</li>
                    <li>Normal OT (from attendance)</li>
                    <li>Friday / Public Holiday OT</li>
                  </ul>
                </div>
                <div className="border border-red-200 bg-red-50 rounded-lg p-4">
                  <p className="font-semibold text-red-800 text-sm mb-2">Deductions</p>
                  <ul className="text-sm text-red-700 space-y-1 list-disc list-inside">
                    <li>Advance / Loan repayment</li>
                    <li>Absence deductions</li>
                    <li>Other deductions (if entered)</li>
                  </ul>
                </div>
              </div>
              <p className="text-sm text-slate-600 mb-3">
                <strong>Printing:</strong> Open any payslip and click <em>Print</em>. Payslips are formatted for A4 paper.
              </p>
              <p className="text-sm text-slate-600">
                <strong>Staff access:</strong> Technicians and kiosk users log in and go to <em>My Payslips</em>
                to view their own payslips. They cannot see other staff payslips.
              </p>
            </Section>

            {/* FAQ */}
            <Section id="faq" icon={CheckCircle} title="FAQ">
              <div className="space-y-5">
                {[
                  {
                    q: 'An employee forgot to clock out. What do I do?',
                    a: 'Go to HR → Attendance, find the record for that date and staff member, and manually enter the check-out time. The system will recalculate OT automatically.',
                  },
                  {
                    q: 'Can I edit a payslip after it has been generated?',
                    a: 'Payslips are a snapshot at the time of generation. If you need to make corrections, you can delete the payslip run and re-process it. Always double-check attendance and advances before generating.',
                  },
                  {
                    q: 'Why is the OT not showing for a Friday record?',
                    a: 'Make sure the employee has a Friday OT Amount set in their staff profile. If the amount is 0, the system records the attendance but shows 0 for Friday OT pay. Also check that the clock-out time is recorded.',
                  },
                  {
                    q: 'A staff member worked on a public holiday (not Friday). How is this handled?',
                    a: 'Open the attendance record for that date and mark it as a Public Holiday. The system will then apply Friday/holiday OT rules (same calculation) to that record.',
                  },
                  {
                    q: 'How do I give an employee an advance that is not deducted yet?',
                    a: 'Record the advance in the staff profile. During payroll processing, you can choose not to deduct it this month — just enter 0 for the deduction amount. The balance will carry forward.',
                  },
                  {
                    q: 'What is the difference between Fixed OT Monthly and Normal OT?',
                    a: 'Fixed OT Monthly is a flat amount added every month regardless of actual hours (used for staff on a flat OT contract). Normal OT is calculated from actual attendance records and multiplied by the OT rate per hour.',
                  },
                ].map(({ q, a }) => (
                  <div key={q} className="border-b border-slate-100 pb-5 last:border-0 last:pb-0">
                    <p className="font-semibold text-slate-800 text-sm mb-1.5">{q}</p>
                    <p className="text-sm text-slate-600">{a}</p>
                  </div>
                ))}
              </div>
            </Section>

          </div>
        </div>
      </div>
    </div>
  )
}
