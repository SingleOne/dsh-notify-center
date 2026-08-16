import Schema from '@deepseek-ai/schemastery'
import {
  NOTIFICATION_KINDS,
  WEBHOOK_CHANNELS,
  type NotificationKind,
  type PluginConfig,
  type ResolvedNotificationRule,
  type ResolvedPluginConfig,
  type ResolvedWebhookChannel,
  type WebhookChannelInput,
  type WebhookChannelName,
  type WebhookInput,
} from './types.js'

function createWebhookObjectSchema(requireUrl = true) {
  const url = Schema.string().role('secret')
  return Schema.object({
    url: requireUrl ? url.required() : url,
    // Runtime validation below retains a channel-specific error for unknown
    // values while the settings page presents the supported choices.
    events: Schema.array(Schema.string()),
    includeSummary: Schema.boolean(),
  })
}

// Keep the legacy string form for existing profile configurations. New writes
// from the settings page always use the object form so URL secrets can be
// redacted without hiding the channel's event policy.
const webhookChannelSchema = Schema.union([
  Schema.string().role('secret'),
  createWebhookObjectSchema(),
]) as unknown as Schema<WebhookInput>

// Schemastery schemas are contravariant in their input type, so the factory
// accepts any concrete object schema and the exported surfaces restore the
// public PluginConfig type below.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createConfigSchema(webhooks: Schema<any>) {
  return Schema.object({
  locale: Schema.union([Schema.const('zh'), Schema.const('en')]).default('zh'),
  notifySubagents: Schema.boolean().default(false),
  events: Schema.object({
    completed: Schema.boolean(),
    error: Schema.boolean(),
    aborted: Schema.boolean(),
    blocked: Schema.boolean(),
    maxTokens: Schema.boolean(),
    interrupted: Schema.boolean(),
    approval: Schema.boolean(),
  }),
  local: Schema.object({
    enabled: Schema.boolean(),
    sound: Schema.boolean(),
  }),
  rules: Schema.array(Schema.object({
    mode: Schema.union([Schema.const('include'), Schema.const('exclude')]),
    pattern: Schema.string().required(),
    regex: Schema.boolean(),
    caseSensitive: Schema.boolean(),
  })),
  webhooks,
  delivery: Schema.object({
    timeoutMs: Schema.natural().min(100).max(60_000),
    retries: Schema.natural().max(5),
    retryBaseMs: Schema.natural().min(50).max(30_000),
    maxBodyChars: Schema.natural().min(40).max(4_000),
  }),
  })
}

export const Config = createConfigSchema(Schema.object({
  feishu: webhookChannelSchema,
  wecom: webhookChannelSchema,
  dingtalk: webhookChannelSchema,
  slack: webhookChannelSchema,
  discord: webhookChannelSchema,
  custom: webhookChannelSchema,
})) as unknown as Schema<PluginConfig>

// Settings use a non-union object shape. Schemastery secret redaction cannot
// safely choose a branch inside a string/object union, while the composition
// base has already normalized all legacy strings before registration.
export const DEFAULT_EVENTS: Record<NotificationKind, boolean> = {
  completed: true,
  error: true,
  aborted: false,
  blocked: true,
  'max-tokens': true,
  interrupted: true,
  approval: true,
}

function stripGeneratedEmptyWebhookChannels(input: PluginConfig): PluginConfig {
  if (!input.webhooks) return input
  let changed = false
  const webhooks: Partial<Record<WebhookChannelName, WebhookInput>> = {}
  for (const name of WEBHOOK_CHANNELS) {
    const value = input.webhooks[name]
    if (
      value && typeof value === 'object' && !Array.isArray(value)
      && (typeof value.url !== 'string' || !value.url.trim())
      && (value.events === undefined || value.events.length === 0)
      && value.includeSummary !== true
    ) {
      changed = true
      continue
    }
    if (value !== undefined) webhooks[name] = value
  }
  return changed ? { ...input, webhooks } : input
}

function resolveRule(rule: NonNullable<PluginConfig['rules']>[number], index: number): ResolvedNotificationRule {
  const pattern = rule.pattern.trim()
  if (!pattern) throw new Error(`rules[${index}].pattern must not be empty`)
  const regex = rule.regex ?? false
  const caseSensitive = rule.caseSensitive ?? false
  let expression: RegExp | undefined
  if (regex) {
    try {
      expression = new RegExp(pattern, caseSensitive ? '' : 'i')
    } catch (error) {
      throw new Error(`rules[${index}] has an invalid regular expression: ${String(error)}`)
    }
  }
  return {
    mode: rule.mode ?? 'include',
    pattern,
    regex,
    caseSensitive,
    expression,
  }
}

function validateWebhookUrl(channel: WebhookChannelName, value: string): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error(`webhooks.${channel} must be an absolute HTTP(S) URL`)
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`webhooks.${channel} must use HTTP or HTTPS`)
  }
  return url.toString()
}

function resolveWebhook(name: WebhookChannelName, input: WebhookInput): ResolvedWebhookChannel {
  const object: WebhookChannelInput = typeof input === 'string'
    ? { url: input }
    : input
  if (!object || typeof object !== 'object' || Array.isArray(object)) {
    throw new Error(`webhooks.${name} must be a URL or channel object`)
  }
  if (typeof object.url !== 'string' || !object.url.trim()) {
    throw new Error(`webhooks.${name}.url must not be empty`)
  }
  if (object.events !== undefined && (
    !Array.isArray(object.events)
    || object.events.some(kind => !NOTIFICATION_KINDS.includes(kind))
  )) {
    throw new Error(`webhooks.${name}.events contains an unknown notification kind`)
  }
  if (object.includeSummary !== undefined && typeof object.includeSummary !== 'boolean') {
    throw new Error(`webhooks.${name}.includeSummary must be a boolean`)
  }
  const configuredEvents = object.events?.length ? object.events : NOTIFICATION_KINDS
  return {
    name,
    url: validateWebhookUrl(name, object.url),
    events: new Set(configuredEvents),
    includeSummary: object.includeSummary ?? false,
  }
}

export function resolveConfig(input: PluginConfig = {}): ResolvedPluginConfig {
  const parsed = Config(stripGeneratedEmptyWebhookChannels(input) as never) as unknown as PluginConfig
  const webhooks: ResolvedWebhookChannel[] = []
  for (const name of WEBHOOK_CHANNELS) {
    const value = parsed.webhooks?.[name]
    if (value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) {
      continue
    }
    if (value !== undefined && value !== null) webhooks.push(resolveWebhook(name, value))
  }

  return {
    locale: parsed.locale ?? 'zh',
    notifySubagents: parsed.notifySubagents ?? false,
    events: {
      completed: parsed.events?.completed ?? DEFAULT_EVENTS.completed,
      error: parsed.events?.error ?? DEFAULT_EVENTS.error,
      aborted: parsed.events?.aborted ?? DEFAULT_EVENTS.aborted,
      blocked: parsed.events?.blocked ?? DEFAULT_EVENTS.blocked,
      'max-tokens': parsed.events?.maxTokens ?? DEFAULT_EVENTS['max-tokens'],
      interrupted: parsed.events?.interrupted ?? DEFAULT_EVENTS.interrupted,
      approval: parsed.events?.approval ?? DEFAULT_EVENTS.approval,
    },
    local: {
      enabled: parsed.local?.enabled ?? true,
      sound: parsed.local?.sound ?? true,
    },
    rules: (parsed.rules ?? []).map(resolveRule),
    webhooks,
    delivery: {
      timeoutMs: parsed.delivery?.timeoutMs ?? 5_000,
      retries: parsed.delivery?.retries ?? 2,
      retryBaseMs: parsed.delivery?.retryBaseMs ?? 500,
      maxBodyChars: parsed.delivery?.maxBodyChars ?? 400,
    },
  }
}

/**
 * Normalize legacy string webhook entries before applying the persisted user
 * layer. This keeps every secret URL at webhooks.<channel>.url so non-secret
 * path operations never need to read or replace it.
 */
export function normalizeSettingsBase(input: PluginConfig): PluginConfig {
  if (!input.webhooks) return input
  const webhooks: Partial<Record<WebhookChannelName, WebhookInput>> = {}
  for (const name of WEBHOOK_CHANNELS) {
    const value = input.webhooks[name]
    if (typeof value === 'string') webhooks[name] = { url: value }
    else if (value !== undefined) webhooks[name] = value
  }
  return { ...input, webhooks }
}
