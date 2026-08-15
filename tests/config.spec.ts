import { describe, expect, it } from 'vitest'
import { resolveConfig } from '../src/config.js'

describe('resolveConfig', () => {
  it('applies safe defaults', () => {
    const config = resolveConfig()
    expect(config.local).toEqual({ enabled: true, sound: true })
    expect(config.events.completed).toBe(true)
    expect(config.events.aborted).toBe(false)
    expect(config.notifySubagents).toBe(false)
    expect(config.webhooks).toEqual([])
    expect(config.delivery).toEqual({
      timeoutMs: 5_000,
      retries: 2,
      retryBaseMs: 500,
      maxBodyChars: 400,
    })
  })

  it('normalizes per-channel webhook policy', () => {
    const config = resolveConfig({
      webhooks: {
        feishu: {
          url: 'https://example.com/hook?id=secret',
          events: ['completed', 'approval'],
          includeSummary: true,
        },
      },
    })
    expect(config.webhooks).toHaveLength(1)
    expect(config.webhooks[0].name).toBe('feishu')
    expect(config.webhooks[0].events).toEqual(new Set(['completed', 'approval']))
    expect(config.webhooks[0].includeSummary).toBe(true)
  })

  it('rejects invalid webhook URLs and regular expressions', () => {
    expect(() => resolveConfig({ webhooks: { custom: 'file:///tmp/hook' } }))
      .toThrow('must use HTTP or HTTPS')
    expect(() => resolveConfig({ rules: [{ pattern: '[', regex: true }] }))
      .toThrow('invalid regular expression')
    expect(() => resolveConfig({
      webhooks: { custom: { url: 'https://example.com', events: ['unknown' as never] } },
    })).toThrow('unknown notification kind')
  })
})
