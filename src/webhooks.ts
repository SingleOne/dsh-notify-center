import type {
  NotificationEnvelope,
  NotificationLocale,
  ResolvedWebhookChannel,
  WebhookChannelName,
} from './types.js'
import { renderWebhookText } from './render.js'

export type FetchLike = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Pick<Response, 'ok' | 'status'>>

export interface WebhookDeliveryOptions {
  readonly timeoutMs: number
  readonly retries: number
  readonly retryBaseMs: number
  readonly locale: NotificationLocale
  readonly signal: AbortSignal
  readonly fetch?: FetchLike
  readonly sleep?: (ms: number, signal: AbortSignal) => Promise<void>
}

function webhookPayload(
  channel: WebhookChannelName,
  envelope: NotificationEnvelope,
  text: string,
): unknown {
  switch (channel) {
    case 'feishu': return { msg_type: 'text', content: { text } }
    case 'wecom': return { msgtype: 'text', text: { content: text } }
    case 'dingtalk': return { msgtype: 'text', text: { content: text } }
    case 'slack': return { text }
    case 'discord': return { content: text }
    case 'custom': return {
      text,
      kind: envelope.kind,
      title: envelope.title,
      sessionId: envelope.sessionId,
      turn: envelope.turn,
      durationMs: envelope.durationMs,
      time: new Date(envelope.time).toISOString(),
    }
  }
}

function defaultSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error('webhook delivery cancelled'))
      return
    }
    const timer = setTimeout(done, ms)
    function done(): void {
      signal.removeEventListener('abort', abort)
      resolve()
    }
    function abort(): void {
      clearTimeout(timer)
      reject(new Error('webhook delivery cancelled'))
    }
    signal.addEventListener('abort', abort, { once: true })
  })
}

function requestSignal(parent: AbortSignal, timeoutMs: number): { signal: AbortSignal; cleanup(): void } {
  const controller = new AbortController()
  const abort = (): void => controller.abort(parent.reason)
  parent.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(() => controller.abort(new Error('webhook request timed out')), timeoutMs)
  return {
    signal: controller.signal,
    cleanup(): void {
      clearTimeout(timer)
      parent.removeEventListener('abort', abort)
    },
  }
}

function retryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500
}

function safeError(error: unknown, secretUrl: string): string {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  return message.replaceAll(secretUrl, '[redacted webhook]')
}

export async function deliverWebhook(
  channel: ResolvedWebhookChannel,
  envelope: NotificationEnvelope,
  options: WebhookDeliveryOptions,
): Promise<number> {
  const fetchImpl = options.fetch ?? fetch
  const sleep = options.sleep ?? defaultSleep
  const text = renderWebhookText(envelope, channel.includeSummary, options.locale)
  const body = JSON.stringify(webhookPayload(channel.name, envelope, text))
  let lastError = 'unknown error'

  for (let attempt = 0; attempt <= options.retries; attempt += 1) {
    if (options.signal.aborted) throw new Error('webhook delivery cancelled')
    const request = requestSignal(options.signal, options.timeoutMs)
    try {
      const response = await fetchImpl(channel.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        signal: request.signal,
      })
      if (response.ok) return attempt + 1
      lastError = `HTTP ${response.status}`
      if (!retryableStatus(response.status)) break
    } catch (error) {
      lastError = safeError(error, channel.url)
      if (options.signal.aborted) throw new Error('webhook delivery cancelled')
    } finally {
      request.cleanup()
    }
    if (attempt < options.retries) {
      await sleep(options.retryBaseMs * (2 ** attempt), options.signal)
    }
  }

  throw new Error(`${channel.name} webhook failed after ${options.retries + 1} attempt(s): ${lastError}`)
}
