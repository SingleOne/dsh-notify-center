import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { normalizeSettingsBase } from '../src/config.js'
import { normalizeSettingsValue, NotificationSettingsController } from '../src/client/settings-store.js'
import {
  NotificationSettingsStore,
  SettingsRevisionConflictError,
  SettingsValidationError,
  resolveSettingsPath,
} from '../src/settings-store.js'

const temporaryDirectories: string[] = []

async function settingsPath(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-notify-center-test-'))
  temporaryDirectories.push(directory)
  return join(directory, 'settings.json')
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

describe('notification settings', () => {
  it('normalizes legacy webhook strings into secret-safe object bases', () => {
    expect(normalizeSettingsBase({
      webhooks: { slack: 'https://hooks.slack.com/services/secret' },
    })).toEqual({
      webhooks: { slack: { url: 'https://hooks.slack.com/services/secret' } },
    })
  })

  it('normalizes redacted settings values without requiring secret URLs', () => {
    const value = normalizeSettingsValue({
      locale: 'en',
      webhooks: {
        slack: { events: ['completed', 'approval'], includeSummary: true },
      },
    })
    expect(value.locale).toBe('en')
    expect(value.webhooks.slack).toEqual({ events: ['completed', 'approval'], includeSummary: true })
    expect(value.webhooks.feishu.events).toEqual([
      'completed', 'error', 'aborted', 'blocked', 'max-tokens', 'interrupted', 'approval',
    ])
  })

  it('uses DSH_HOME and falls back to the standard DSH directory', () => {
    expect(resolveSettingsPath({ DSH_HOME: join(homedir(), 'isolated-dsh') }, homedir()))
      .toBe(join(homedir(), 'isolated-dsh', 'dsh-notify-center', 'settings.json'))
    expect(resolveSettingsPath({}, homedir()))
      .toBe(join(homedir(), '.dsh', 'dsh-notify-center', 'settings.json'))
  })

  it('persists user overrides, redacts secrets, and preserves them on ordinary edits', async () => {
    const path = await settingsPath()
    const store = new NotificationSettingsStore({}, { path })
    const first = await store.mutate(0, [
      { op: 'set', path: ['webhooks', 'slack', 'url'], value: 'https://hooks.slack.com/services/top-secret' },
      { op: 'set', path: ['webhooks', 'slack', 'events'], value: ['completed'] },
    ])
    expect(first.revision).toBe(1)
    expect(first.secrets).toContainEqual({ path: ['webhooks', 'slack', 'url'], set: true })
    expect(JSON.stringify(first)).not.toContain('top-secret')

    const second = await store.mutate(1, [{ op: 'set', path: ['locale'], value: 'en' }])
    expect(second.revision).toBe(2)
    expect(store.getResolved().webhooks[0].url).toContain('top-secret')

    const restarted = new NotificationSettingsStore({}, { path })
    expect(restarted.getResolved().locale).toBe('en')
    expect(restarted.getResolved().webhooks[0].url).toContain('top-secret')
    expect(JSON.stringify(restarted.getView())).not.toContain('top-secret')
    expect(await readFile(path, 'utf8')).toContain('top-secret')
  })

  it('supports removing a profile webhook through a user-layer tombstone', async () => {
    const path = await settingsPath()
    const profile = { webhooks: { custom: 'https://example.com/profile-secret' } } as const
    const store = new NotificationSettingsStore(profile, { path })
    expect(store.getResolved().webhooks).toHaveLength(1)
    await store.mutate(0, [{ op: 'unset', path: ['webhooks', 'custom'] }])
    expect(store.getResolved().webhooks).toEqual([])
    expect(store.getView().secrets).toContainEqual({ path: ['webhooks', 'custom', 'url'], set: false })
    expect(new NotificationSettingsStore(profile, { path }).getResolved().webhooks).toEqual([])
  })

  it('serializes writes, detects revision conflicts, and publishes live config', async () => {
    const store = new NotificationSettingsStore({}, { path: await settingsPath() })
    const listener = vi.fn()
    store.subscribe(listener)
    await store.mutate(0, [{ op: 'set', path: ['local', 'enabled'], value: false }])
    await expect(store.mutate(0, [{ op: 'set', path: ['locale'], value: 'en' }]))
      .rejects.toBeInstanceOf(SettingsRevisionConflictError)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener.mock.calls[0][0].local.enabled).toBe(false)
  })

  it('rejects unsupported and prototype-polluting paths', async () => {
    const store = new NotificationSettingsStore({}, { path: await settingsPath() })
    await expect(store.mutate(0, [{ op: 'set', path: ['unknown'], value: true }]))
      .rejects.toBeInstanceOf(SettingsValidationError)
    await expect(store.mutate(0, [{ op: 'set', path: ['webhooks', '__proto__', 'url'], value: 'x' }]))
      .rejects.toBeInstanceOf(SettingsValidationError)
  })

  it('loads and mutates through the plugin-owned browser endpoint', async () => {
    const responses = [
      new Response(JSON.stringify({ revision: 3, writable: true, value: { locale: 'zh' }, secrets: [] }), { status: 200 }),
      new Response(JSON.stringify({ revision: 4, writable: true, value: { locale: 'en' }, secrets: [] }), { status: 200 }),
    ]
    const fetcher = vi.fn().mockImplementation(async () => responses.shift())
    const controller = new NotificationSettingsController(fetcher)
    await controller.load()
    expect(controller.getSnapshot().view?.revision).toBe(3)
    expect(await controller.mutate([{ op: 'set', path: ['locale'], value: 'en' }])).toBe(true)
    expect(controller.getSnapshot().view?.revision).toBe(4)
    expect(fetcher.mock.calls[0][0]).toBe('/api/dsh-notify-center/settings')
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toMatchObject({ expectedRevision: 3 })
  })
})
