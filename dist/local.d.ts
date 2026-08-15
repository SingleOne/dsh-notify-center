import type { NotificationEnvelope, ResolvedPluginConfig } from './types.js';
export interface LocalCommand {
    readonly command: string;
    readonly args: readonly string[];
    readonly timeoutMs: number;
    readonly stdin?: string;
}
export declare function buildWindowsScript(title: string, body: string, id: string, sound: boolean): string;
export declare function appleScriptQuote(value: string): string;
export declare function commandForPlatform(platform: NodeJS.Platform, envelope: NotificationEnvelope, config: ResolvedPluginConfig): LocalCommand | null;
export declare function sendLocalNotification(envelope: NotificationEnvelope, config: ResolvedPluginConfig, signal: AbortSignal, platform?: NodeJS.Platform): Promise<void>;
//# sourceMappingURL=local.d.ts.map