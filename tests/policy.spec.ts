import { describe, expect, it } from 'vitest'
import { resolveConfig } from '../src/config.js'
import { shouldNotify } from '../src/policy.js'
import type { NotificationEnvelope } from '../src/types.js'

const envelope: NotificationEnvelope = {
  id: 's:turn:1',
  kind: 'completed',
  sessionId: 's',
  turn: 1,
  title: '生产部署',
  summary: '部署成功',
  tools: ['bash'],
  time: 1,
}

describe('notification policy', () => {
  it('supports include and exclude rules', () => {
    expect(shouldNotify(resolveConfig({ rules: [{ mode: 'include', pattern: '部署' }] }), envelope)).toBe(true)
    expect(shouldNotify(resolveConfig({ rules: [{ mode: 'include', pattern: '测试' }] }), envelope)).toBe(false)
    expect(shouldNotify(resolveConfig({ rules: [{ mode: 'exclude', pattern: 'bash' }] }), envelope)).toBe(false)
  })

  it('honors per-outcome switches', () => {
    expect(shouldNotify(resolveConfig({ events: { completed: false } }), envelope)).toBe(false)
  })
})
