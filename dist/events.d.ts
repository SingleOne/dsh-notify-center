import type { Session, SessionEvent } from '@deepseek-ai/dsh-session';
import type { NotificationEnvelope } from './types.js';
export declare function textOf(content: readonly unknown[]): string;
export declare function appendBounded(current: string, value: string, maxChars: number): string;
export declare function sessionTitle(session: Pick<Session, 'id' | 'events'>): string;
export declare class TurnAccumulator {
    private readonly maxBodyChars;
    private readonly active;
    constructor(maxBodyChars: number);
    observe(session: Session, event: SessionEvent): NotificationEnvelope | null;
    forget(sessionId: string): void;
}
export declare class DedupeCache {
    private readonly maxEntries;
    private readonly ttlMs;
    private readonly seen;
    constructor(maxEntries?: number, ttlMs?: number);
    accept(id: string, now?: number): boolean;
    private prune;
}
export declare class CompletionGate {
    private readonly maxPerSession;
    private readonly pending;
    constructor(maxPerSession?: number);
    enqueue(envelope: NotificationEnvelope): void;
    flush(sessionId: string): NotificationEnvelope[];
    forget(sessionId: string): void;
}
//# sourceMappingURL=events.d.ts.map