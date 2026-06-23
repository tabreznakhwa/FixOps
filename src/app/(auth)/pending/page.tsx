'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Clock, LogOut, Wrench, CheckCircle2, Mail } from 'lucide-react'

export default function PendingPage() {
  const supabase = createClient()
  const router = useRouter()

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl p-8 max-w-md w-full text-center shadow-2xl">
        <div className="w-16 h-16 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <Clock className="w-8 h-8 text-amber-600" />
        </div>

        <div className="flex items-center justify-center gap-2 mb-2">
          <Wrench className="w-4 h-4 text-blue-600" />
          <span className="text-sm font-semibold text-blue-600">FixOps</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-3">Access Pending Approval</h1>
        <p className="text-slate-500 mb-8">
          Your Google account has been registered. An administrator will review and approve your access shortly.
        </p>

        <div className="space-y-3 mb-8 text-left">
          {[
            { icon: CheckCircle2, text: 'Google sign-in successful', done: true },
            { icon: Clock, text: 'Admin approval in progress', done: false },
            { icon: Mail, text: "You'll receive access confirmation", done: false },
          ].map(({ icon: Icon, text, done }) => (
            <div key={text} className="flex items-center gap-3 p-3 rounded-lg bg-slate-50">
              <Icon className={`w-5 h-5 flex-shrink-0 ${done ? 'text-green-500' : 'text-slate-400'}`} />
              <span className={`text-sm ${done ? 'text-slate-700 font-medium' : 'text-slate-500'}`}>{text}</span>
            </div>
          ))}
        </div>

        <button
          onClick={signOut}
          className="flex items-center justify-center gap-2 w-full py-2.5 px-4 border border-slate-200 rounded-xl text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </div>
  )
}
