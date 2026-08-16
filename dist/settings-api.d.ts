import type { IncomingMessage, ServerResponse } from 'node:http';
import type { NotifyLogger } from './types.js';
import { NotificationSettingsStore } from './settings-store.js';
export declare const SETTINGS_API_PATH = "/api/dsh-notify-center/settings";
export interface SettingsRouteRegistry {
    register(route: {
        kind: 'exact';
        path: string;
        handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;
    }): () => void;
}
export declare function createSettingsApiHandler(store: NotificationSettingsStore, logger?: NotifyLogger): (req: IncomingMessage, res: ServerResponse) => Promise<void>;
export declare function registerSettingsApi(webServer: SettingsRouteRegistry, store: NotificationSettingsStore, logger?: NotifyLogger): () => void;
//# sourceMappingURL=settings-api.d.ts.map