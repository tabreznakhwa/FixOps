import { createClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Header } from '@/components/layout/Header'
import { BackButton } from '@/components/ui/BackButton'
import { PrintActions } from '@/components/print/PrintActions'
import { OrgLetterhead } from '@/components/print/OrgLetterhead'
import { formatCurrency, formatDate } from '@/lib/utils'
import { CalendarClock, Info } from 'lucide-react'
import { rankFridayRotation } from '@/lib/attendance/fridayRotation'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Friday Rotation' }

/** How far back the fairness comparison looks. */
const WINDOW_MONTHS = 3

function nextFriday(from: Date): string {
  const d = new Date(from)
  // getDay(): 0 = Sunday, 5 = Friday.
  const delta = (5 - d.getDay() + 7) % 7 || 7
  d.setDate(d.getDate() + delta)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export default async function FridayRotationPage({
  searchParams,
}: {
  searchParams: Promise<{ needed?: string }>
}) {
  const params = await searchParams
  // How many people a Friday normally takes — highlights that many suggestions.
  const needed = Math.min(20, Math.max(1, Number(params.needed) || 3))

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient() as any
  const { data: profileRaw } = await admin
    .from('users').select('organization_id, role').eq('id', user.id).single()
  const profile = profileRaw as { organization_id: string; role: string } | null

  // Shows what colleagues earn — supervisors and above only.
  if (!profile || !['owner', 'admin', 'hr', 'manager'].includes(profile.role)) {
    redirect('/dashboard?error=unauthorized')
  }

  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kuwait' }))
  const p = (n: number) => String(n).padStart(2, '0')
  const today = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
  const windowStart = new Date(now.getFullYear(), now.getMonth() - (WINDOW_MONTHS - 1), 1)
  const from = `${windowStart.getFullYear()}-${p(windowStart.getMonth() + 1)}-01`

  const [{ data: staffRaw }, { data: attendanceRaw }] = await Promise.all([
    admin
      .from('staff')
      .select('id, full_name, designation, friday_ot_amount')
      .eq('organization_id', profile.organization_id)
      .eq('employment_status', 'active')
      .order('full_name')
      .limit(1000),
    admin
      .from('attendance')
      .select('staff_id, date, status, friday_ot_amount, is_public_holiday')
      .eq('organization_id', profile.organization_id)
      .gte('date', from)
      .lte('date', today)
      .limit(5000),
  ])

  const ranked = rankFridayRotation(staffRaw ?? [], attendanceRaw ?? [], today)

  // Only people who actually do Friday work belong in the rotation. The Friday
  // rate on the staff profile is the marker for that — without it there is
  // nothing to pay them for the shift. Otherwise the ranking puts the MD and
  // CEO top simply because they have never worked a Friday.
  //
  // Anyone excluded is still listed below rather than hidden, so a technician
  // missing a rate by oversight is visible and fixable instead of silently
  // dropping out of the rotation.
  const rows = ranked.filter(r => r.shiftRate > 0 || r.totalCount > 0)
  const notInRotation = ranked.filter(r => r.shiftRate <= 0 && r.totalCount === 0)

  const upcoming = nextFriday(now)
  const totalShifts = rows.reduce((s, r) => s + r.totalCount, 0)

  return (
    <div className="animate-fade-in">
      <div className="hidden print:block px-8 pt-8">
        <OrgLetterhead title="Friday / Holiday Rotation" subtitle={`Next Friday: ${formatDate(upcoming)}`} />
      </div>

      <Header
        title="Friday Rotation"
        subtitle="Who is next in line for Friday and holiday work"
        actions={
          <div className="flex items-center gap-2">
            <PrintActions label="Print" />
            <BackButton fallbackHref="/attendance" label="Attendance" />
          </div>
        }
      />

      <div className="p-6 space-y-5 max-w-5xl">
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-start gap-2.5">
          <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-blue-900">
            <p>
              Ordered by who is most due. Anyone who worked Fridays recently drops down
              the list, so the work — and the extra pay — moves around the team.
            </p>
            <p className="text-xs text-blue-800 mt-1">
              Based on the last {WINDOW_MONTHS} months. It is a suggestion, not a roster —
              it cannot know who is on leave or who is trained for a particular job.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-2 mb-1">
              <CalendarClock className="w-4 h-4 text-slate-300" />
              <p className="text-xs text-slate-500 uppercase tracking-wider">Next Friday</p>
            </div>
            <p className="text-lg font-bold text-slate-900">{formatDate(upcoming)}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Shifts in window</p>
            <p className="text-lg font-bold text-slate-900">{totalShifts}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Suggested next</p>
            <p className="text-lg font-bold text-green-700">{rows.slice(0, needed).length} people</p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="font-semibold text-slate-900">Rotation Order</h3>
            <p className="text-xs text-slate-500 mt-0.5">Most due at the top</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">#</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Technician</th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">This Month</th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Last Month</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Last Worked</th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Rate</th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Earned ({WINDOW_MONTHS} mo)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {rows.map((r, i) => {
                  const suggested = i < needed
                  return (
                    <tr key={r.staffId} className={suggested ? 'bg-green-50/40' : 'hover:bg-slate-50/50'}>
                      <td className="px-5 py-3 text-sm font-semibold text-slate-400">{i + 1}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-slate-800">{r.name}</span>
                          {suggested && (
                            <span className="text-xs font-semibold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                              Suggested
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400">{r.designation ?? '—'}</p>
                      </td>
                      <td className={`px-4 py-3 text-right text-sm font-semibold ${r.thisMonthCount > 0 ? 'text-slate-800' : 'text-slate-300'}`}>
                        {r.thisMonthCount}
                      </td>
                      <td className={`px-4 py-3 text-right text-sm font-semibold ${r.lastMonthCount > 0 ? 'text-amber-700' : 'text-slate-300'}`}>
                        {r.lastMonthCount}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {r.lastWorkedDate ? (
                          <>
                            {formatDate(r.lastWorkedDate)}
                            <span className="text-xs text-slate-400 ml-1.5">
                              ({r.daysSinceLastWorked}d ago)
                            </span>
                          </>
                        ) : (
                          <span className="text-green-700 font-medium">Never</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-slate-500">
                        {r.shiftRate > 0 ? formatCurrency(r.shiftRate) : <span className="text-amber-600">Not set</span>}
                      </td>
                      <td className="px-5 py-3 text-right text-sm text-slate-700">
                        {r.totalEarned > 0 ? formatCurrency(r.totalEarned) : <span className="text-slate-300">—</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {notInRotation.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-sm font-semibold text-slate-700">Not in the Friday rotation</p>
            <p className="text-xs text-slate-500 mt-0.5">
              No Friday rate on their staff record and no Friday shifts worked. If
              someone here should be in the rotation, set their Friday rate on their
              staff profile.
            </p>
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              {notInRotation.map(r => (
                <span key={r.staffId} className="text-xs font-medium bg-slate-100 text-slate-600 px-2 py-1 rounded-lg">
                  {r.name}
                  {r.designation && <span className="text-slate-400"> · {r.designation}</span>}
                </span>
              ))}
            </div>
          </div>
        )}

        <form method="get" className="flex items-end gap-2 print:hidden">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">
              People needed per Friday
            </label>
            <input
              type="number" name="needed" min="1" max="20" defaultValue={needed}
              className="w-32 px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-slate-700 hover:bg-slate-800 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            Update
          </button>
        </form>
      </div>
    </div>
  )
}
