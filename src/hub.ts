import { sendLocalNotification } from './local.js'
import { deliverWebhook } from './webhooks.js'
import type {
  NotificationEnvelope,
  NotifyLogger,
  ResolvedPluginConfig,
} from './types.js'

export class NotificationHub {
  private readonly lifetime = new AbortController()
  private readonly inFlight = new Set<Promise<void>>()

  constructor(
    private readonly config: ResolvedPluginConfig,
    private readonly logger: NotifyLogger,
    private readonly maxInFlight = 100,
  ) {}

  dispatch(envelope: NotificationEnvelope): void {
    if (this.inFlight.size >= this.maxInFlight) {
      this.logger.warn(`[dsh-notify-center] delivery queue full; dropped ${envelope.id}`)
      return
    }
    if (this.config.local.enabled) {
      this.launch(
        `local ${envelope.id}`,
        sendLocalNotification(envelope, this.config, this.lifetime.signal),
      )
    }
    for (const channel of this.config.webhooks) {
      if (!channel.events.has(envelope.kind)) continue
      this.launch(
        `${channel.name} ${envelope.id}`,
        deliverWebhook(channel, envelope, {
          ...this.config.delivery,
          locale: this.config.locale,
          signal: this.lifetime.signal,
        }).then(attempts => {
          this.logger.info(`[dsh-notify-center] ${channel.name} delivered ${envelope.id} in ${attempts} attempt(s)`)
        }),
        false,
      )
    }
  }

  dispose(): void {
    this.lifetime.abort(new Error('dsh-notify-center disposed'))
  }

  private launch(label: string, operation: Promise<unknown>, logSuccess = true): void {
    const task = operation
      .then(() => {
        if (logSuccess) this.logger.info(`[dsh-notify-center] delivered ${label}`)
      })
      .catch(error => {
        if (!this.lifetime.signal.aborted) {
          this.logger.warn(`[dsh-notify-center] ${label} failed: ${error instanceof Error ? error.message : String(error)}`)
        }
      })
      .finally(() => this.inFlight.delete(task))
    this.inFlight.add(task)
  }
}
