import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import { describe, expect, it } from 'vitest'
import { CompletionGate, DedupeCache, TurnAccumulator } from '../src/events.js'

function event(value: unknown): SessionEvent {
  return value as SessionEvent
}

function sessionWith(events: SessionEvent[]): Session {
  return { id: 'session-1', events } as unknown as Session
}

describe('TurnAccumulator', () => {
  it('builds one bounded completion envelope with tools and duration', () => {
    const events: SessionEvent[] = []
    const session = sessionWith(events)
    const accumulator = new TurnAccumulator(80)
    const values = [
      event({ type: 'user/message', seq: 1, time: 900, data: { content: [{ type: 'text', text: '实现通知插件' }] } }),
      event({ type: 'turn/start', seq: 2, time: 1_000, data: { turn: 3 } }),
      event({ type: 'assistant/message', seq: 3, time: 2_000, data: { turn: 3, step: 1, message: { role: 'assistant', content: [{ type: 'text', text: '已经完成核心实现' }] } } }),
      event({ type: 'tool/call', seq: 4, time: 2_500, data: { turn: 3, step: 1, callId: 'c1', name: 'exec', arguments: '{}' } }),
      event({ type: 'tool/call', seq: 5, time: 2_600, data: { turn: 3, step: 1, callId: 'c2', name: 'exec', arguments: '{}' } }),
      event({ type: 'turn/end', seq: 6, time: 4_500, data: { turn: 3, reason: { kind: 'completed' } } }),
    ]
    let envelope = null
    for (const value of values) {
      events.push(value)
      envelope = accumulator.observe(session, value) ?? envelope
    }
    expect(envelope).toMatchObject({
      id: 'session-1:turn:3',
      kind: 'completed',
      title: '实现通知插件',
      summary: '已经完成核心实现',
      tools: ['exec'],
      durationMs: 3_500,
    })
  })

  it('reconstructs a turn when the plugin starts after turn/start', () => {
    const events = [
      event({ type: 'turn/start', seq: 1, time: 100, data: { turn: 1 } }),
      event({ type: 'assistant/message', seq: 2, time: 200, data: { turn: 1, step: 1, message: { role: 'assistant', content: [{ type: 'text', text: 'fallback' }] } } }),
      event({ type: 'turn/end', seq: 3, time: 500, data: { turn: 1, reason: { kind: 'error', error: { message: 'boom', code: 'UNKNOWN' } } } }),
    ]
    const envelope = new TurnAccumulator(100).observe(sessionWith(events), events[2])
    expect(envelope).toMatchObject({ kind: 'error', summary: 'fallback', reason: 'boom', durationMs: 400 })
  })

  it('emits an approval envelope without closing the active turn', () => {
    const events: SessionEvent[] = []
    const session = sessionWith(events)
    const accumulator = new TurnAccumulator(100)
    const asked = event({
      type: 'approval/asked',
      seq: 1,
      time: 100,
      data: { id: 'approval-1', toolName: 'bash', reason: '需要执行命令' },
    })
    events.push(asked)
    expect(accumulator.observe(session, asked)).toMatchObject({
      id: 'session-1:approval:approval-1',
      kind: 'approval',
      tools: ['bash'],
    })
  })
})

describe('DedupeCache', () => {
  it('accepts an event once and expires it after the TTL', () => {
    const cache = new DedupeCache(10, 100)
    expect(cache.accept('a', 1_000)).toBe(true)
    expect(cache.accept('a', 1_050)).toBe(false)
    expect(cache.accept('a', 1_101)).toBe(true)
  })
})

describe('CompletionGate', () => {
  it('holds every completed turn until the agent becomes idle', () => {
    const gate = new CompletionGate()
    const first = { id: 's:turn:1', sessionId: 's', kind: 'completed', title: 'one', summary: '', tools: [], time: 1 } as const
    const second = { id: 's:turn:2', sessionId: 's', kind: 'completed', title: 'two', summary: '', tools: [], time: 2 } as const
    gate.enqueue(first)
    gate.enqueue(second)
    expect(gate.flush('s')).toEqual([first, second])
    expect(gate.flush('s')).toEqual([])
  })
})
