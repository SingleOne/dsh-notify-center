import {
  NOTIFICATION_KINDS,
  WEBHOOK_CHANNELS,
  type NotificationKind,
  type NotificationLocale,
  type NotificationRuleInput,
  type WebhookChannelName,
} from '../types.js'

export const SETTINGS_API_PATH = '/api/dsh-notify-center/settings'

const DEFAULT_EVENTS: Record<NotificationKind, boolean> = {
  completed: true,
  error: true,
  aborted: false,
  blocked: true,
  'max-tokens': true,
  interrupted: true,
  approval: true,
}

export interface SettingsPathSetOp {
  op: 'set'
  path: string[]
  value: unknown
}

export interface SettingsPathUnsetOp {
  op: 'unset'
  path: string[]
}

export type SettingsPathOp = SettingsPathSetOp | SettingsPathUnsetOp

export interface SettingsNamespaceView {
  revision: number
  writable: boolean
  value: unknown
  secrets: Array<{ path: string[]; set: boolean }>
}

export interface WebhookSettingsValue {
  events: NotificationKind[]
  includeSummary: boolean
}

export interface NotificationSettingsValue {
  locale: NotificationLocale
  notifySubagents: boolean
  events: Record<NotificationKind, boolean>
  local: {
    enabled: boolean
    sound: boolean
  }
  rules: NotificationRuleInput[]
  webhooks: Record<WebhookChannelName, WebhookSettingsValue>
  delivery: {
    timeoutMs: number
    retries: number
    retryBaseMs: number
    maxBodyChars: number
  }
}

export interface NotificationSettingsState {
  status: 'idle' | 'loading' | 'ready' | 'saving' | 'error' | 'unavailable'
  error: string | null
  writable: boolean
  view: SettingsNamespaceView | null
}

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

function objectOf(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function booleanOf(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function numberOf(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function webhookValue(value: unknown): WebhookSettingsValue {
  const object = objectOf(value)
  const configuredEvents = Array.isArray(object.events)
    ? object.events.filter((kind): kind is NotificationKind => (
      typeof kind === 'string' && NOTIFICATION_KINDS.includes(kind as NotificationKind)
    ))
    : []
  return {
    events: configuredEvents.length ? configuredEvents : [...NOTIFICATION_KINDS],
    includeSummary: booleanOf(object.includeSummary, false),
  }
}

export function normalizeSettingsValue(value: unknown): NotificationSettingsValue {
  const root = objectOf(value)
  const events = objectOf(root.events)
  const local = objectOf(root.local)
  const delivery = objectOf(root.delivery)
  const webhooks = objectOf(root.webhooks)
  const rules = Array.isArray(root.rules)
    ? root.rules.flatMap((item): NotificationRuleInput[] => {
      const rule = objectOf(item)
      if (typeof rule.pattern !== 'string') return []
      return [{
        mode: rule.mode === 'exclude' ? 'exclude' : 'include',
        pattern: rule.pattern,
        regex: booleanOf(rule.regex, false),
        caseSensitive: booleanOf(rule.caseSensitive, false),
      }]
    })
    : []
  return {
    locale: root.locale === 'en' ? 'en' : 'zh',
    notifySubagents: booleanOf(root.notifySubagents, false),
    events: {
      completed: booleanOf(events.completed, DEFAULT_EVENTS.completed),
      error: booleanOf(events.error, DEFAULT_EVENTS.error),
      aborted: booleanOf(events.aborted, DEFAULT_EVENTS.aborted),
      blocked: booleanOf(events.blocked, DEFAULT_EVENTS.blocked),
      'max-tokens': booleanOf(events.maxTokens, DEFAULT_EVENTS['max-tokens']),
      interrupted: booleanOf(events.interrupted, DEFAULT_EVENTS.interrupted),
      approval: booleanOf(events.approval, DEFAULT_EVENTS.approval),
    },
    local: {
      enabled: booleanOf(local.enabled, true),
      sound: booleanOf(local.sound, true),
    },
    rules,
    webhooks: Object.fromEntries(
      WEBHOOK_CHANNELS.map(name => [name, webhookValue(webhooks[name])]),
    ) as Record<WebhookChannelName, WebhookSettingsValue>,
    delivery: {
      timeoutMs: numberOf(delivery.timeoutMs, 5_000),
      retries: numberOf(delivery.retries, 2),
      retryBaseMs: numberOf(delivery.retryBaseMs, 500),
      maxBodyChars: numberOf(delivery.maxBodyChars, 400),
    },
  }
}

async function responseError(response: Response): Promise<Error> {
  try {
    const body = await response.json() as { error?: { message?: unknown } }
    if (typeof body.error?.message === 'string') return new Error(body.error.message)
  } catch {
    // Fall through to the status-only error below.
  }
  return new Error(`settings request failed (${response.status})`)
}

function parseView(value: unknown): SettingsNamespaceView {
  const object = objectOf(value)
  if (!Number.isSafeInteger(object.revision) || Number(object.revision) < 0) {
    throw new Error('settings response has an invalid revision')
  }
  if (!Array.isArray(object.secrets)) throw new Error('settings response has invalid secret metadata')
  const secrets = object.secrets.flatMap((item): SettingsNamespaceView['secrets'] => {
    const secret = objectOf(item)
    if (!Array.isArray(secret.path) || secret.path.some(part => typeof part !== 'string')) return []
    return [{ path: secret.path as string[], set: secret.set === true }]
  })
  return {
    revision: Number(object.revision),
    writable: object.writable === true,
    value: object.value,
    secrets,
  }
}

export class NotificationSettingsController {
  private state: NotificationSettingsState = {
    status: 'idle',
    error: null,
    writable: false,
    view: null,
  }
  private readonly listeners = new Set<() => void>()
  private generation = 0

  constructor(private readonly fetcher: Fetcher = globalThis.fetch.bind(globalThis)) {}

  getSnapshot = (): NotificationSettingsState => this.state

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async load(): Promise<void> {
    const generation = ++this.generation
    this.publish({ ...this.state, status: 'loading', error: null })
    try {
      const response = await this.fetcher(SETTINGS_API_PATH, {
        method: 'GET',
        headers: { accept: 'application/json' },
        credentials: 'same-origin',
        cache: 'no-store',
      })
      if (generation !== this.generation) return
      if (response.status === 404) {
        this.publish({ status: 'unavailable', error: null, writable: false, view: null })
        return
      }
      if (!response.ok) throw await responseError(response)
      const view = parseView(await response.json())
      this.publish({ status: 'ready', error: null, writable: view.writable, view })
    } catch (error) {
      if (generation !== this.generation) return
      this.publish({
        ...this.state,
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  async mutate(ops: SettingsPathOp[]): Promise<boolean> {
    const view = this.state.view
    if (!this.state.writable || !view || ops.length === 0) return false
    const generation = ++this.generation
    const previous = this.state
    this.publish({ ...this.state, status: 'saving', error: null })
    try {
      const response = await this.fetcher(SETTINGS_API_PATH, {
        method: 'PATCH',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ expectedRevision: view.revision, ops }),
      })
      if (generation !== this.generation) return false
      if (!response.ok) throw await responseError(response)
      const next = parseView(await response.json())
      this.publish({ status: 'ready', error: null, writable: next.writable, view: next })
      return true
    } catch (error) {
      if (generation !== this.generation) return false
      this.publish({
        ...previous,
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      })
      return false
    }
  }

  webhookConfigured(name: WebhookChannelName, view = this.state.view): boolean {
    if (!view) return false
    return view.secrets.some(secret => secret.set && secret.path.join('.') === `webhooks.${name}.url`)
  }

  private publish(state: NotificationSettingsState): void {
    this.state = state
    for (const listener of this.listeners) listener()
  }
}
