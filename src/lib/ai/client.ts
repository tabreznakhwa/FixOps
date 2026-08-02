/**
 * Minimal client for OpenAI-compatible chat APIs.
 *
 * DeepSeek, Qwen (DashScope), GLM (Zhipu), Moonshot and others all expose the
 * same /chat/completions contract, so switching provider is an env change —
 * no code edit, no SDK dependency.
 *
 *   AI_BASE_URL   https://api.deepseek.com/v1        (default)
 *   AI_MODEL      deepseek-chat                      (default)
 *   AI_API_KEY    provider key
 *
 * Alternatives:
 *   Qwen  → https://dashscope-intl.aliyuncs.com/compatible-mode/v1  + qwen-flash
 *   GLM   → https://open.bigmodel.cn/api/paas/v4                    + glm-4.6
 */

const DEFAULT_BASE_URL = 'https://api.deepseek.com/v1'
const DEFAULT_MODEL = 'deepseek-chat'

export class AIConfigError extends Error {}
export class AIRequestError extends Error {}

export function aiConfig() {
  const apiKey = process.env.AI_API_KEY
  if (!apiKey) {
    throw new AIConfigError(
      'AI_API_KEY is not set. Add it in Vercel → Settings → Environment Variables.'
    )
  }
  return {
    apiKey,
    baseUrl: (process.env.AI_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, ''),
    model: process.env.AI_MODEL ?? DEFAULT_MODEL,
  }
}

/** True when a key is configured — lets the UI explain setup instead of failing on click. */
export function isAIConfigured() {
  return Boolean(process.env.AI_API_KEY)
}

interface ChatOptions {
  system: string
  user: string
  /** Upper bound on reply length. Analyses run long, so this defaults generously. */
  maxTokens?: number
  temperature?: number
  /** Abort if the provider is slow — the route holds a request open meanwhile. */
  timeoutMs?: number
}

export async function chat({
  system,
  user,
  maxTokens = 4000,
  temperature = 0.3,
  timeoutMs = 120_000,
}: ChatOptions): Promise<string> {
  const { apiKey, baseUrl, model } = aiConfig()

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  let res: Response
  try {
    res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature,
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
      signal: controller.signal,
    })
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new AIRequestError('The AI provider took too long to respond. Please try again.')
    }
    throw new AIRequestError(
      `Could not reach the AI provider: ${err instanceof Error ? err.message : String(err)}`
    )
  } finally {
    clearTimeout(timer)
  }

  if (!res.ok) {
    // Provider error bodies are inconsistent — surface whatever is readable
    // rather than a bare status code, but never leak the API key.
    const raw = await res.text().catch(() => '')
    let detail = raw.slice(0, 400)
    try {
      const parsed = JSON.parse(raw)
      detail = parsed?.error?.message ?? parsed?.message ?? detail
    } catch {
      /* keep the raw snippet */
    }
    if (res.status === 401 || res.status === 403) {
      throw new AIRequestError('The AI provider rejected the API key. Check AI_API_KEY.')
    }
    if (res.status === 429) {
      throw new AIRequestError('AI provider rate limit reached. Wait a moment and try again.')
    }
    throw new AIRequestError(`AI provider error (${res.status}): ${detail}`)
  }

  const data = await res.json().catch(() => null)
  const content = data?.choices?.[0]?.message?.content
  if (typeof content !== 'string' || !content.trim()) {
    throw new AIRequestError('The AI provider returned an empty response.')
  }
  return content.trim()
}
