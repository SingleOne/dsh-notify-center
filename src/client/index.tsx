import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { SettingsSection, type SettingsSectionInjected } from './SettingsSection.js'
import { registerDesktopSessionActivation } from './activation.js'
import { NotificationSettingsController } from './settings-store.js'
import { styles } from './styles.js'

export const inject = ['slots', 'sessions']

export function apply(ctx: ClientContext): void {
  const style = document.createElement('style')
  style.dataset.plugin = 'dsh-notify-center'
  style.dataset.pluginCss = 'dsh-notify-center/settings'
  style.textContent = styles
  document.head.appendChild(style)
  ctx.effect(() => () => style.remove(), 'dsh-notify-center: settings styles')
  ctx.effect(
    () => registerDesktopSessionActivation(window, ctx.sessions),
    'dsh-notify-center: desktop session activation',
  )

  const controller = new NotificationSettingsController()
  const injected = (): SettingsSectionInjected => ({ controller })
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'dsh-notify-center',
    order: 35,
    label: '通知中心',
    inject: injected,
  }, SettingsSection))
}
