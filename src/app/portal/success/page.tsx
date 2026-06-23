import Link from 'next/link'
import { CheckCircle2, Phone, Clock, Wrench } from 'lucide-react'

export default async function PortalSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>
}) {
  const params = await searchParams
  const ref = params.ref ?? 'Your request'

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex flex-col">
      {/* Header */}
      <div className="bg-slate-900/80 backdrop-blur-md border-b border-white/10">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center">
            <Wrench className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="text-white font-bold text-lg leading-none">FixOps</div>
            <div className="text-blue-300 text-xs mt-0.5">Service Request Portal</div>
          </div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="max-w-sm w-full text-center animate-fade-in">
          {/* Success icon */}
          <div className="relative inline-flex items-center justify-center mb-8">
            <div className="absolute inset-0 bg-green-500/20 rounded-full scale-150 animate-ping" />
            <div className="relative w-24 h-24 bg-green-500/20 border-2 border-green-400/50 rounded-full flex items-center justify-center">
              <CheckCircle2 className="w-12 h-12 text-green-400" />
            </div>
          </div>

          <h1 className="text-3xl font-bold text-white mb-3">Request Received!</h1>
          <p className="text-blue-200 text-sm mb-8">
            Our team has been notified and will contact you shortly.
          </p>

          {/* Reference card */}
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20 mb-8 text-left">
            <div className="text-white/50 text-xs uppercase tracking-wider mb-1">Your Reference Number</div>
            <div className="text-2xl font-bold text-white font-mono tracking-wider">{ref}</div>
            <p className="text-white/50 text-xs mt-2">Keep this for your records. Use it to follow up on your request.</p>
          </div>

          {/* What happens next */}
          <div className="bg-white/5 rounded-2xl p-5 border border-white/10 text-left space-y-4 mb-8">
            <h3 className="text-white font-semibold text-sm">What happens next?</h3>
            <div className="space-y-3">
              {[
                { icon: Phone, text: 'Our team will call you within 2 hours to confirm the appointment' },
                { icon: Clock, text: 'A technician will be scheduled based on your preferred date & priority' },
                { icon: CheckCircle2, text: 'You\'ll receive updates when the technician is on the way' },
              ].map(({ icon: Icon, text }, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="w-7 h-7 bg-blue-600/30 border border-blue-400/30 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Icon className="w-3.5 h-3.5 text-blue-300" />
                  </div>
                  <p className="text-white/70 text-sm leading-relaxed">{text}</p>
                </div>
              ))}
            </div>
          </div>

          <Link
            href="/portal"
            className="block w-full bg-white/10 hover:bg-white/15 border border-white/20 text-white font-semibold py-4 rounded-2xl transition text-sm"
          >
            Submit Another Request
          </Link>
        </div>
      </div>
    </div>
  )
}
