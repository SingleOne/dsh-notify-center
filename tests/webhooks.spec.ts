import { describe, expect, it, vi } from 'vitest'
import { resolveConfig } from '../src/config.js'
import type { NotificationEnvelope } from '../src/types.js'
import { deliverWebhook, type FetchLike } from '../src/webhooks.js'

const envelope: NotificationEnvelope = {
  id: 'session-1:turn:2',
  kind: 'completed',
  sessionId: 'session-1',
  turn: 2,
  title: '机密任务',
  summary: '这里是默认不应外发的摘要',
  tools: ['bash'],
  durationMs: 2_000,
  time: Date.UTC(2026, 7, 16),
}

function options(fetch: FetchLike, sleep = vi.fn(async () => undefined)) {
  return {
    timeoutMs: 1_000,
    retries: 2,
    retryBaseMs: 10,
    locale: 'zh' as const,
    signal: new AbortController().signal,
    fetch,
    sleep,
  }
}

describe('deliverWebhook', () => {
  it('uses the platform payload and redacts summaries by default', async () => {
    let body = ''
    const fetch: FetchLike = vi.fn(async (_input, init) => {
      body = String(init?.body)
      return { ok: true, status: 200 }
    })
    const channel = resolveConfig({ webhooks: { feishu: 'https://example.com/secret' } }).webhooks[0]
    await expect(deliverWebhook(channel, envelope, options(fetch))).resolves.toBe(1)
    expect(JSON.parse(body)).toMatchObject({ msg_type: 'text' })
    expect(body).not.toContain(envelope.summary)
  })

  it('retries retryable status codes with exponential delays', async () => {
    const responses = [
      { ok: false, status: 500 },
      { ok: false, status: 429 },
      { ok: true, status: 204 },
    ]
    const fetch: FetchLike = vi.fn(async () => responses.shift()!)
    const sleep = vi.fn(async () => undefined)
    const channel = resolveConfig({ webhooks: { custom: 'https://example.com/private-key' } }).webhooks[0]
    await expect(deliverWebhook(channel, envelope, options(fetch, sleep))).resolves.toBe(3)
    expect(sleep).toHaveBeenNthCalledWith(1, 10, expect.any(AbortSignal))
    expect(sleep).toHaveBeenNthCalledWith(2, 20, expect.any(AbortSignal))
  })

  it('does not retry ordinary 4xx responses or expose the webhook URL', async () => {
    const fetch: FetchLike = vi.fn(async () => ({ ok: false, status: 400 }))
    const channel = resolveConfig({ webhooks: { custom: 'https://example.com/private-key' } }).webhooks[0]
    await expect(deliverWebhook(channel, envelope, options(fetch)))
      .rejects.not.toThrow('https://example.com/private-key')
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
