import { type NotifyLogger, type PluginConfig, type ResolvedPluginConfig } from './types.js';
export interface SettingsPathSetOp {
    op: 'set';
    path: string[];
    value: unknown;
}
export interface SettingsPathUnsetOp {
    op: 'unset';
    path: string[];
}
export type SettingsPathOp = SettingsPathSetOp | SettingsPathUnsetOp;
export interface SettingsSecretView {
    path: string[];
    set: boolean;
}
export interface NotificationSettingsView {
    revision: number;
    writable: true;
    value: PluginConfig;
    secrets: SettingsSecretView[];
}
export interface NotificationSettingsStoreOptions {
    path?: string;
    env?: NodeJS.ProcessEnv;
    homeDirectory?: string;
    logger?: NotifyLogger;
}
export declare class SettingsRevisionConflictError extends Error {
    readonly actualRevision: number;
    constructor(actualRevision: number);
}
export declare class SettingsValidationError extends Error {
    constructor(message: string);
}
export declare function resolveSettingsPath(env?: NodeJS.ProcessEnv, homeDirectory?: string): string;
export declare class NotificationSettingsStore {
    readonly path: string;
    private revision;
    private overrides;
    private removed;
    private resolved;
    private readonly profile;
    private readonly listeners;
    private writeQueue;
    private readonly logger;
    constructor(profile?: PluginConfig, options?: NotificationSettingsStoreOptions);
    getResolved(): ResolvedPluginConfig;
    getView(): NotificationSettingsView;
    subscribe(listener: (config: ResolvedPluginConfig) => void): () => void;
    mutate(expectedRevision: number, ops: SettingsPathOp[]): Promise<NotificationSettingsView>;
    private effective;
    private load;
    private write;
}
//# sourceMappingURL=settings-store.d.ts.map