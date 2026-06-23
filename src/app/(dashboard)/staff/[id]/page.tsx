import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { Header } from '@/components/layout/Header'
import Link from 'next/link'
import { ArrowLeft, Phone, Mail, CreditCard, Calendar, Briefcase, DollarSign, AlertTriangle } from 'lucide-react'
import { formatCurrency, formatDate, daysUntil } from '@/lib/utils'
import { StaffEditForm } from './StaffEditForm'

export const metadata = { title: 'Staff Profile' }

export default async function StaffDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: staffRaw } = await (supabase as any)
    .from('staff')
    .select('*')
    .eq('id', id)
    .single()

  if (!staffRaw) notFound()

  const s = staffRaw as {
    id: string; staff_code: string; full_name: string; designation: string | null; department: string | null
    joining_date: string; employment_status: string; basic_salary: number
    housing_allowance: number; transport_allowance: number; food_allowance: number
    other_allowance: number; fixed_overtime_monthly: number; overtime_eligible: boolean
    mobile_number: string | null; email: string | null; nationality: string | null
    passport_number: string | null; visa_number: string | null; emirates_id: string | null
    visa_expiry_date: string | null; passport_expiry_date: string | null
    bank_name: string | null; iban: string | null; notes: string | null
    advance_balance: number
  }

  const { data: slipsRaw } = await (supabase as any)
    .from('salary_slips')
    .select('net_salary, payment_status, salary_runs(salary_month, salary_year)')
    .eq('staff_id', id)
    .order('created_at', { ascending: false })
    .limit(6)
  const slips = (slipsRaw ?? []) as Array<{
    net_salary: number; payment_status: string
    salary_runs: { salary_month: number; salary_year: number } | null
  }>

  const visaDays = daysUntil(s.visa_expiry_date)
  const passportDays = daysUntil(s.passport_expiry_date)
  const grossSalary = s.basic_salary + s.housing_allowance + s.transport_allowance + s.food_allowance + s.other_allowance + (s.fixed_overtime_monthly ?? 0)

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

  return (
    <div className="animate-fade-in">
      <Header
        title={s.full_name}
        subtitle={`${s.designation ?? ''} ${s.department ? '· ' + s.department : ''} · ${s.staff_code}`}
        actions={
          <Link href="/staff" className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back to Staff
          </Link>
        }
      />

      <div className="p-6 space-y-5">
        {/* Alerts */}
        {(visaDays !== null && visaDays <= 60) || (passportDays !== null && passportDays <= 60) ? (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              {visaDays !== null && visaDays <= 60 && (
                <p className="text-sm font-semibold text-amber-800">
                  Visa expires {visaDays <= 0 ? 'EXPIRED' : `in ${visaDays} days`} — {formatDate(s.visa_expiry_date!)}
                </p>
              )}
              {passportDays !== null && passportDays <= 60 && (
                <p className="text-sm font-semibold text-amber-800">
                  Passport expires {passportDays <= 0 ? 'EXPIRED' : `in ${passportDays} days`} — {formatDate(s.passport_expiry_date!)}
                </p>
              )}
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Left column */}
          <div className="space-y-4">
            {/* Avatar / status */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 text-center">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white text-xl font-bold mx-auto mb-3">
                {s.full_name.slice(0, 2).toUpperCase()}
              </div>
              <h2 className="text-base font-bold text-slate-900">{s.full_name}</h2>
              <p className="text-sm text-slate-500">{s.designation ?? '—'}</p>
              <p className="text-xs text-slate-400 mt-0.5">{s.department ?? '—'}</p>
              <div className="mt-3">
                <span className={`text-xs font-semibold px-3 py-1 rounded-full ${s.employment_status === 'active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
                  {s.employment_status}
                </span>
              </div>
            </div>

            {/* Contact */}
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Contact</h3>
              <div className="space-y-2 text-sm">
                {s.mobile_number && (
                  <a href={`tel:${s.mobile_number}`} className="flex items-center gap-2 text-slate-700 hover:text-blue-600">
                    <Phone className="w-3.5 h-3.5 text-slate-400" /> {s.mobile_number}
                  </a>
                )}
                {s.email && (
                  <a href={`mailto:${s.email}`} className="flex items-center gap-2 text-slate-700 hover:text-blue-600">
                    <Mail className="w-3.5 h-3.5 text-slate-400" /> {s.email}
                  </a>
                )}
                {!s.mobile_number && !s.email && <p className="text-slate-400">No contact info</p>}
              </div>
            </div>

            {/* Documents */}
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Documents</h3>
              <div className="space-y-3 text-sm">
                {[
                  { label: 'Emirates ID', value: s.emirates_id },
                  { label: 'Passport', value: s.passport_number },
                  { label: 'Visa', value: s.visa_number },
                  { label: 'Nationality', value: s.nationality },
                ].map(({ label, value }) => value ? (
                  <div key={label} className="flex justify-between">
                    <span className="text-slate-500">{label}</span>
                    <span className="font-mono text-slate-800 text-xs">{value}</span>
                  </div>
                ) : null)}
                {s.visa_expiry_date && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Visa Expiry</span>
                    <span className={`text-xs font-semibold ${visaDays !== null && visaDays <= 60 ? 'text-amber-600' : 'text-slate-600'}`}>
                      {formatDate(s.visa_expiry_date)}
                    </span>
                  </div>
                )}
                {s.passport_expiry_date && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Passport Expiry</span>
                    <span className={`text-xs font-semibold ${passportDays !== null && passportDays <= 60 ? 'text-amber-600' : 'text-slate-600'}`}>
                      {formatDate(s.passport_expiry_date)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Bank */}
            {(s.bank_name || s.iban) && (
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Banking</h3>
                <div className="space-y-2 text-sm">
                  {s.bank_name && <div className="flex justify-between"><span className="text-slate-500">Bank</span><span className="font-semibold text-slate-800">{s.bank_name}</span></div>}
                  {s.iban && <div className="flex justify-between"><span className="text-slate-500">IBAN</span><span className="font-mono text-xs text-slate-800">{s.iban}</span></div>}
                </div>
              </div>
            )}
          </div>

          {/* Right: salary + edit form + payslip history */}
          <div className="lg:col-span-2 space-y-5">
            {/* Salary breakdown */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-slate-500" />
                <h3 className="text-sm font-semibold text-slate-900">Salary Structure</h3>
              </div>
              <div className="p-5">
                <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
                  {[
                    { label: 'Basic Salary', value: s.basic_salary },
                    { label: 'Housing Allowance', value: s.housing_allowance },
                    { label: 'Transport Allowance', value: s.transport_allowance },
                    { label: 'Food Allowance', value: s.food_allowance },
                    { label: 'Other Allowance', value: s.other_allowance },
                    ...(s.fixed_overtime_monthly > 0 ? [{ label: 'Fixed OT (Monthly)', value: s.fixed_overtime_monthly }] : []),
                  ].filter((r) => r.value > 0).map(({ label, value }) => (
                    <div key={label} className="flex justify-between py-1 border-b border-slate-50">
                      <span className="text-slate-500">{label}</span>
                      <span className="font-semibold text-slate-800">{formatCurrency(value)}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 pt-3 border-t border-slate-200 flex justify-between">
                  <span className="text-sm font-bold text-slate-700">Total Package</span>
                  <span className="text-base font-bold text-blue-700">{formatCurrency(grossSalary)}</span>
                </div>
                {s.advance_balance > 0 && (
                  <div className="mt-2 pt-2 border-t border-slate-100 flex justify-between">
                    <span className="text-sm text-slate-500">Advance Balance</span>
                    <span className="text-sm font-semibold text-amber-600">{formatCurrency(s.advance_balance)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Edit form */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-slate-500" />
                <h3 className="text-sm font-semibold text-slate-900">Edit Profile</h3>
              </div>
              <div className="p-5">
                <StaffEditForm staff={s} />
              </div>
            </div>

            {/* Payslip history */}
            {slips.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-slate-500" />
                  <h3 className="text-sm font-semibold text-slate-900">Recent Payslips</h3>
                </div>
                <div className="divide-y divide-slate-50">
                  {slips.map((slip, i) => {
                    const run = slip.salary_runs
                    return (
                      <div key={i} className="px-5 py-3 flex items-center justify-between text-sm">
                        <span className="text-slate-700">
                          {run ? `${MONTHS[run.salary_month - 1]} ${run.salary_year}` : '—'}
                        </span>
                        <div className="flex items-center gap-3">
                          <span className="font-semibold text-slate-900">{formatCurrency(slip.net_salary)}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${slip.payment_status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                            {slip.payment_status}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {s.notes && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-1">Notes</p>
                <p className="text-sm text-amber-900">{s.notes}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
