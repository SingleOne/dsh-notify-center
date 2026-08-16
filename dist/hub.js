import { sendLocalNotification } from './local.js';
import { deliverWebhook } from './webhooks.js';
export class NotificationHub {
    config;
    logger;
    desktopBridge;
    maxInFlight;
    lifetime = new AbortController();
    inFlight = new Set();
    constructor(config, logger, desktopBridge = null, maxInFlight = 100) {
        this.config = config;
        this.logger = logger;
        this.desktopBridge = desktopBridge;
        this.maxInFlight = maxInFlight;
    }
    updateConfig(config) {
        this.config = config;
    }
    dispatch(envelope) {
        if (this.inFlight.size >= this.maxInFlight) {
            this.logger.warn(`[dsh-notify-center] delivery queue full; dropped ${envelope.id}`);
            return;
        }
        if (this.config.local.enabled) {
            this.launch(`local ${envelope.id}`, this.deliverLocal(envelope));
        }
        for (const channel of this.config.webhooks) {
            if (!channel.events.has(envelope.kind))
                continue;
            this.launch(`${channel.name} ${envelope.id}`, deliverWebhook(channel, envelope, {
                ...this.config.delivery,
                locale: this.config.locale,
                signal: this.lifetime.signal,
            }).then(attempts => {
                this.logger.info(`[dsh-notify-center] ${channel.name} delivered ${envelope.id} in ${attempts} attempt(s)`);
            }), false);
        }
    }
    dispose() {
        this.lifetime.abort(new Error('dsh-notify-center disposed'));
    }
    async deliverLocal(envelope) {
        if (this.desktopBridge) {
            try {
                await this.desktopBridge.deliver(envelope, this.config, this.lifetime.signal);
                return;
            }
            catch (error) {
                if (this.lifetime.signal.aborted)
                    throw error;
                this.logger.warn(`[dsh-notify-center] desktop bridge unavailable; using native fallback: ${error instanceof Error ? error.message : 'unknown error'}`);
            }
        }
        await sendLocalNotification(envelope, this.config, this.lifetime.signal);
    }
    launch(label, operation, logSuccess = true) {
        const task = operation
            .then(() => {
            if (logSuccess)
                this.logger.info(`[dsh-notify-center] delivered ${label}`);
        })
            .catch(error => {
            if (!this.lifetime.signal.aborted) {
                this.logger.warn(`[dsh-notify-center] ${label} failed: ${error instanceof Error ? error.message : String(error)}`);
            }
        })
            .finally(() => this.inFlight.delete(task));
        this.inFlight.add(task);
    }
}
//# sourceMappingURL=hub.js.map