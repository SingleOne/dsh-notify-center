function stringId(value) {
    return String(value);
}
export function textOf(content) {
    let output = '';
    for (const block of content) {
        if (!block || typeof block !== 'object' || block.type !== 'text')
            continue;
        const text = block.text;
        if (typeof text === 'string')
            output += text;
    }
    return output;
}
export function appendBounded(current, value, maxChars) {
    const normalized = value.trim();
    if (!normalized || current.length >= maxChars)
        return current;
    const combined = current ? `${current}\n${normalized}` : normalized;
    if (combined.length <= maxChars)
        return combined;
    return `${combined.slice(0, Math.max(0, maxChars - 1))}…`;
}
export function sessionTitle(session) {
    for (let index = session.events.length - 1; index >= 0; index -= 1) {
        const event = session.events[index];
        if (event.type !== 'session/title')
            continue;
        const title = event.data.title.trim();
        if (title)
            return title;
    }
    for (const event of session.events) {
        if (event.type !== 'user/message')
            continue;
        const title = textOf(event.data.content).replace(/\s+/g, ' ').trim();
        if (title)
            return title.length > 80 ? `${title.slice(0, 79)}…` : title;
    }
    return stringId(session.id);
}
function kindFromReason(reason) {
    switch (reason.kind) {
        case 'completed':
        case 'error':
        case 'aborted':
        case 'blocked':
        case 'max-tokens':
        case 'interrupted':
            return reason.kind;
        default:
            return 'error';
    }
}
function reasonDetail(reason) {
    if (reason.kind === 'error') {
        const error = reason.error;
        if (error && typeof error === 'object' && typeof error.message === 'string') {
            return error.message;
        }
    }
    if (reason.kind === 'aborted') {
        const cause = reason.reason;
        if (cause && typeof cause === 'object' && typeof cause.kind === 'string') {
            return cause.kind;
        }
    }
    return reason.kind === 'completed' ? undefined : reason.kind;
}
function foldTurn(events, turn, maxBodyChars) {
    let startedAt = 0;
    let summary = '';
    const tools = [];
    for (const event of events) {
        if (event.type === 'turn/start' && event.data.turn === turn)
            startedAt = event.time;
        if (event.type === 'assistant/message' && event.data.turn === turn) {
            summary = appendBounded(summary, textOf(event.data.message.content), maxBodyChars);
        }
        if (event.type === 'tool/call' && event.data.turn === turn && !tools.includes(event.data.name)) {
            tools.push(event.data.name);
        }
    }
    return { turn, startedAt, summary, tools };
}
export class TurnAccumulator {
    maxBodyChars;
    active = new Map();
    constructor(maxBodyChars) {
        this.maxBodyChars = maxBodyChars;
    }
    observe(session, event) {
        const sessionId = stringId(session.id);
        switch (event.type) {
            case 'turn/start':
                this.active.set(sessionId, {
                    turn: event.data.turn,
                    startedAt: event.time,
                    summary: '',
                    tools: [],
                });
                return null;
            case 'assistant/message': {
                const active = this.active.get(sessionId);
                if (!active || active.turn !== event.data.turn)
                    return null;
                active.summary = appendBounded(active.summary, textOf(event.data.message.content), this.maxBodyChars);
                return null;
            }
            case 'tool/call': {
                const active = this.active.get(sessionId);
                if (!active || active.turn !== event.data.turn || active.tools.includes(event.data.name))
                    return null;
                active.tools.push(event.data.name);
                return null;
            }
            case 'approval/asked': {
                const reason = event.data.reason?.trim();
                return {
                    id: `${sessionId}:approval:${event.data.id}`,
                    kind: 'approval',
                    sessionId,
                    title: sessionTitle(session),
                    summary: `工具 ${event.data.toolName} 等待审批${reason ? `：${reason}` : ''}`,
                    tools: [event.data.toolName],
                    reason,
                    time: event.time,
                };
            }
            case 'turn/end': {
                const current = this.active.get(sessionId);
                const turn = current?.turn === event.data.turn
                    ? current
                    : foldTurn(session.events, event.data.turn, this.maxBodyChars);
                this.active.delete(sessionId);
                const reason = event.data.reason;
                return {
                    id: `${sessionId}:turn:${event.data.turn}`,
                    kind: kindFromReason(reason),
                    sessionId,
                    turn: event.data.turn,
                    title: sessionTitle(session),
                    summary: turn.summary.trim(),
                    tools: [...turn.tools],
                    reason: reasonDetail(reason),
                    durationMs: turn.startedAt > 0 ? Math.max(0, event.time - turn.startedAt) : undefined,
                    time: event.time,
                };
            }
            default:
                return null;
        }
    }
    forget(sessionId) {
        this.active.delete(sessionId);
    }
}
export class DedupeCache {
    maxEntries;
    ttlMs;
    seen = new Map();
    constructor(maxEntries = 2_000, ttlMs = 24 * 60 * 60 * 1_000) {
        this.maxEntries = maxEntries;
        this.ttlMs = ttlMs;
    }
    accept(id, now = Date.now()) {
        const previous = this.seen.get(id);
        if (previous !== undefined && now - previous <= this.ttlMs)
            return false;
        this.seen.set(id, now);
        this.prune(now);
        return true;
    }
    prune(now) {
        for (const [id, time] of this.seen) {
            if (now - time > this.ttlMs)
                this.seen.delete(id);
        }
        while (this.seen.size > this.maxEntries) {
            const oldest = this.seen.keys().next().value;
            if (oldest === undefined)
                break;
            this.seen.delete(oldest);
        }
    }
}
export class CompletionGate {
    maxPerSession;
    pending = new Map();
    constructor(maxPerSession = 20) {
        this.maxPerSession = maxPerSession;
    }
    enqueue(envelope) {
        const queue = this.pending.get(envelope.sessionId) ?? [];
        queue.push(envelope);
        if (queue.length > this.maxPerSession)
            queue.shift();
        this.pending.set(envelope.sessionId, queue);
    }
    flush(sessionId) {
        const queue = this.pending.get(sessionId) ?? [];
        this.pending.delete(sessionId);
        return queue;
    }
    forget(sessionId) {
        this.pending.delete(sessionId);
    }
}
//# sourceMappingURL=events.js.map