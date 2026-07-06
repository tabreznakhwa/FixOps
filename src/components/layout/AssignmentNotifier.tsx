'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Bell, X, ExternalLink } from 'lucide-react'
import Link from 'next/link'

interface AssignmentNotif {
  id: string
  complaintId: string
  complaintNumber: string
  description: string
}

function playSound() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new AudioCtx()
    // Three ascending tones: pleasant notification chime
    const tones = [
      { freq: 880, start: 0, dur: 0.14 },
      { freq: 1100, start: 0.17, dur: 0.14 },
      { freq: 1320, start: 0.34, dur: 0.25 },
    ]
    tones.forEach(({ freq, start, dur }) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0, ctx.currentTime + start)
      gain.gain.linearRampToValueAtTime(0.28, ctx.currentTime + start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur)
      osc.start(ctx.currentTime + start)
      osc.stop(ctx.currentTime + start + dur + 0.05)
    })
  } catch {
    // Audio not available in this browser/context
  }
}

export function AssignmentNotifier({ userId }: { userId: string }) {
  const [notifs, setNotifs] = useState<AssignmentNotif[]>([])

  const dismiss = useCallback((id: string) => {
    setNotifs((prev) => prev.filter((n) => n.id !== id))
  }, [])

  useEffect(() => {
    const supabase = createClient()

    // Request browser notification permission (non-blocking)
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }

    const channel = supabase
      .channel(`assignment-notifier-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'complaints',
          filter: `assigned_to=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as {
            id: string
            complaint_number: string
            description: string
            status: string
          }

          if (row.status !== 'assigned') return

          playSound()

          // Browser push notification if granted
          if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
            new Notification('New Job Assigned — FixOps', {
              body: `${row.complaint_number}: ${(row.description ?? '').slice(0, 100)}`,
            })
          }

          const notif: AssignmentNotif = {
            id: `${row.id}-${Date.now()}`,
            complaintId: row.id,
            complaintNumber: row.complaint_number,
            description: row.description ?? '',
          }

          setNotifs((prev) => [notif, ...prev].slice(0, 4))
          setTimeout(() => dismiss(notif.id), 9000)
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId, dismiss])

  if (notifs.length === 0) return null

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 w-80">
      {notifs.map((n) => (
        <div
          key={n.id}
          className="animate-slide-in bg-white border border-blue-200 rounded-xl shadow-2xl p-4 flex items-start gap-3"
        >
          <div className="w-9 h-9 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
            <Bell className="w-4 h-4 text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-slate-900">New Job Assigned</p>
            <p className="text-xs font-mono text-blue-600 mt-0.5">{n.complaintNumber}</p>
            <p className="text-xs text-slate-600 mt-1 line-clamp-2">{n.description}</p>
            <Link
              href={`/complaints/${n.complaintId}`}
              onClick={() => dismiss(n.id)}
              className="inline-flex items-center gap-1 mt-2 text-xs font-semibold text-blue-600 hover:text-blue-700"
            >
              View complaint <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
          <button
            type="button"
            onClick={() => dismiss(n.id)}
            className="text-slate-400 hover:text-slate-600 flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  )
}
