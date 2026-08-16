import { describe, expect, it, vi } from 'vitest'
import {
  DESKTOP_SESSION_ACTIVATION_EVENT,
  parseSessionActivationDetail,
  registerDesktopSessionActivation,
  type SessionActivationPort,
} from '../src/client/activation.js'

function activationEvent(detail: unknown): Event {
  const event = new Event(DESKTOP_SESSION_ACTIVATION_EVENT)
  Object.defineProperty(event, 'detail', { value: detail })
  return event
}

function sessions(ids: string[] = ['session-1']): SessionActivationPort & {
  open: ReturnType<typeof vi.fn<(sessionId: string) => void>>
} {
  const byId = Object.fromEntries(ids.map(id => [id, {}]))
  return {
    list: { getSnapshot: () => ({ byId }) },
    open: vi.fn<(sessionId: string) => void>(),
    subagentAddress: () => undefined,
  }
}

describe('desktop session activation', () => {
  it('opens a listed session and disposes its listener', () => {
    const target = new EventTarget()
    const port = sessions()
    const dispose = registerDesktopSessionActivation(target, port)

    target.dispatchEvent(activationEvent({ version: 1, sessionId: 'session-1', turn: 2 }))
    expect(port.open).toHaveBeenCalledWith('session-1')

    dispose()
    target.dispatchEvent(activationEvent({ version: 1, sessionId: 'session-1' }))
    expect(port.open).toHaveBeenCalledTimes(1)
  })

  it('opens a retained addressed subagent', () => {
    const target = new EventTarget()
    const port = sessions([])
    port.subagentAddress = id => id === 'subagent-1' ? {} : undefined
    registerDesktopSessionActivation(target, port)

    target.dispatchEvent(activationEvent({ version: 1, sessionId: 'subagent-1' }))
    expect(port.open).toHaveBeenCalledWith('subagent-1')
  })

  it('rejects malformed details and unknown sessions without disclosing their ids', () => {
    expect(parseSessionActivationDetail({ version: 2, sessionId: 'session-1' })).toBeNull()
    expect(parseSessionActivationDetail({ version: 1, sessionId: ' session-1' })).toBeNull()
    expect(parseSessionActivationDetail({ version: 1, sessionId: 'session-1', extra: true })).toBeNull()
    expect(parseSessionActivationDetail({ version: 1, sessionId: 'session-1', turn: -1 })).toBeNull()

    const target = new EventTarget()
    const port = sessions([])
    const warn = vi.fn<(message: string) => void>()
    registerDesktopSessionActivation(target, port, { warn })
    target.dispatchEvent(activationEvent({ version: 1, sessionId: 'private-session' }))

    expect(port.open).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0][0]).not.toContain('private-session')
  })
})
