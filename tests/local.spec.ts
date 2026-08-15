import { describe, expect, it } from 'vitest'
import { resolveConfig } from '../src/config.js'
import { appleScriptQuote, commandForPlatform } from '../src/local.js'
import type { NotificationEnvelope } from '../src/types.js'

const envelope: NotificationEnvelope = {
  id: 'session-1:turn:9',
  kind: 'completed',
  sessionId: 'session-1',
  turn: 9,
  title: '通知测试',
  summary: '任务已完成',
  tools: [],
  time: Date.now(),
}

describe('local notification commands', () => {
  it('streams a PowerShell script and uses a per-event toast tag', () => {
    const command = commandForPlatform('win32', envelope, resolveConfig())
    expect(command?.command).toBe('powershell.exe')
    expect(command?.args.at(-1)).toBe('-')
    const script = command?.stdin ?? ''
    expect(script).toContain("$toast.Tag='session-1-turn-9'")
    expect(script).toContain('DeepSeekHarness.NotifyCenter')
    expect(script).toContain('DshNotifyCenterAumid')
    expect(script).toContain('dsh-notify-center.lnk')
    expect(script).not.toContain(envelope.summary)
  })

  it('quotes AppleScript without invoking a shell', () => {
    expect(appleScriptQuote('a "quote" \\ path')).toBe('"a \\"quote\\" \\\\ path"')
    const command = commandForPlatform('darwin', envelope, resolveConfig())
    expect(command?.command).toBe('osascript')
    expect(command?.args[0]).toBe('-e')
  })

  it('uses notify-send on Linux', () => {
    expect(commandForPlatform('linux', envelope, resolveConfig())?.command).toBe('notify-send')
  })
})
