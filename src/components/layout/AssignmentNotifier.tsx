'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Bell, X, ExternalLink, Volume2 } from 'lucide-react'
import Link from 'next/link'

interface AssignmentNotif {
  id: string
  complaintId: string
  complaintNumber: string
  description: string
}

// Singleton AudioContext — created once on first user gesture, reused thereafter
let _audioCtx: AudioContext | null = null

function getAudioCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (_audioCtx) return _audioCtx
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    _audioCtx = new AudioCtx()
  } catch {
    // not available
  }
  return _audioCtx
}

async function playSound() {
  try {
    const ctx = getAudioCtx()
    if (!ctx) return
    if (ctx.state === 'suspended') await ctx.resume()
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
    // Audio not available
  }
}

export function AssignmentNotifier({ userId }: { userId: string }) {
  const [notifs, setNotifs] = useState<AssignmentNotif[]>([])
  const [audioReady, setAudioReady] = useState(false)
  const audioUnlocked = useRef(false)

  // Unlock audio on first user click anywhere on the page
  useEffect(() => {
    function unlock() {
      if (audioUnlocked.current) return
      audioUnlocked.current = true
      getAudioCtx() // initialise singleton
      setAudioReady(true)
      document.removeEventListener('click', unlock)
      document.removeEventListener('touchstart', unlock)
    }
    document.addEventListener('click', unlock)
    document.addEventListener('touchstart', unlock)
    return () => {
      document.removeEventListener('click', unlock)
      document.removeEventListener('touchstart', unlock)
    }
  }, [])

  const dismiss = useCallback((id: string) => {
    setNotifs((prev) => prev.filter((n) => n.id !== id))
  }, [])

  useEffect(() => {
    const supabase = createClient()

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
            id: string; complaint_number: string; description: string; status: string; assigned_to: string
          }
          const oldRow = payload.old as { assigned_to?: string }

          // Fire only when assigned_to just changed to this user
          const justAssigned = oldRow.assigned_to !== userId
          if (!justAssigned) return

          playSound()

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

    return () => { supabase.removeChannel(channel) }
  }, [userId, dismiss])

  return (
    <>
      {/* Audio unlock hint — shown only until user has clicked once */}
      {!audioReady && (
        <div className="fixed bottom-4 right-4 z-40 flex items-center gap-2 bg-slate-800 text-white text-xs font-medium px-3 py-2 rounded-lg shadow-lg opacity-80">
          <Volume2 className="w-3.5 h-3.5 text-slate-300" />
          Click anywhere to enable sound alerts
        </div>
      )}

      {notifs.length > 0 && (
        <div className="fixed top-4 right-4 z-50 space-y-2 w-80">
          {notifs.map((n) => (
            <div key={n.id}
              className="animate-slide-in bg-white border border-blue-200 rounded-xl shadow-2xl p-4 flex items-start gap-3">
              <div className="w-9 h-9 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                <Bell className="w-4 h-4 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-900">New Job Assigned</p>
                <p className="text-xs font-mono text-blue-600 mt-0.5">{n.complaintNumber}</p>
                <p className="text-xs text-slate-600 mt-1 line-clamp-2">{n.description}</p>
                <Link href={`/complaints/${n.complaintId}`} onClick={() => dismiss(n.id)}
                  className="inline-flex items-center gap-1 mt-2 text-xs font-semibold text-blue-600 hover:text-blue-700">
                  View complaint <ExternalLink className="w-3 h-3" />
                </Link>
              </div>
              <button type="button" onClick={() => dismiss(n.id)} className="text-slate-400 hover:text-slate-600 flex-shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
