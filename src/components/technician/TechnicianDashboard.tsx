'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getPriorityColor, getStatusColor, formatStatus, formatDate } from '@/lib/utils'
import { Wrench, MapPin, Phone, Clock, CheckCircle2, PlayCircle, Navigation, Package, LogOut, ChevronRight, LogIn, AlertCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface Job {
  id: string
  work_order_number: string
  job_description: string | null
  priority: string
  status: string
  scheduled_date: string | null
  scheduled_time: string | null
  customers: {
    full_name: string
    mobile_number: string
    address: string | null
    area: string | null
    map_location_url: string | null
  } | null
}

const TECHNICIAN_STATUSES = [
  { key: 'accepted', label: 'Accept Job', color: 'bg-blue-600', next: 'on_the_way' },
  { key: 'on_the_way', label: 'On the Way', color: 'bg-cyan-600', next: 'work_started' },
  { key: 'work_started', label: 'Start Work', color: 'bg-teal-600', next: 'completed' },
  { key: 'completed', label: 'Mark Complete', color: 'bg-green-600', next: null },
]

interface Attendance {
  check_in: string | null
  check_out: string | null
}

export function TechnicianDashboard({
  jobs, technicianName, staffLinked, initialAttendance,
}: {
  jobs: Job[]
  technicianName: string
  staffLinked?: boolean
  initialAttendance?: Attendance | null
}) {
  const [selectedJob, setSelectedJob] = useState<Job | null>(null)
  const [updating, setUpdating] = useState(false)
  const [localJobs, setLocalJobs] = useState(jobs)
  const [notes, setNotes] = useState('')
  const [attendance, setAttendance] = useState<Attendance | null>(initialAttendance ?? null)
  const [attendanceLoading, setAttendanceLoading] = useState(false)
  const [attendanceError, setAttendanceError] = useState('')
  const supabase = createClient()
  const router = useRouter()
  const pingTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  function getLocation(): Promise<{ lat: number; lng: number; accuracy: number } | null> {
    return new Promise((resolve) => {
      if (!navigator.geolocation) return resolve(null)
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
      )
    })
  }

  async function clockAction(action: 'clock_in' | 'clock_out') {
    setAttendanceLoading(true)
    setAttendanceError('')
    try {
      const loc = await getLocation()
      const res = await fetch('/api/technician/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, lat: loc?.lat, lng: loc?.lng }),
      })
      const data = await res.json()
      if (!res.ok) { setAttendanceError(data.error ?? 'Failed'); return }
      setAttendance(data.record)
    } catch {
      setAttendanceError('Network error. Please try again.')
    } finally {
      setAttendanceLoading(false)
    }
  }

  // While clocked in and this tab stays open, periodically share location for live tracking.
  const onDuty = !!attendance?.check_in && !attendance?.check_out
  useEffect(() => {
    if (!onDuty) {
      if (pingTimer.current) { clearInterval(pingTimer.current); pingTimer.current = null }
      return
    }
    async function ping() {
      const loc = await getLocation()
      if (!loc) return
      fetch('/api/technician/location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loc),
      }).catch(() => {})
    }
    ping()
    pingTimer.current = setInterval(ping, 3 * 60 * 1000)
    return () => { if (pingTimer.current) { clearInterval(pingTimer.current); pingTimer.current = null } }
  }, [onDuty])

  async function updateStatus(jobId: string, newStatus: string) {
    setUpdating(true)
    const { error } = await (supabase as any)
      .from('work_orders')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', jobId)

    if (!error) {
      setLocalJobs((prev) =>
        prev.map((j) => j.id === jobId ? { ...j, status: newStatus } : j)
      )
      if (selectedJob?.id === jobId) {
        setSelectedJob((prev) => prev ? { ...prev, status: newStatus } : null)
      }
    }
    setUpdating(false)
  }

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const todayJobs = localJobs.filter((j) => {
    if (!j.scheduled_date) return false
    return new Date(j.scheduled_date).toDateString() === new Date().toDateString()
  })
  const otherJobs = localJobs.filter((j) => !todayJobs.includes(j))

  const getNextAction = (job: Job) => {
    if (job.status === 'new' || job.status === 'assigned') return { label: 'Accept Job', next: 'accepted', color: 'bg-blue-600' }
    if (job.status === 'accepted') return { label: 'On the Way', next: 'on_the_way', color: 'bg-cyan-600' }
    if (job.status === 'on_the_way') return { label: 'Start Work', next: 'work_started', color: 'bg-teal-600' }
    if (job.status === 'work_started') return { label: 'Mark Complete', next: 'completed', color: 'bg-green-600' }
    return null
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Header */}
      <div className="bg-slate-900 border-b border-slate-700 px-4 py-4 sticky top-0 z-20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-500 rounded-xl flex items-center justify-center">
              <Wrench className="w-4 h-4" />
            </div>
            <div>
              <p className="font-bold text-sm">{technicianName}</p>
              <p className="text-xs text-slate-400">Technician · {localJobs.length} assigned jobs</p>
            </div>
          </div>
          <button onClick={signOut} className="p-2 rounded-lg hover:bg-slate-700 transition-colors">
            <LogOut className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        {/* Clock In / Clock Out */}
        {staffLinked === false ? (
          <div className="mt-3 flex items-center gap-2 bg-amber-900/30 border border-amber-700/50 rounded-xl px-3 py-2 text-xs text-amber-300">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> Your login isn't linked to a staff profile — ask HR to link it so your hours count toward salary.
          </div>
        ) : (
          <div className="mt-3 flex items-center justify-between gap-3 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5">
            {attendanceError && <p className="text-xs text-red-400">{attendanceError}</p>}
            {!attendance?.check_in ? (
              <>
                <span className="text-xs text-slate-400">Not clocked in yet</span>
                <button
                  onClick={() => clockAction('clock_in')}
                  disabled={attendanceLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded-lg text-xs font-bold transition-colors"
                >
                  <LogIn className="w-3.5 h-3.5" /> Clock In
                </button>
              </>
            ) : !attendance.check_out ? (
              <>
                <span className="text-xs text-slate-300">Clocked in at <span className="font-bold text-white">{attendance.check_in}</span></span>
                <button
                  onClick={() => clockAction('clock_out')}
                  disabled={attendanceLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg text-xs font-bold transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" /> Clock Out
                </button>
              </>
            ) : (
              <span className="text-xs text-green-400 font-semibold flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" /> {attendance.check_in} – {attendance.check_out} · Done for today
              </span>
            )}
          </div>
        )}
      </div>

      {selectedJob ? (
        /* Job Detail View */
        <div className="p-4 space-y-4 max-w-lg mx-auto">
          <button
            onClick={() => setSelectedJob(null)}
            className="text-sm text-slate-400 hover:text-white transition-colors"
          >
            ← Back to jobs
          </button>

          <div className="bg-slate-800 rounded-2xl p-5 border border-slate-700">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-xs font-mono text-slate-400">{selectedJob.work_order_number}</p>
                <p className="font-bold text-lg mt-1 leading-tight">{selectedJob.job_description ?? 'Job'}</p>
              </div>
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${getPriorityColor(selectedJob.priority)}`}>
                {selectedJob.priority}
              </span>
            </div>
            <span className={`inline-flex text-xs font-semibold px-2.5 py-1 rounded-full ${getStatusColor(selectedJob.status)}`}>
              {formatStatus(selectedJob.status)}
            </span>
          </div>

          {/* Customer Info */}
          {selectedJob.customers && (
            <div className="bg-slate-800 rounded-2xl p-5 border border-slate-700 space-y-3">
              <h3 className="font-semibold text-sm text-slate-300">Customer</h3>
              <p className="font-bold text-white">{selectedJob.customers.full_name}</p>

              <div className="flex gap-3">
                <a
                  href={`tel:${selectedJob.customers.mobile_number}`}
                  className="flex-1 flex items-center justify-center gap-2 py-3 bg-green-600 hover:bg-green-700 rounded-xl transition-colors font-semibold text-sm"
                >
                  <Phone className="w-4 h-4" /> Call
                </a>
                {selectedJob.customers.map_location_url ? (
                  <a
                    href={selectedJob.customers.map_location_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors font-semibold text-sm"
                  >
                    <Navigation className="w-4 h-4" /> Navigate
                  </a>
                ) : (
                  <a
                    href={`https://maps.google.com/?q=${encodeURIComponent([selectedJob.customers.address, selectedJob.customers.area].filter(Boolean).join(', '))}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors font-semibold text-sm"
                  >
                    <Navigation className="w-4 h-4" /> Maps
                  </a>
                )}
              </div>

              {(selectedJob.customers.address || selectedJob.customers.area) && (
                <div className="flex items-start gap-2 text-sm text-slate-400">
                  <MapPin className="w-4 h-4 text-slate-500 flex-shrink-0 mt-0.5" />
                  {[selectedJob.customers.address, selectedJob.customers.area].filter(Boolean).join(', ')}
                </div>
              )}
            </div>
          )}

          {selectedJob.scheduled_date && (
            <div className="flex items-center gap-2 bg-slate-800 rounded-xl px-4 py-3 border border-slate-700 text-sm">
              <Clock className="w-4 h-4 text-blue-400" />
              <span className="text-slate-300">Scheduled:</span>
              <span className="font-semibold">{formatDate(selectedJob.scheduled_date)}</span>
              {selectedJob.scheduled_time && <span className="text-slate-400">at {selectedJob.scheduled_time}</span>}
            </div>
          )}

          {/* Notes */}
          <div className="bg-slate-800 rounded-2xl p-5 border border-slate-700">
            <label className="block text-sm font-semibold text-slate-300 mb-2">Add Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Enter work notes, observations..."
              className="w-full bg-slate-700 rounded-xl px-3 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              rows={3}
            />
          </div>

          {/* Action Button */}
          {(() => {
            const action = getNextAction(selectedJob)
            if (!action || selectedJob.status === 'completed' || selectedJob.status === 'verified') {
              return (
                <div className="flex items-center justify-center gap-2 py-4 text-green-400 font-semibold">
                  <CheckCircle2 className="w-5 h-5" /> Job Completed
                </div>
              )
            }
            return (
              <button
                onClick={() => updateStatus(selectedJob.id, action.next)}
                disabled={updating}
                className={`w-full py-4 ${action.color} rounded-2xl font-bold text-lg transition-all active:scale-95 disabled:opacity-50`}
              >
                {updating ? 'Updating...' : action.label}
              </button>
            )
          })()}
        </div>
      ) : (
        /* Job List */
        <div className="p-4 space-y-6 max-w-lg mx-auto">
          {/* Today's Jobs */}
          {todayJobs.length > 0 && (
            <div>
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-500" />
                Today's Jobs ({todayJobs.length})
              </h2>
              <div className="space-y-3">
                {todayJobs.map((job) => <JobCard key={job.id} job={job} onSelect={() => setSelectedJob(job)} onUpdateStatus={updateStatus} updating={updating} />)}
              </div>
            </div>
          )}

          {/* All Jobs */}
          {otherJobs.length > 0 && (
            <div>
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                Other Jobs ({otherJobs.length})
              </h2>
              <div className="space-y-3">
                {otherJobs.map((job) => <JobCard key={job.id} job={job} onSelect={() => setSelectedJob(job)} onUpdateStatus={updateStatus} updating={updating} />)}
              </div>
            </div>
          )}

          {localJobs.length === 0 && (
            <div className="text-center py-16">
              <Wrench className="w-12 h-12 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-400 font-medium">No jobs assigned</p>
              <p className="text-slate-600 text-sm mt-1">Your jobs will appear here once assigned</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function JobCard({ job, onSelect, onUpdateStatus, updating }: {
  job: Job
  onSelect: () => void
  onUpdateStatus: (id: string, status: string) => void
  updating: boolean
}) {
  const customer = job.customers

  const getNextAction = () => {
    if (job.status === 'new' || job.status === 'assigned') return { label: 'Accept', next: 'accepted', color: 'bg-blue-500' }
    if (job.status === 'accepted') return { label: 'On the Way', next: 'on_the_way', color: 'bg-cyan-500' }
    if (job.status === 'on_the_way') return { label: 'Start Work', next: 'work_started', color: 'bg-teal-500' }
    if (job.status === 'work_started') return { label: 'Complete', next: 'completed', color: 'bg-green-500' }
    return null
  }

  const action = getNextAction()

  return (
    <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden">
      <button onClick={onSelect} className="w-full text-left p-4">
        <div className="flex items-start justify-between mb-2">
          <span className="text-xs font-mono text-slate-400">{job.work_order_number}</span>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${getPriorityColor(job.priority)}`}>
              {job.priority}
            </span>
            <ChevronRight className="w-4 h-4 text-slate-500" />
          </div>
        </div>
        <p className="font-semibold text-white text-sm mb-3 line-clamp-2">
          {job.job_description ?? 'No description'}
        </p>
        <div className="flex items-center justify-between">
          <div className="text-xs text-slate-400 space-y-0.5">
            <p>👤 {customer?.full_name}</p>
            {job.scheduled_date && <p>📅 {formatDate(job.scheduled_date)}</p>}
          </div>
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${getStatusColor(job.status)}`}>
            {formatStatus(job.status)}
          </span>
        </div>
      </button>

      {action && (
        <div className="border-t border-slate-700 flex">
          {customer?.mobile_number && (
            <a
              href={`tel:${customer.mobile_number}`}
              className="flex-shrink-0 p-3 border-r border-slate-700 text-slate-400 hover:text-green-400 transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              <Phone className="w-4 h-4" />
            </a>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onUpdateStatus(job.id, action.next) }}
            disabled={updating}
            className={`flex-1 py-3 text-center text-sm font-bold ${action.color} hover:opacity-90 transition-opacity disabled:opacity-50 text-white`}
          >
            {action.label}
          </button>
        </div>
      )}

      {job.status === 'completed' && (
        <div className="border-t border-slate-700 p-3 flex items-center justify-center gap-2 text-green-400 text-sm font-semibold">
          <CheckCircle2 className="w-4 h-4" /> Completed
        </div>
      )}
    </div>
  )
}
