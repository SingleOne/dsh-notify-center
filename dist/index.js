import { Config, resolveConfig } from './config.js';
import { CompletionGate, DedupeCache, TurnAccumulator } from './events.js';
import { NotificationHub } from './hub.js';
import { shouldNotify } from './policy.js';
export const name = 'dsh-notify-center';
export const inject = ['sessions', 'agents'];
export { Config };
export * from './types.js';
function isRoot(ctx, agent, notifySubagents) {
    return notifySubagents || ctx.agents.roots().includes(agent);
}
export function apply(ctx, input = {}) {
    const config = resolveConfig(input);
    const accumulator = new TurnAccumulator(config.delivery.maxBodyChars);
    const dedupe = new DedupeCache();
    const hub = new NotificationHub(config, console);
    const completionGate = new CompletionGate();
    const emit = (envelope) => {
        if (!shouldNotify(config, envelope))
            return;
        if (!dedupe.accept(envelope.id))
            return;
        hub.dispatch(envelope);
    };
    ctx.on('session/event', (session, event) => {
        const envelope = accumulator.observe(session, event);
        if (!envelope)
            return;
        const agent = ctx.agents.get(session.id);
        if (!agent || !isRoot(ctx, agent, config.notifySubagents))
            return;
        if (envelope.kind === 'approval' || agent.status === 'idle') {
            emit(envelope);
            return;
        }
        completionGate.enqueue(envelope);
    });
    ctx.on('agent/status', ({ agent, status }) => {
        if (status !== 'idle')
            return;
        const sessionId = String(agent.id);
        const queue = completionGate.flush(sessionId);
        if (!isRoot(ctx, agent, config.notifySubagents))
            return;
        for (const envelope of queue)
            emit(envelope);
    });
    ctx.on('agent/disposed', ({ agent }) => {
        const sessionId = String(agent.id);
        completionGate.forget(sessionId);
        accumulator.forget(sessionId);
    });
    ctx.effect(() => () => hub.dispose(), 'dsh-notify-center: delivery lifetime');
    console.info(`[dsh-notify-center] ready (local=${config.local.enabled}, webhooks=${config.webhooks.map(item => item.name).join(',') || 'none'})`);
}
//# sourceMappingURL=index.js.map