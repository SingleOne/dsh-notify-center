import type { DesktopBridge } from './bridge.js';
import type { NotificationEnvelope, NotifyLogger, ResolvedPluginConfig } from './types.js';
export declare class NotificationHub {
    private config;
    private readonly logger;
    private readonly desktopBridge;
    private readonly maxInFlight;
    private readonly lifetime;
    private readonly inFlight;
    constructor(config: ResolvedPluginConfig, logger: NotifyLogger, desktopBridge?: DesktopBridge | null, maxInFlight?: number);
    updateConfig(config: ResolvedPluginConfig): void;
    dispatch(envelope: NotificationEnvelope): void;
    dispose(): void;
    private deliverLocal;
    private launch;
}
//# sourceMappingURL=hub.d.ts.map