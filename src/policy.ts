import type {
  NotificationEnvelope,
  ResolvedNotificationRule,
  ResolvedPluginConfig,
} from './types.js'

export function ruleSubject(envelope: NotificationEnvelope): string {
  return [envelope.title, envelope.summary, envelope.reason ?? '', envelope.tools.join(' ')]
    .filter(Boolean)
    .join('\n')
}

export function ruleMatches(rule: ResolvedNotificationRule, subject: string): boolean {
  if (rule.expression) return rule.expression.test(subject)
  const haystack = rule.caseSensitive ? subject : subject.toLowerCase()
  const needle = rule.caseSensitive ? rule.pattern : rule.pattern.toLowerCase()
  return haystack.includes(needle)
}

export function rulesAllow(rules: readonly ResolvedNotificationRule[], subject: string): boolean {
  const includes = rules.filter(rule => rule.mode === 'include')
  const excludes = rules.filter(rule => rule.mode === 'exclude')
  if (excludes.some(rule => ruleMatches(rule, subject))) return false
  return includes.length === 0 || includes.some(rule => ruleMatches(rule, subject))
}

export function shouldNotify(config: ResolvedPluginConfig, envelope: NotificationEnvelope): boolean {
  return config.events[envelope.kind] && rulesAllow(config.rules, ruleSubject(envelope))
}
