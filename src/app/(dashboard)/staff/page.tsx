import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import Link from 'next/link'
import { Plus, Users, AlertTriangle, UserCheck } from 'lucide-react'
import { formatDate, daysUntil } from '@/lib/utils'

export const metadata = { title: 'Staff' }

export default async function StaffPage() {
  const supabase = await createClient()

  const { data: staffRaw } = await supabase
    .from('staff')
    .select('id, staff_code, full_name, department, designation, joining_date, employment_status, basic_salary, visa_expiry_date, mobile_number')
    .order('full_name')
  const staff = staffRaw as unknown as Array<{
    id: string; staff_code: string; full_name: string; department: string | null; designation: string | null;
    joining_date: string; employment_status: string; basic_salary: number;
    visa_expiry_date: string | null; mobile_number: string | null
  }>

  const activeStaff = staff?.filter((s) => s.employment_status === 'active') ?? []
  const visaExpiringSoon = staff?.filter((s) => {
    const days = daysUntil(s.visa_expiry_date)
    return days !== null && days <= 60 && days >= 0
  }) ?? []

  return (
    <div className="animate-fade-in">
      <Header
        title="Staff"
        subtitle="Employee records and HR management"
        actions={
          <Link href="/staff/new" className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors">
            <Plus className="w-4 h-4" /> Add Staff
          </Link>
        }
      />

      <div className="p-6 space-y-5">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-2xl font-bold text-slate-900">{activeStaff.length}</p>
            <p className="text-xs text-slate-500 mt-0.5">Active Staff</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-2xl font-bold text-slate-900">{staff?.length ?? 0}</p>
            <p className="text-xs text-slate-500 mt-0.5">Total Staff</p>
          </div>
          <div className={`bg-white rounded-xl border ${visaExpiringSoon.length > 0 ? 'border-amber-200' : 'border-slate-200'} p-4`}>
            <p className={`text-2xl font-bold ${visaExpiringSoon.length > 0 ? 'text-amber-600' : 'text-slate-900'}`}>
              {visaExpiringSoon.length}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">Visa Expiring (60d)</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-2xl font-bold text-slate-900">
              {[...new Set(staff?.map((s) => s.department).filter(Boolean))].length}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">Departments</p>
          </div>
        </div>

        {/* Staff Table */}
        {!staff?.length ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <Users className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">No staff records yet</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Staff</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 hidden md:table-cell">Department</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 hidden lg:table-cell">Joining Date</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 hidden lg:table-cell">Visa Expiry</th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 hidden sm:table-cell">Basic Salary</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {staff.map((s) => {
                  const visaDays = daysUntil(s.visa_expiry_date)
                  const visaAlert = visaDays !== null && visaDays <= 60
                  return (
                    <tr key={s.id} className="hover:bg-slate-50 transition-colors group">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white text-xs font-bold">
                            {s.full_name.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-slate-800 group-hover:text-blue-700 transition-colors">{s.full_name}</p>
                            <p className="text-xs text-slate-500">{s.designation}</p>
                            <p className="text-xs font-mono text-slate-400">{s.staff_code}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 hidden md:table-cell text-sm text-slate-600">{s.department ?? '—'}</td>
                      <td className="px-4 py-3.5 hidden lg:table-cell text-sm text-slate-600">{formatDate(s.joining_date)}</td>
                      <td className="px-4 py-3.5 hidden lg:table-cell">
                        {s.visa_expiry_date ? (
                          <div className={`text-sm ${visaAlert ? 'text-amber-600 font-semibold' : 'text-slate-600'}`}>
                            {formatDate(s.visa_expiry_date)}
                            {visaAlert && (
                              <span className="ml-1.5 text-xs text-amber-600">
                                <AlertTriangle className="w-3 h-3 inline" /> {visaDays}d
                              </span>
                            )}
                          </div>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3.5 hidden sm:table-cell text-right">
                        <p className="text-sm font-bold text-slate-900">
                          {s.basic_salary.toLocaleString()} AED
                        </p>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${
                          s.employment_status === 'active' ? 'bg-green-100 text-green-700' :
                          s.employment_status === 'on_leave' ? 'bg-amber-100 text-amber-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {s.employment_status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <Link href={`/staff/${s.id}`} className="text-xs text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">View →</Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
