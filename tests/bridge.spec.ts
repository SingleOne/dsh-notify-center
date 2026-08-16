import { describe, expect, it, vi } from 'vitest'
import {
  createDesktopBridgeFromEnvironment,
  DESKTOP_BRIDGE_PROTOCOL_VERSION,
} from '../src/bridge.js'
import { resolveConfig } from '../src/config.js'
import type { NotificationEnvelope } from '../src/types.js'

const envelope: NotificationEnvelope = {
  id: 'session-1:turn:2',
  kind: 'completed',
  sessionId: 'session-1',
  turn: 2,
  title: '发布任务',
  summary: '发布成功',
  tools: ['bash'],
  durationMs: 1_500,
  time: 1_700_000_000_000,
}

describe('desktop notification bridge', () => {
  it('delivers a rendered notification through an authenticated loopback request', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }))
    const token = 'a'.repeat(48)
    const bridge = createDesktopBridgeFromEnvironment({
      DSH_NOTIFY_BRIDGE_URL: 'http://127.0.0.1:31555/v1/notifications',
      DSH_NOTIFY_BRIDGE_TOKEN: token,
    }, fetchMock)

    expect(bridge).not.toBeNull()
    await bridge?.deliver(envelope, resolveConfig(), new AbortController().signal)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [endpoint, init] = fetchMock.mock.calls[0]
    expect(String(endpoint)).toBe('http://127.0.0.1:31555/v1/notifications')
    expect(init?.headers).toMatchObject({ authorization: `Bearer ${token}` })
    const payload = JSON.parse(String(init?.body)) as {
      version: number
      notification: Record<string, unknown>
    }
    expect(payload.version).toBe(DESKTOP_BRIDGE_PROTOCOL_VERSION)
    expect(payload.notification).toMatchObject({
      id: envelope.id,
      kind: 'completed',
      title: 'DSH 任务完成',
      sessionId: 'session-1',
      turn: 2,
      sound: true,
    })
    expect(payload.notification.body).toContain('发布成功')
  })

  it('refuses non-loopback, incomplete, and weak bridge credentials', () => {
    expect(() => createDesktopBridgeFromEnvironment({
      DSH_NOTIFY_BRIDGE_URL: 'https://example.com/v1/notifications',
      DSH_NOTIFY_BRIDGE_TOKEN: 'a'.repeat(48),
    })).toThrow('127.0.0.1')
    expect(() => createDesktopBridgeFromEnvironment({
      DSH_NOTIFY_BRIDGE_URL: 'http://127.0.0.1:3000/v1/notifications',
    })).toThrow('incomplete')
    expect(() => createDesktopBridgeFromEnvironment({
      DSH_NOTIFY_BRIDGE_URL: 'http://127.0.0.1:3000/v1/notifications',
      DSH_NOTIFY_BRIDGE_TOKEN: 'short',
    })).toThrow('token is invalid')
  })

  it('does not disclose the endpoint or token when transport fails', async () => {
    const secret = 'secret-token-that-must-not-appear-1234567890'
    const endpoint = 'http://127.0.0.1:31556/private/path'
    const bridge = createDesktopBridgeFromEnvironment({
      DSH_NOTIFY_BRIDGE_URL: endpoint,
      DSH_NOTIFY_BRIDGE_TOKEN: secret,
    }, vi.fn<typeof fetch>().mockRejectedValue(new Error(`${endpoint}?token=${secret}`)))

    let message = ''
    try {
      await bridge?.deliver(envelope, resolveConfig(), new AbortController().signal)
    } catch (error) {
      message = error instanceof Error ? error.message : String(error)
    }
    expect(message).toBe('desktop bridge request failed')
    expect(message).not.toContain(endpoint)
    expect(message).not.toContain(secret)
  })
})
