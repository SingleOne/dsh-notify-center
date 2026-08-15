import type { NotificationEnvelope, ResolvedNotificationRule, ResolvedPluginConfig } from './types.js';
export declare function ruleSubject(envelope: NotificationEnvelope): string;
export declare function ruleMatches(rule: ResolvedNotificationRule, subject: string): boolean;
export declare function rulesAllow(rules: readonly ResolvedNotificationRule[], subject: string): boolean;
export declare function shouldNotify(config: ResolvedPluginConfig, envelope: NotificationEnvelope): boolean;
//# sourceMappingURL=policy.d.ts.map