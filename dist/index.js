import { createDesktopBridgeFromEnvironment } from './bridge.js';
import { Config } from './config.js';
import { CompletionGate, DedupeCache, TurnAccumulator } from './events.js';
import { NotificationHub } from './hub.js';
import { shouldNotify } from './policy.js';
import { registerSettingsApi } from './settings-api.js';
import { NotificationSettingsStore } from './settings-store.js';
export const name = 'dsh-notify-center';
export const inject = ['sessions', 'agents'];
export { Config };
export * from './types.js';
function isRoot(ctx, agent, notifySubagents) {
    return notifySubagents || ctx.agents.roots().includes(agent);
}
export function apply(ctx, input = {}) {
    const settings = new NotificationSettingsStore(input, { logger: console });
    let config = settings.getResolved();
    const accumulator = new TurnAccumulator(config.delivery.maxBodyChars);
    const dedupe = new DedupeCache();
    let desktopBridge = null;
    try {
        desktopBridge = createDesktopBridgeFromEnvironment();
    }
    catch (error) {
        console.warn(`[dsh-notify-center] desktop bridge disabled: ${error instanceof Error ? error.message : String(error)}`);
    }
    const hub = new NotificationHub(config, console, desktopBridge);
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
    ctx.effect(() => settings.subscribe((next) => {
        config = next;
        accumulator.setMaxBodyChars(config.delivery.maxBodyChars);
        hub.updateConfig(config);
        console.info(`[dsh-notify-center] settings applied (local=${config.local.enabled}, webhooks=${config.webhooks.map(item => item.name).join(',') || 'none'})`);
    }), 'dsh-notify-center: live settings');
    // This child fiber waits for the optional Web composition without making
    // the notification host depend on it. In a CLI-only composition it simply
    // remains dormant while native and webhook delivery continue normally.
    ctx.inject(['webServer'], (webCtx) => {
        const webServer = webCtx.get('webServer');
        webCtx.effect(() => registerSettingsApi(webServer, settings, console), 'dsh-notify-center: settings API');
        console.info('[dsh-notify-center] visual settings API ready');
    });
    console.info(`[dsh-notify-center] ready (local=${config.local.enabled}, desktopBridge=${desktopBridge ? 'available' : 'absent'}, webhooks=${config.webhooks.map(item => item.name).join(',') || 'none'})`);
}
//# sourceMappingURL=index.js.map