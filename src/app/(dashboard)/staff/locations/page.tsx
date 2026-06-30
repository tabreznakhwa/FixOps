import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { Navigation, Radio } from 'lucide-react'

export const metadata = { title: 'Technician Locations' }

function minutesAgo(iso: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
}

export default async function TechnicianLocationsPage() {
  const supabase = await createClient()

  const { data: locationsRaw } = await (supabase as any)
    .from('technician_locations')
    .select('staff_id, lat, lng, accuracy, recorded_at, staff(full_name, designation, employment_status)')
    .order('recorded_at', { ascending: false })

  const locations = (locationsRaw ?? []) as Array<{
    staff_id: string; lat: number; lng: number; accuracy: number | null; recorded_at: string
    staff: { full_name: string; designation: string | null; employment_status: string } | null
  }>

  const live = locations.filter((l) => minutesAgo(l.recorded_at) <= 10)
  const stale = locations.filter((l) => minutesAgo(l.recorded_at) > 10)

  return (
    <div className="animate-fade-in">
      <Header title="Technician Locations" subtitle="Last known position while technicians are clocked in and the My Jobs page is open" />

      <div className="p-6 space-y-5">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
          Location updates every few minutes only while a technician is clocked in and their My Jobs tab stays open in the browser. It will not update if the tablet is locked or the tab is closed.
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">Live ({live.length})</h3>
          </div>
          {live.length === 0 ? (
            <div className="p-8 text-center">
              <Radio className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-400">No technicians currently sharing live location</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {live.map((l) => (
                <LocationRow key={l.staff_id} l={l} live />
              ))}
            </div>
          )}
        </div>

        {stale.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-900">Last Known ({stale.length})</h3>
            </div>
            <div className="divide-y divide-slate-50">
              {stale.map((l) => (
                <LocationRow key={l.staff_id} l={l} live={false} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function LocationRow({ l, live }: {
  l: { staff_id: string; lat: number; lng: number; recorded_at: string; staff: { full_name: string; designation: string | null } | null }
  live: boolean
}) {
  const mins = minutesAgo(l.recorded_at)
  const ago = mins < 1 ? 'just now' : mins === 1 ? '1 min ago' : mins < 60 ? `${mins} mins ago` : `${Math.round(mins / 60)}h ago`
  return (
    <div className="px-5 py-3 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className={`w-2 h-2 rounded-full ${live ? 'bg-green-500' : 'bg-slate-300'}`} />
        <div>
          <p className="text-sm font-semibold text-slate-900">{l.staff?.full_name ?? 'Technician'}</p>
          <p className="text-xs text-slate-500">{l.staff?.designation ?? '—'} · Updated {ago}</p>
        </div>
      </div>
      <a
        href={`https://maps.google.com/?q=${l.lat},${l.lng}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 text-xs font-semibold rounded-lg hover:bg-blue-100 transition-colors"
      >
        <Navigation className="w-3.5 h-3.5" /> View on Map
      </a>
    </div>
  )
}
