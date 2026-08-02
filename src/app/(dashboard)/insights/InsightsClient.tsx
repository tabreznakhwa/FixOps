'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, Loader2, AlertCircle, KeyRound } from 'lucide-react'

/**
 * Renders the constrained markdown subset our prompt asks for (## headings,
 * bullets, numbered lists, **bold**) as React elements.
 *
 * Built as elements rather than dangerouslySetInnerHTML on purpose: this text
 * comes back from a third-party API, so it is never treated as trusted HTML.
 */
function renderInline(text: string, keyPrefix: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? (
      <strong key={`${keyPrefix}-${i}`} className="font-semibold text-slate-900">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <span key={`${keyPrefix}-${i}`}>{part}</span>
    )
  )
}

function Markdown({ text }: { text: string }) {
  const lines = text.split('\n')
  const out: React.ReactNode[] = []
  let list: { ordered: boolean; items: string[] } | null = null

  const flush = () => {
    if (!list) return
    const Tag = list.ordered ? 'ol' : 'ul'
    out.push(
      <Tag
        key={`list-${out.length}`}
        className={`my-3 space-y-1.5 pl-5 text-sm text-slate-700 ${
          list.ordered ? 'list-decimal' : 'list-disc'
        }`}
      >
        {list.items.map((it, i) => (
          <li key={i} className="leading-relaxed">{renderInline(it, `li-${out.length}-${i}`)}</li>
        ))}
      </Tag>
    )
    list = null
  }

  lines.forEach((raw, idx) => {
    const line = raw.trimEnd()
    if (!line.trim()) { flush(); return }

    const heading = line.match(/^(#{1,4})\s+(.*)$/)
    if (heading) {
      flush()
      const level = heading[1].length
      out.push(
        <h3
          key={`h-${idx}`}
          className={`font-bold text-slate-900 ${level <= 2 ? 'text-base mt-6 mb-2 first:mt-0' : 'text-sm mt-4 mb-1.5'}`}
        >
          {heading[2]}
        </h3>
      )
      return
    }

    const ordered = line.match(/^\s*\d+[.)]\s+(.*)$/)
    if (ordered) {
      if (!list?.ordered) { flush(); list = { ordered: true, items: [] } }
      list.items.push(ordered[1])
      return
    }

    const bullet = line.match(/^\s*[-*•]\s+(.*)$/)
    if (bullet) {
      if (!list || list.ordered) { flush(); list = { ordered: false, items: [] } }
      list.items.push(bullet[1])
      return
    }

    flush()
    out.push(
      <p key={`p-${idx}`} className="my-2 text-sm leading-relaxed text-slate-700">
        {renderInline(line, `p-${idx}`)}
      </p>
    )
  })

  flush()
  return <div>{out}</div>
}

export function InsightsClient({
  initialAnalysis,
  initialGeneratedAt,
  hasEnoughData,
}: {
  initialAnalysis: string | null
  initialGeneratedAt: string | null
  hasEnoughData: boolean
}) {
  const router = useRouter()
  const [analysis, setAnalysis] = useState(initialAnalysis)
  const [generatedAt, setGeneratedAt] = useState(initialGeneratedAt)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [needsSetup, setNeedsSetup] = useState(false)
  const [warning, setWarning] = useState('')

  async function generate() {
    setLoading(true)
    setError('')
    setNeedsSetup(false)
    setWarning('')
    try {
      const res = await fetch('/api/insights/generate', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Failed to generate analysis')
        setNeedsSetup(Boolean(data.needsSetup))
        return
      }
      setAnalysis(data.analysis)
      setGeneratedAt(new Date().toISOString())
      if (data.warning) setWarning(data.warning)
      router.refresh()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const fmtWhen = (iso: string) =>
    new Date(iso).toLocaleString('en-GB', {
      timeZone: 'Asia/Kuwait', day: 'numeric', month: 'short',
      year: 'numeric', hour: '2-digit', minute: '2-digit',
    })

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h3 className="font-semibold text-slate-900 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-blue-600" />
              AI Business Advisor
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {generatedAt
                ? `Last generated ${fmtWhen(generatedAt)}`
                : 'Analyses the last 6 months and recommends where to focus.'}
            </p>
          </div>
          <button
            onClick={generate}
            disabled={loading || !hasEnoughData}
            className="print:hidden flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg disabled:opacity-60 transition-colors whitespace-nowrap"
          >
            {loading
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Analysing…</>
              : <><Sparkles className="w-4 h-4" /> {analysis ? 'Regenerate' : 'Generate Analysis'}</>}
          </button>
        </div>

        <div className="p-5">
          {!hasEnoughData && (
            <p className="text-sm text-slate-500">
              Not enough trading data in the last 6 months to analyse yet. Record some
              invoices and expenses first.
            </p>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">
              <p className="text-sm text-red-700 flex items-start gap-2">
                {needsSetup ? <KeyRound className="w-4 h-4 mt-0.5 flex-shrink-0" />
                            : <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />}
                <span>{error}</span>
              </p>
              {needsSetup && (
                <div className="mt-3 text-xs text-red-700 space-y-1 pl-6">
                  <p className="font-semibold">To enable this feature:</p>
                  <p>1. Get an API key at platform.deepseek.com</p>
                  <p>2. In Vercel → Project → Settings → Environment Variables, add <code className="bg-red-100 px-1 rounded">AI_API_KEY</code></p>
                  <p>3. Redeploy</p>
                </div>
              )}
            </div>
          )}

          {warning && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 mb-4">
              <p className="text-sm text-amber-800">{warning}</p>
            </div>
          )}

          {loading && !analysis && (
            <div className="py-10 text-center">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600 mx-auto mb-3" />
              <p className="text-sm text-slate-500">
                Reading your last 6 months of trading…
              </p>
            </div>
          )}

          {analysis && <Markdown text={analysis} />}

          {!analysis && !loading && hasEnoughData && !error && (
            <p className="text-sm text-slate-500">
              Click <strong>Generate Analysis</strong> to get a review of revenue,
              margins, collections and stock, with specific actions for this month.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
