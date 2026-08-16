import type { NotificationEnvelope, ResolvedPluginConfig } from './types.js';
export declare const DESKTOP_BRIDGE_URL_ENV = "DSH_NOTIFY_BRIDGE_URL";
export declare const DESKTOP_BRIDGE_TOKEN_ENV = "DSH_NOTIFY_BRIDGE_TOKEN";
export declare const DESKTOP_BRIDGE_PROTOCOL_VERSION = 1;
export interface DesktopBridge {
    deliver(envelope: NotificationEnvelope, config: ResolvedPluginConfig, signal: AbortSignal): Promise<void>;
}
export interface DesktopBridgeEnvironment {
    readonly DSH_NOTIFY_BRIDGE_URL?: string;
    readonly DSH_NOTIFY_BRIDGE_TOKEN?: string;
}
type Fetch = typeof fetch;
export declare class HttpDesktopBridge implements DesktopBridge {
    private readonly endpoint;
    private readonly token;
    private readonly fetchImpl;
    constructor(endpoint: URL, token: string, fetchImpl?: Fetch);
    deliver(envelope: NotificationEnvelope, config: ResolvedPluginConfig, signal: AbortSignal): Promise<void>;
}
export declare function createDesktopBridgeFromEnvironment(environment?: DesktopBridgeEnvironment, fetchImpl?: Fetch): DesktopBridge | null;
export {};
//# sourceMappingURL=bridge.d.ts.map