import { sendLocalNotification } from './local.js'
import { deliverWebhook } from './webhooks.js'
import type { DesktopBridge } from './bridge.js'
import type {
  NotificationEnvelope,
  NotifyLogger,
  ResolvedPluginConfig,
} from './types.js'

export class NotificationHub {
  private readonly lifetime = new AbortController()
  private readonly inFlight = new Set<Promise<void>>()

  constructor(
    private config: ResolvedPluginConfig,
    private readonly logger: NotifyLogger,
    private readonly desktopBridge: DesktopBridge | null = null,
    private readonly maxInFlight = 100,
  ) {}

  updateConfig(config: ResolvedPluginConfig): void {
    this.config = config
  }

  dispatch(envelope: NotificationEnvelope): void {
    if (this.inFlight.size >= this.maxInFlight) {
      this.logger.warn(`[dsh-notify-center] delivery queue full; dropped ${envelope.id}`)
      return
    }
    if (this.config.local.enabled) {
      this.launch(
        `local ${envelope.id}`,
        this.deliverLocal(envelope),
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

  private async deliverLocal(envelope: NotificationEnvelope): Promise<void> {
    if (this.desktopBridge) {
      try {
        await this.desktopBridge.deliver(envelope, this.config, this.lifetime.signal)
        return
      } catch (error) {
        if (this.lifetime.signal.aborted) throw error
        this.logger.warn(
          `[dsh-notify-center] desktop bridge unavailable; using native fallback: ${error instanceof Error ? error.message : 'unknown error'}`,
        )
      }
    }
    await sendLocalNotification(envelope, this.config, this.lifetime.signal)
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
