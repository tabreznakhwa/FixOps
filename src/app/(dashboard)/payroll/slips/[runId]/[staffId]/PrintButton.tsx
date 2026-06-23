'use client'

import { Printer, Download } from 'lucide-react'

export function PrintButton() {
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => window.print()}
        className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition-colors"
      >
        <Printer className="w-4 h-4" /> Print
      </button>
      <button
        onClick={() => window.print()}
        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
      >
        <Download className="w-4 h-4" /> Save PDF
      </button>
    </div>
  )
}
