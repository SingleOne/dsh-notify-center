import type { NotificationEnvelope, NotifyLogger, ResolvedPluginConfig } from './types.js';
export declare class NotificationHub {
    private readonly config;
    private readonly logger;
    private readonly maxInFlight;
    private readonly lifetime;
    private readonly inFlight;
    constructor(config: ResolvedPluginConfig, logger: NotifyLogger, maxInFlight?: number);
    dispatch(envelope: NotificationEnvelope): void;
    dispose(): void;
    private launch;
}
//# sourceMappingURL=hub.d.ts.map