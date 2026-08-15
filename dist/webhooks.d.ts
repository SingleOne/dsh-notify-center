import type { NotificationEnvelope, NotificationLocale, ResolvedWebhookChannel } from './types.js';
export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Pick<Response, 'ok' | 'status'>>;
export interface WebhookDeliveryOptions {
    readonly timeoutMs: number;
    readonly retries: number;
    readonly retryBaseMs: number;
    readonly locale: NotificationLocale;
    readonly signal: AbortSignal;
    readonly fetch?: FetchLike;
    readonly sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
}
export declare function deliverWebhook(channel: ResolvedWebhookChannel, envelope: NotificationEnvelope, options: WebhookDeliveryOptions): Promise<number>;
//# sourceMappingURL=webhooks.d.ts.map