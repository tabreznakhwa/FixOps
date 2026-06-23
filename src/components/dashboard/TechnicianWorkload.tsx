import { UserCheck, Circle } from 'lucide-react'

export function TechnicianWorkload({ technicians }: { technicians: { id: string; full_name: string }[] }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center gap-2 mb-4">
        <UserCheck className="w-4 h-4 text-blue-600" />
        <h3 className="font-semibold text-slate-900">Technicians</h3>
        <span className="ml-auto text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
          {technicians.length} active
        </span>
      </div>

      {technicians.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-4">No technicians yet</p>
      ) : (
        <div className="space-y-2">
          {technicians.map((t) => (
            <div key={t.id} className="flex items-center gap-3">
              <div className="w-7 h-7 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                {t.full_name.slice(0, 2).toUpperCase()}
              </div>
              <span className="text-sm text-slate-700 flex-1 truncate">{t.full_name}</span>
              <Circle className="w-2 h-2 fill-green-500 text-green-500" />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
