import { Header } from '@/components/layout/Header'
import Link from 'next/link'
import { BookOpen, Users, Clock, Banknote, FileText, CheckCircle, AlertCircle, ChevronRight, Calculator, RotateCcw } from 'lucide-react'
import { BackButton } from '@/components/ui/BackButton'
import { OrgLetterhead } from '@/components/print/OrgLetterhead'
import { PrintActions } from '@/components/print/PrintActions'

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
        <div className="text-sm text-slate-600 space-y-1.5">{children}</div>
      </div>
    </div>
  )
}

function Field({ label, desc }: { label: string; desc: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row gap-1 sm:gap-3 py-2.5 border-b border-slate-50 last:border-0">
      <span className="font-semibold text-slate-800 sm:min-w-[190px] text-sm">{label}</span>
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

/** A calculation the system performs, shown exactly as the code computes it. */
function Formula({ label, expr, note }: { label: string; expr: string; note?: string }) {
  return (
    <div className="border border-slate-200 rounded-lg p-3.5">
      <p className="text-sm font-semibold text-slate-800 mb-1.5">{label}</p>
      <code className="block text-xs bg-slate-50 border border-slate-100 rounded px-3 py-2 text-slate-700 font-mono overflow-x-auto">
        {expr}
      </code>
      {note && <p className="text-xs text-slate-500 mt-1.5">{note}</p>}
    </div>
  )
}

function Btn({ children, tone = 'blue' }: { children: React.ReactNode; tone?: 'blue' | 'green' | 'amber' }) {
  const tones = {
    blue: 'bg-blue-100 text-blue-800 border-blue-200',
    green: 'bg-green-100 text-green-800 border-green-200',
    amber: 'bg-amber-100 text-amber-800 border-amber-200',
  }
  return <span className={`inline-block border rounded px-1.5 py-0.5 text-xs font-semibold ${tones[tone]}`}>{children}</span>
}

const TOC = [
  { id: 'overview', label: 'Overview' },
  { id: 'before', label: 'Before You Start' },
  { id: 'process', label: 'Processing Salary — Steps' },
  { id: 'calculations', label: 'How Figures Are Calculated' },
  { id: 'setup', label: 'Staff Salary Setup' },
  { id: 'attendance', label: 'Attendance & OT Rules' },
  { id: 'advances', label: 'Advances & Loans' },
  { id: 'fixing', label: 'Fixing Mistakes' },
  { id: 'faq', label: 'FAQ' },
]

export default function PayrollGuidePage() {
  return (
    <div className="animate-fade-in">
      <div className="hidden print:block px-8 pt-8">
        <OrgLetterhead title="Payroll User Guide" subtitle="Step-by-step salary processing" />
      </div>
      <Header
        title="Payroll User Guide"
        subtitle="Step-by-step guide for HR and Admin"
        actions={
          <div className="flex items-center gap-2">
            <PrintActions />
            <BackButton fallbackHref="/payroll" label="Back to Payroll" />
          </div>
        }
      />

      <div className="p-6 max-w-5xl">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

          {/* Table of Contents — screen only; it is navigation, not content */}
          <div className="lg:col-span-1 print:hidden">
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

          {/* Main Content — spans the full width once the TOC is hidden for print */}
          <div className="lg:col-span-3 print:col-span-4 space-y-6">

            {/* Overview */}
            <Section id="overview" icon={BookOpen} title="Overview">
              <p className="text-sm text-slate-600 mb-4">
                Payroll runs <strong>one salary run per month</strong>. The run pulls attendance for that month,
                calculates overtime and absence deductions automatically, and creates one payslip per active
                employee. You then mark the run as paid, which records the payment date and mode on every payslip.
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {[
                  { label: 'Staff Setup', desc: 'Salary components per employee' },
                  { label: 'Attendance', desc: 'Source of OT and absence figures' },
                  { label: 'Advances', desc: 'Recovered from the payslip' },
                  { label: 'Process', desc: 'Creates the run and all payslips' },
                  { label: 'Pay', desc: 'Marks slips paid; feeds Cash/Bank Book' },
                  { label: 'My Payslips', desc: 'Staff view their own payslips' },
                ].map(item => (
                  <div key={item.label} className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                    <p className="font-semibold text-slate-800 text-sm">{item.label}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{item.desc}</p>
                  </div>
                ))}
              </div>
              <Note type="warn">
                Only staff with <strong>Employment Status = Active</strong> are included in a payroll run.
                Anyone left inactive will be silently skipped.
              </Note>
            </Section>

            {/* Before You Start */}
            <Section id="before" icon={CheckCircle} title="Before You Start">
              <p className="text-sm text-slate-600 mb-4">
                Everything below feeds the calculation. Fix it <em>before</em> processing — a payslip is a snapshot
                and does not update itself afterwards.
              </p>
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="bg-slate-50 px-4 py-2 border-b border-slate-200">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Pre-flight checklist</p>
                </div>
                <div className="divide-y divide-slate-50 px-4">
                  <Field label="Attendance complete" desc="Every working day marked for every employee. Missing days are simply not counted." />
                  <Field label="Absences marked" desc="Status Absent counts as 1 day, Half Day as 0.5 day." />
                  <Field label="Public holidays flagged" desc="Tick Public Holiday on those attendance records. Fridays are detected automatically; other holidays are not." />
                  <Field label="Missing clock-outs fixed" desc="A record with no clock-out contributes no overtime hours." />
                  <Field label="Advances recorded" desc="Add any advance or loan on the staff profile so its balance is available to recover." />
                  <Field label="Salary components correct" desc="Basic, allowances, food, fixed OT and the Friday OT rate on each staff profile." />
                  <Field label="Employment status" desc="Confirm active staff are Active and leavers are not." />
                </div>
              </div>
            </Section>

            {/* Processing — the main step-by-step */}
            <Section id="process" icon={FileText} title="Processing Salary — Step by Step">
              <p className="text-sm text-slate-600 mb-5">
                Go to <strong>Payroll → Process Payroll</strong> (the page is titled <em>Payslips</em>).
              </p>
              <div className="space-y-5">
                <Step n={1} title="Select the month and year">
                  <p>Pick the month and year at the top of the page, then click <Btn>Load</Btn>.</p>
                  <p>If a run already exists for that period, a status pill appears on the right — <em>draft</em>, <em>approved</em> or <em>paid</em> — and the entry form is replaced by the processed figures.</p>
                </Step>

                <Step n={2} title="Review the auto-calculated table">
                  <p>Every active employee is listed with Basic, Allowance, Food, Fixed OT, Normal OT, Fri/Hol OT, Absent days and Absent Deduction.</p>
                  <p>All of these are pulled from the staff profile and that month&apos;s attendance — they are read-only here.</p>
                  <p>Coloured banners at the top tell you what was detected: absent days, normal OT, Friday/holiday OT, or that no attendance exists at all.</p>
                  <Note type="warn">
                    If you see <em>&ldquo;No attendance records found for this month&rdquo;</em>, the full salary will be paid with
                    no OT and no deductions. Go back and mark attendance first.
                  </Note>
                </Step>

                <Step n={3} title="Enter the two manual figures">
                  <p>Only two columns accept input — both marked with a ✎:</p>
                  <ul className="list-disc list-inside space-y-1 mt-1">
                    <li><strong>Food Deduct</strong> — any food cost being recovered this month.</li>
                    <li><strong>Adv. Deduct</strong> — how much of the outstanding advance to recover. This column only appears when at least one employee has an advance balance.</li>
                  </ul>
                  <p>Leave a field blank or 0 to recover nothing; the balance carries forward.</p>
                  <Note>
                    The advance recovery is capped at the employee&apos;s outstanding balance, so you cannot over-recover
                    even if you type a larger number.
                  </Note>
                </Step>

                <Step n={4} title="Check the Net column">
                  <p>Net updates live as you type. Under each Net you will see the total deducted.</p>
                  <p>A negative net is shown as 0.000 in the preview — if that happens, your deductions exceed the salary, so reduce them before processing.</p>
                </Step>

                <Step n={5} title="Process the payslips">
                  <p>Click <Btn>Process N Payslips</Btn>.</p>
                  <p>This creates the salary run and one payslip per employee in a single action, and immediately reduces each employee&apos;s advance balance by the amount you recovered.</p>
                  <p>The entry form is replaced by four summary cards — Basic Salary, Allowances, Overtime, Net Payable — and a <Btn>Print</Btn> link appears on every row.</p>
                  <Note type="warn">
                    Only one run is allowed per month. Processing again for the same month is rejected with
                    &ldquo;Payroll already processed for this month&rdquo;.
                  </Note>
                </Step>

                <Step n={6} title="Verify, then pay">
                  <p>Open a few payslips and check them. When you are satisfied, click <Btn tone="green">Pay N Salaries</Btn>.</p>
                  <p>Choose the <strong>Payment Mode</strong> (Bank Transfer, Cheque or Cash) and the <strong>Payment Date</strong>, then confirm.</p>
                  <p>Every pending payslip is marked paid with that date and mode, and the run status becomes <em>paid</em>.</p>
                  <Note>
                    The payment mode matters for your books: salaries paid in <strong>Cash</strong> appear in the Cash Book,
                    and bank/cheque payments appear in the Bank Book, both dated by the payment date you choose here.
                  </Note>
                </Step>

                <Step n={7} title="Distribute the payslips">
                  <p>Print individually from the <Btn>Print</Btn> link on each row, or use <Btn>Print Summary</Btn> for the whole run.</p>
                  <p>Staff can see their own payslips under <strong>My Payslips</strong> — they cannot see anyone else&apos;s.</p>
                </Step>
              </div>

              <div className="mt-5 border border-slate-200 rounded-lg p-4">
                <p className="text-sm font-semibold text-slate-800 mb-2">Who can do what</p>
                <div className="text-sm text-slate-600 space-y-1">
                  <p><strong>Process payroll:</strong> Owner, Admin, Manager</p>
                  <p><strong>Pay salaries:</strong> Owner, Admin, Manager, Accounts</p>
                  <p><strong>Reset &amp; re-process:</strong> Owner, Admin only</p>
                </div>
              </div>
            </Section>

            {/* Calculations */}
            <Section id="calculations" icon={Calculator} title="How Each Figure Is Calculated">
              <div className="space-y-3">
                <Formula
                  label="Normal (daily) overtime"
                  expr="Basic ÷ 30 ÷ 8 × OT paid hours"
                  note="The hourly rate is derived from Basic — there is no separate OT rate field. The 1.25× premium is already applied when attendance is saved, so OT paid hours are the post-premium hours."
                />
                <Formula
                  label="Friday / public holiday overtime"
                  expr="Sum of the Friday OT amount on each Friday or holiday worked"
                  note="Taken from the attendance record; if that is 0 it falls back to the rate on the staff profile."
                />
                <Formula
                  label="Fixed monthly overtime"
                  expr="Paid only if the employee is OT-eligible AND worked at least one Friday or public holiday that month"
                  note="It is not an unconditional monthly amount — a month with no Friday/holiday work pays no fixed OT."
                />
                <Formula
                  label="Absence deduction"
                  expr="(Basic + Allowance + Fixed OT) ÷ 30 × absent days"
                  note="Allowance here means housing + transport + other. The food allowance is not part of this deduction."
                />
                <Formula
                  label="Gross"
                  expr="Basic + Allowance + Food + Fixed OT + Normal OT + Friday/Holiday OT"
                />
                <Formula
                  label="Net"
                  expr="Gross − Absence deduction − Food deduction − Advance recovery"
                />
              </div>

              <div className="mt-4 border border-purple-200 bg-purple-50 rounded-lg p-4">
                <p className="font-semibold text-purple-800 text-sm mb-2">Overtime eligibility — what it does and does not gate</p>
                <ul className="text-sm text-purple-700 space-y-1 list-disc list-inside">
                  <li>Staff who are <strong>not</strong> OT-eligible get <strong>no daily overtime</strong> and <strong>no fixed OT</strong>.</li>
                  <li>Friday and public-holiday OT is paid to <strong>every</strong> employee, eligible or not.</li>
                  <li>For non-eligible staff, daily overtime hours are forced to zero when attendance is saved, so nothing leaks into the payroll.</li>
                </ul>
              </div>
            </Section>

            {/* Staff Salary Setup */}
            <Section id="setup" icon={Users} title="Staff Salary Setup">
              <p className="text-sm text-slate-600 mb-4">
                Configured per employee under <strong>HR → Staff</strong>.
              </p>
              <div className="border border-slate-200 rounded-lg overflow-hidden mb-4">
                <div className="bg-slate-50 px-4 py-2 border-b border-slate-200">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Salary Components</p>
                </div>
                <div className="divide-y divide-slate-50 px-4">
                  <Field label="Basic Salary" desc="Core monthly salary. Also the basis for the overtime hourly rate and the absence deduction." />
                  <Field label="Food Allowance" desc="Paid as its own line on the payslip. Excluded from the absence deduction." />
                  <Field label="Other Allowance" desc="Any additional allowance. Label it using the Allowance Name field." />
                  <Field label="Allowance Name" desc="Custom label — e.g. Housing Allowance, Transport Allowance." />
                  <Field label="Fixed Overtime Monthly" desc="Paid only in months where the employee is OT-eligible and worked a Friday or public holiday." />
                  <Field label="Overtime Eligible" desc="Gates daily overtime and fixed OT only. Friday/holiday OT is unaffected." />
                  <Field label="Friday OT Amount" desc="Flat KWD amount per Friday or public holiday worked." />
                </div>
              </div>
              <Note>
                The <strong>Total Monthly Bill</strong> on the Payroll overview is Basic + Allowances + Food + Fixed OT
                for all active staff. It excludes variable overtime, which is only known once a run is processed.
              </Note>
            </Section>

            {/* Attendance & OT */}
            <Section id="attendance" icon={Clock} title="Attendance & OT Rules">
              <p className="text-sm text-slate-600 mb-4">
                Overtime is derived from clock-in and clock-out times when attendance is saved.
              </p>
              <div className="space-y-3 mb-4">
                <div className="border border-slate-200 rounded-lg p-4">
                  <p className="font-semibold text-slate-800 text-sm mb-2">Regular Weekday (Sat – Thu)</p>
                  <ul className="text-sm text-slate-600 space-y-1 list-disc list-inside">
                    <li>Standard shift 8:30 AM – 5:30 PM (8 hours)</li>
                    <li>1-hour lunch deducted if the shift spans 1:00 – 2:00 PM</li>
                    <li><strong>Fixed OT band:</strong> 5:30 PM – 8:00 PM</li>
                    <li><strong>Normal OT:</strong> after 8:00 PM, at 1.25× (1 hour worked = 1.25 paid hours)</li>
                  </ul>
                </div>
                <div className="border border-purple-200 bg-purple-50 rounded-lg p-4">
                  <p className="font-semibold text-purple-800 text-sm mb-2">Friday / Public Holiday</p>
                  <ul className="text-sm text-purple-700 space-y-1 list-disc list-inside">
                    <li>The flat Friday OT amount applies for the day worked</li>
                    <li>Paid to all staff, including those not marked OT-eligible</li>
                    <li>Fridays are detected automatically; other public holidays must be ticked manually</li>
                  </ul>
                </div>
              </div>
              <p className="text-sm text-slate-600">
                <strong>Self-clocking:</strong> staff clock in and out via <em>My Attendance</em>.
                HR and Admin can add or correct any record from <em>HR → Attendance</em>.
              </p>
              <Note type="warn">
                There is no public-holiday calendar. Any non-Friday holiday must be ticked as
                <strong> Public Holiday</strong> on each affected attendance record, or it will be treated as a normal day.
              </Note>
            </Section>

            {/* Advances & Loans */}
            <Section id="advances" icon={Banknote} title="Advances & Loans">
              <div className="space-y-4 mb-4">
                <div className="border border-slate-200 rounded-lg p-4">
                  <p className="font-semibold text-slate-800 text-sm mb-2">Recording an advance</p>
                  <ol className="text-sm text-slate-600 space-y-1 list-decimal list-inside">
                    <li>Go to <strong>HR → Staff</strong> and open the employee</li>
                    <li>Add the advance or loan with amount, date and reason</li>
                    <li>The outstanding balance updates immediately</li>
                  </ol>
                </div>
                <div className="border border-slate-200 rounded-lg p-4">
                  <p className="font-semibold text-slate-800 text-sm mb-2">Recovering it from salary</p>
                  <ol className="text-sm text-slate-600 space-y-1 list-decimal list-inside">
                    <li>The outstanding balance shows in the <strong>Adv. Bal.</strong> column during processing</li>
                    <li>Type the amount to recover in <strong>Adv. Deduct</strong> (partial or full)</li>
                    <li>Processing reduces the balance; the remainder carries forward</li>
                  </ol>
                </div>
              </div>
              <Note type="warn">
                Record advances <em>before</em> processing. An advance added afterwards will not appear on that
                month&apos;s payslip unless you reset and re-process the run.
              </Note>
            </Section>

            {/* Fixing mistakes */}
            <Section id="fixing" icon={RotateCcw} title="Fixing Mistakes">
              <p className="text-sm text-slate-600 mb-4">
                A payslip is a snapshot taken at the moment you processed. Editing attendance, salary components or
                advances afterwards does <strong>not</strong> change an existing payslip.
              </p>
              <div className="border border-amber-200 bg-amber-50 rounded-lg p-4 mb-4">
                <p className="font-semibold text-amber-800 text-sm mb-2">To correct a processed run</p>
                <ol className="text-sm text-amber-700 space-y-1 list-decimal list-inside">
                  <li>Fix the underlying data first — attendance, salary components or advances</li>
                  <li>Open the run&apos;s month on the Payslips page</li>
                  <li>Click <strong>Reset &amp; Re-process</strong> and confirm</li>
                  <li>All payslips for the run are deleted and any advance recovery is added back to each balance</li>
                  <li>Process the month again with the corrected figures</li>
                </ol>
              </div>
              <Note type="warn">
                <strong>A run that has been paid cannot be reset.</strong> The button disappears once the run is
                marked paid, and the request is rejected server-side. Check the figures carefully before paying.
              </Note>
            </Section>

            {/* FAQ */}
            <Section id="faq" icon={CheckCircle} title="FAQ">
              <div className="space-y-5">
                {[
                  {
                    q: 'An employee forgot to clock out. What do I do?',
                    a: 'Go to HR → Attendance, open that date’s record and enter the check-out time. Overtime is recalculated when the record is saved. Do this before processing payroll.',
                  },
                  {
                    q: 'Can I edit a payslip after it has been generated?',
                    a: 'No. Fix the source data, then use Reset & Re-process on that month and process it again. This is not possible once the run has been paid.',
                  },
                  {
                    q: 'Why is Fixed OT showing as zero for someone?',
                    a: 'Fixed monthly OT is paid only when the employee is overtime-eligible and worked at least one Friday or public holiday in that month. With no Friday or holiday worked, it is zero.',
                  },
                  {
                    q: 'Why is there no Friday OT on a Friday record?',
                    a: 'Check the Friday OT Amount on the staff profile. If it is 0 and the attendance record has no amount stored, nothing is paid. Also confirm the day is marked Present or Half Day.',
                  },
                  {
                    q: 'A staff member is not eligible for overtime but worked a public holiday. Do they get paid?',
                    a: 'Yes. Friday and public-holiday OT is paid to every employee. Only daily overtime and fixed OT depend on the overtime-eligible flag.',
                  },
                  {
                    q: 'Someone is missing from the payroll run entirely.',
                    a: 'Their Employment Status is not Active. Only active staff are included. Set them active and reset and re-process the run.',
                  },
                  {
                    q: 'Where do paid salaries appear in the accounts?',
                    a: 'On the payslips, using the payment date and mode you chose when marking the run paid. Cash payments show in the Cash Book; bank transfers and cheques show in the Bank Book.',
                  },
                  {
                    q: 'Can I skip an advance recovery this month?',
                    a: 'Yes. Leave Adv. Deduct blank or 0 and the full balance carries forward to next month.',
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
