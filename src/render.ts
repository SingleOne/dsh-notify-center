import type { NotificationEnvelope, NotificationLocale } from './types.js'

const TITLES: Record<NotificationLocale, Record<NotificationEnvelope['kind'], string>> = {
  zh: {
    completed: 'DSH 任务完成',
    error: 'DSH 运行出错',
    aborted: 'DSH 已中止',
    blocked: 'DSH 已阻塞',
    'max-tokens': 'DSH 达到 Token 上限',
    interrupted: 'DSH 任务中断',
    approval: 'DSH 等待审批',
  },
  en: {
    completed: 'DSH task completed',
    error: 'DSH task failed',
    aborted: 'DSH task aborted',
    blocked: 'DSH task blocked',
    'max-tokens': 'DSH token limit reached',
    interrupted: 'DSH task interrupted',
    approval: 'DSH approval required',
  },
}

export function formatDuration(durationMs: number, locale: NotificationLocale): string {
  const seconds = Math.max(0, Math.round(durationMs / 1_000))
  if (seconds < 60) return locale === 'zh' ? `${seconds} 秒` : `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  if (locale === 'zh') return rest ? `${minutes} 分 ${rest} 秒` : `${minutes} 分钟`
  return rest ? `${minutes}m ${rest}s` : `${minutes}m`
}

export function renderLocal(
  envelope: NotificationEnvelope,
  locale: NotificationLocale,
): { title: string; body: string } {
  const lines = [envelope.title]
  if (envelope.summary) lines.push(envelope.summary)
  if (envelope.durationMs !== undefined) {
    lines.push(locale === 'zh'
      ? `耗时：${formatDuration(envelope.durationMs, locale)}`
      : `Duration: ${formatDuration(envelope.durationMs, locale)}`)
  }
  return { title: TITLES[locale][envelope.kind], body: lines.join('\n') }
}

export function renderWebhookText(
  envelope: NotificationEnvelope,
  includeSummary: boolean,
  locale: NotificationLocale,
): string {
  const lines = [`【${TITLES[locale][envelope.kind]}】${envelope.title}`]
  if (includeSummary && envelope.summary) {
    lines.push(locale === 'zh' ? `摘要：${envelope.summary}` : `Summary: ${envelope.summary}`)
  }
  if (includeSummary && envelope.reason) {
    lines.push(locale === 'zh' ? `原因：${envelope.reason}` : `Reason: ${envelope.reason}`)
  }
  if (envelope.durationMs !== undefined) {
    lines.push(locale === 'zh'
      ? `耗时：${formatDuration(envelope.durationMs, locale)}`
      : `Duration: ${formatDuration(envelope.durationMs, locale)}`)
  }
  lines.push(locale === 'zh' ? `会话：${envelope.sessionId}` : `Session: ${envelope.sessionId}`)
  return lines.join('\n')
}
