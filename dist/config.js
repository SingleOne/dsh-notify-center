import Schema from '@deepseek-ai/schemastery';
import { NOTIFICATION_KINDS, WEBHOOK_CHANNELS, } from './types.js';
// Schemastery's structural inference treats a string/object union as the
// intersection with String's prototype. Runtime shape validation stays in
// resolveWebhook(), which also produces clearer channel-specific errors.
const webhookChannelSchema = Schema.any();
export const Config = Schema.object({
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
    webhooks: Schema.object({
        feishu: webhookChannelSchema,
        wecom: webhookChannelSchema,
        dingtalk: webhookChannelSchema,
        slack: webhookChannelSchema,
        discord: webhookChannelSchema,
        custom: webhookChannelSchema,
    }),
    delivery: Schema.object({
        timeoutMs: Schema.natural().min(100).max(60_000),
        retries: Schema.natural().max(5),
        retryBaseMs: Schema.natural().min(50).max(30_000),
        maxBodyChars: Schema.natural().min(40).max(4_000),
    }),
});
const DEFAULT_EVENTS = {
    completed: true,
    error: true,
    aborted: false,
    blocked: true,
    'max-tokens': true,
    interrupted: true,
    approval: true,
};
function resolveRule(rule, index) {
    const pattern = rule.pattern.trim();
    if (!pattern)
        throw new Error(`rules[${index}].pattern must not be empty`);
    const regex = rule.regex ?? false;
    const caseSensitive = rule.caseSensitive ?? false;
    let expression;
    if (regex) {
        try {
            expression = new RegExp(pattern, caseSensitive ? '' : 'i');
        }
        catch (error) {
            throw new Error(`rules[${index}] has an invalid regular expression: ${String(error)}`);
        }
    }
    return {
        mode: rule.mode ?? 'include',
        pattern,
        regex,
        caseSensitive,
        expression,
    };
}
function validateWebhookUrl(channel, value) {
    let url;
    try {
        url = new URL(value);
    }
    catch {
        throw new Error(`webhooks.${channel} must be an absolute HTTP(S) URL`);
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
        throw new Error(`webhooks.${channel} must use HTTP or HTTPS`);
    }
    return url.toString();
}
function resolveWebhook(name, input) {
    const object = typeof input === 'string'
        ? { url: input }
        : input;
    if (!object || typeof object !== 'object' || Array.isArray(object)) {
        throw new Error(`webhooks.${name} must be a URL or channel object`);
    }
    if (typeof object.url !== 'string' || !object.url.trim()) {
        throw new Error(`webhooks.${name}.url must not be empty`);
    }
    if (object.events !== undefined && (!Array.isArray(object.events)
        || object.events.some(kind => !NOTIFICATION_KINDS.includes(kind)))) {
        throw new Error(`webhooks.${name}.events contains an unknown notification kind`);
    }
    if (object.includeSummary !== undefined && typeof object.includeSummary !== 'boolean') {
        throw new Error(`webhooks.${name}.includeSummary must be a boolean`);
    }
    const configuredEvents = object.events?.length ? object.events : NOTIFICATION_KINDS;
    return {
        name,
        url: validateWebhookUrl(name, object.url),
        events: new Set(configuredEvents),
        includeSummary: object.includeSummary ?? false,
    };
}
export function resolveConfig(input = {}) {
    const parsed = Config(input);
    const webhooks = [];
    for (const name of WEBHOOK_CHANNELS) {
        const value = parsed.webhooks?.[name];
        if (value !== undefined && value !== null)
            webhooks.push(resolveWebhook(name, value));
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
    };
}
//# sourceMappingURL=config.js.map