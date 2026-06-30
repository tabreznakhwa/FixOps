'use client'

import { useRouter } from 'next/navigation'

export function StaffFilterSelect({
  staffList,
  selectedStaffId,
  currentMonth,
}: {
  staffList: Array<{ id: string; full_name: string }>
  selectedStaffId: string
  currentMonth: string
}) {
  const router = useRouter()

  return (
    <select
      value={selectedStaffId}
      onChange={(e) => {
        const qs = new URLSearchParams()
        qs.set('month', currentMonth)
        if (e.target.value) qs.set('staff_id', e.target.value)
        router.push(`/attendance?${qs.toString()}`)
      }}
      className="px-3 py-2 rounded-xl text-sm font-medium border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      <option value="">All Staff</option>
      {staffList.map((s) => (
        <option key={s.id} value={s.id}>
          {s.full_name}
        </option>
      ))}
    </select>
  )
}
