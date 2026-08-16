import Schema from '@deepseek-ai/schemastery';
import { type NotificationKind, type PluginConfig, type ResolvedPluginConfig } from './types.js';
export declare const Config: Schema<PluginConfig>;
export declare const DEFAULT_EVENTS: Record<NotificationKind, boolean>;
export declare function resolveConfig(input?: PluginConfig): ResolvedPluginConfig;
/**
 * Normalize legacy string webhook entries before applying the persisted user
 * layer. This keeps every secret URL at webhooks.<channel>.url so non-secret
 * path operations never need to read or replace it.
 */
export declare function normalizeSettingsBase(input: PluginConfig): PluginConfig;
//# sourceMappingURL=config.d.ts.map