'use client'

import { Download } from 'lucide-react'

export function WPSExportButton() {
  return (
    <button
      onClick={() => alert('WPS Export coming soon')}
      className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition"
    >
      <Download className="w-4 h-4" /> Export WPS
    </button>
  )
}
