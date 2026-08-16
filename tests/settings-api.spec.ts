import { createServer, type Server } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createSettingsApiHandler, SETTINGS_API_PATH } from '../src/settings-api.js'
import { NotificationSettingsStore } from '../src/settings-store.js'
import type { PluginConfig } from '../src/types.js'

const servers: Server[] = []
const temporaryDirectories: string[] = []

async function start(profile: PluginConfig = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-notify-center-api-'))
  temporaryDirectories.push(directory)
  const store = new NotificationSettingsStore(profile, { path: join(directory, 'settings.json') })
  const handler = createSettingsApiHandler(store)
  const server = createServer((req, res) => { void handler(req, res) })
  servers.push(server)
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('test server did not bind')
  const origin = `http://127.0.0.1:${address.port}`
  return { store, url: `${origin}${SETTINGS_API_PATH}`, origin }
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))))
  await Promise.all(temporaryDirectories.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

describe('notification settings HTTP API', () => {
  it('returns only redacted data and applies same-origin path operations', async () => {
    const { store, url, origin } = await start({
      webhooks: { slack: 'https://hooks.slack.com/services/browser-secret' },
    })
    const initial = await fetch(url)
    expect(initial.status).toBe(200)
    const initialText = await initial.text()
    expect(initialText).not.toContain('browser-secret')
    const view = JSON.parse(initialText) as { revision: number }
    const saved = await fetch(url, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', origin, 'sec-fetch-site': 'same-origin' },
      body: JSON.stringify({
        expectedRevision: view.revision,
        ops: [{ op: 'set', path: ['local', 'enabled'], value: false }],
      }),
    })
    expect(saved.status).toBe(200)
    expect(store.getResolved().local.enabled).toBe(false)
    expect(store.getResolved().webhooks[0].url).toContain('browser-secret')
  })

  it('rejects cross-origin, oversized, stale, and invalid mutation requests', async () => {
    const { url, origin } = await start()
    const crossOrigin = await fetch(url, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', origin: 'https://attacker.example' },
      body: JSON.stringify({ expectedRevision: 0, ops: [{ op: 'set', path: ['locale'], value: 'en' }] }),
    })
    expect(crossOrigin.status).toBe(403)
    const invalid = await fetch(url, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', origin },
      body: JSON.stringify({ expectedRevision: 0, ops: [{ op: 'set', path: ['unknown'], value: true }] }),
    })
    expect(invalid.status).toBe(400)
    const saved = await fetch(url, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', origin },
      body: JSON.stringify({ expectedRevision: 0, ops: [{ op: 'set', path: ['locale'], value: 'en' }] }),
    })
    expect(saved.status).toBe(200)
    const stale = await fetch(url, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', origin },
      body: JSON.stringify({ expectedRevision: 0, ops: [{ op: 'set', path: ['locale'], value: 'zh' }] }),
    })
    expect(stale.status).toBe(409)
    const oversized = await fetch(url, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', origin },
      body: JSON.stringify({ expectedRevision: 1, ops: [], padding: 'x'.repeat(70_000) }),
    })
    expect(oversized.status).toBe(413)
  })
})
