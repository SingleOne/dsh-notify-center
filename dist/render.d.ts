import type { NotificationEnvelope, NotificationLocale } from './types.js';
export declare function formatDuration(durationMs: number, locale: NotificationLocale): string;
export declare function renderLocal(envelope: NotificationEnvelope, locale: NotificationLocale): {
    title: string;
    body: string;
};
export declare function renderWebhookText(envelope: NotificationEnvelope, includeSummary: boolean, locale: NotificationLocale): string;
//# sourceMappingURL=render.d.ts.map