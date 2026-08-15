export declare const NOTIFICATION_KINDS: readonly ["completed", "error", "aborted", "blocked", "max-tokens", "interrupted", "approval"];
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];
export declare const WEBHOOK_CHANNELS: readonly ["feishu", "wecom", "dingtalk", "slack", "discord", "custom"];
export type WebhookChannelName = (typeof WEBHOOK_CHANNELS)[number];
export type NotificationLocale = 'zh' | 'en';
export interface NotificationEnvelope {
    readonly id: string;
    readonly kind: NotificationKind;
    readonly sessionId: string;
    readonly turn?: number;
    readonly title: string;
    readonly summary: string;
    readonly tools: readonly string[];
    readonly reason?: string;
    readonly durationMs?: number;
    readonly time: number;
}
export interface NotificationRuleInput {
    mode?: 'include' | 'exclude';
    pattern: string;
    regex?: boolean;
    caseSensitive?: boolean;
}
export interface WebhookChannelInput {
    url: string;
    events?: NotificationKind[];
    includeSummary?: boolean;
}
export type WebhookInput = string | WebhookChannelInput;
export interface PluginConfig {
    locale?: NotificationLocale;
    notifySubagents?: boolean;
    events?: {
        completed?: boolean;
        error?: boolean;
        aborted?: boolean;
        blocked?: boolean;
        maxTokens?: boolean;
        interrupted?: boolean;
        approval?: boolean;
    };
    local?: {
        enabled?: boolean;
        sound?: boolean;
    };
    rules?: NotificationRuleInput[];
    webhooks?: Partial<Record<WebhookChannelName, WebhookInput>>;
    delivery?: {
        timeoutMs?: number;
        retries?: number;
        retryBaseMs?: number;
        maxBodyChars?: number;
    };
}
export interface ResolvedNotificationRule {
    readonly mode: 'include' | 'exclude';
    readonly pattern: string;
    readonly regex: boolean;
    readonly caseSensitive: boolean;
    readonly expression?: RegExp;
}
export interface ResolvedWebhookChannel {
    readonly name: WebhookChannelName;
    readonly url: string;
    readonly events: ReadonlySet<NotificationKind>;
    readonly includeSummary: boolean;
}
export interface ResolvedPluginConfig {
    readonly locale: NotificationLocale;
    readonly notifySubagents: boolean;
    readonly events: Readonly<Record<NotificationKind, boolean>>;
    readonly local: {
        readonly enabled: boolean;
        readonly sound: boolean;
    };
    readonly rules: readonly ResolvedNotificationRule[];
    readonly webhooks: readonly ResolvedWebhookChannel[];
    readonly delivery: {
        readonly timeoutMs: number;
        readonly retries: number;
        readonly retryBaseMs: number;
        readonly maxBodyChars: number;
    };
}
export interface NotifyLogger {
    info(message: string): void;
    warn(message: string): void;
}
//# sourceMappingURL=types.d.ts.map