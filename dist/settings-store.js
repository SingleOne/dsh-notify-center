import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { mkdir, open, rename, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { normalizeSettingsBase, resolveConfig } from './config.js';
import { WEBHOOK_CHANNELS, } from './types.js';
const DOCUMENT_VERSION = 1;
const MAX_SETTINGS_BYTES = 128 * 1024;
const ROOT_KEYS = new Set(['locale', 'notifySubagents', 'events', 'local', 'rules', 'webhooks', 'delivery']);
const EVENT_KEYS = new Set(['completed', 'error', 'aborted', 'blocked', 'maxTokens', 'interrupted', 'approval']);
const LOCAL_KEYS = new Set(['enabled', 'sound']);
const DELIVERY_KEYS = new Set(['timeoutMs', 'retries', 'retryBaseMs', 'maxBodyChars']);
const WEBHOOK_KEYS = new Set(['url', 'events', 'includeSummary']);
const WEBHOOK_NAMES = new Set(WEBHOOK_CHANNELS);
export class SettingsRevisionConflictError extends Error {
    actualRevision;
    constructor(actualRevision) {
        super('settings changed in another window; reload and try again');
        this.actualRevision = actualRevision;
        this.name = 'SettingsRevisionConflictError';
    }
}
export class SettingsValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'SettingsValidationError';
    }
}
function isObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function cloneJson(value) {
    return structuredClone(value);
}
function assertJsonValue(value, path = 'value') {
    if (value === null || typeof value === 'string' || typeof value === 'boolean')
        return;
    if (typeof value === 'number') {
        if (Number.isFinite(value))
            return;
        throw new SettingsValidationError(`${path} must contain only finite numbers`);
    }
    if (Array.isArray(value)) {
        value.forEach((item, index) => assertJsonValue(item, `${path}[${index}]`));
        return;
    }
    if (!isObject(value))
        throw new SettingsValidationError(`${path} must be JSON-compatible`);
    for (const [key, item] of Object.entries(value)) {
        if (key === '__proto__' || key === 'prototype' || key === 'constructor') {
            throw new SettingsValidationError(`${path} contains a forbidden key`);
        }
        assertJsonValue(item, `${path}.${key}`);
    }
}
function isPrefix(prefix, path) {
    return prefix.length <= path.length && prefix.every((part, index) => part === path[index]);
}
function validatePath(path) {
    if (!Array.isArray(path) || path.length < 1 || path.length > 3 || path.some(part => typeof part !== 'string')) {
        throw new SettingsValidationError('operation path is invalid');
    }
    const [root, second, third] = path;
    if (!ROOT_KEYS.has(root))
        throw new SettingsValidationError(`setting path ${path.join('.')} is not supported`);
    if (path.length === 1)
        return;
    if (root === 'events' && path.length === 2 && EVENT_KEYS.has(second))
        return;
    if (root === 'local' && path.length === 2 && LOCAL_KEYS.has(second))
        return;
    if (root === 'delivery' && path.length === 2 && DELIVERY_KEYS.has(second))
        return;
    if (root === 'webhooks' && WEBHOOK_NAMES.has(second)) {
        if (path.length === 2 || (path.length === 3 && WEBHOOK_KEYS.has(third)))
            return;
    }
    throw new SettingsValidationError(`setting path ${path.join('.')} is not supported`);
}
function deepMerge(base, overrides) {
    const output = cloneJson(base);
    for (const [key, value] of Object.entries(overrides)) {
        const current = output[key];
        output[key] = isObject(current) && isObject(value)
            ? deepMerge(current, value)
            : cloneJson(value);
    }
    return output;
}
function setAtPath(target, path, value) {
    let cursor = target;
    for (const part of path.slice(0, -1)) {
        const current = cursor[part];
        if (!isObject(current))
            cursor[part] = {};
        cursor = cursor[part];
    }
    cursor[path.at(-1)] = cloneJson(value);
}
function deleteAtPath(target, path) {
    const parents = [];
    let cursor = target;
    for (const part of path.slice(0, -1)) {
        const current = cursor[part];
        if (!isObject(current))
            return;
        parents.push([cursor, part]);
        cursor = current;
    }
    delete cursor[path.at(-1)];
    for (const [parent, key] of parents.reverse()) {
        const child = parent[key];
        if (isObject(child) && Object.keys(child).length === 0)
            delete parent[key];
        else
            break;
    }
}
function applyRemovals(value, removed) {
    const output = cloneJson(value);
    for (const path of [...removed].sort((left, right) => left.length - right.length)) {
        deleteAtPath(output, path);
    }
    return output;
}
function asJsonObject(value) {
    assertJsonValue(value);
    return cloneJson(value);
}
function parseDocument(raw) {
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch {
        throw new SettingsValidationError('settings file is not valid JSON');
    }
    if (!isObject(parsed) || parsed.version !== DOCUMENT_VERSION) {
        throw new SettingsValidationError('settings file version is not supported');
    }
    if (!Number.isSafeInteger(parsed.revision) || Number(parsed.revision) < 0 || !isObject(parsed.overrides)) {
        throw new SettingsValidationError('settings file metadata is invalid');
    }
    if (!Array.isArray(parsed.removed))
        throw new SettingsValidationError('settings file removals are invalid');
    const removed = parsed.removed.map((path) => {
        validatePath(path);
        return [...path];
    });
    assertJsonValue(parsed.overrides, 'overrides');
    return {
        version: DOCUMENT_VERSION,
        revision: Number(parsed.revision),
        overrides: cloneJson(parsed.overrides),
        removed,
    };
}
function redactedView(value) {
    const output = cloneJson(value);
    const webhooks = isObject(output.webhooks) ? output.webhooks : undefined;
    const secrets = [];
    for (const name of WEBHOOK_CHANNELS) {
        const channel = webhooks?.[name];
        let set = false;
        if (typeof channel === 'string') {
            set = channel.trim().length > 0;
            delete webhooks?.[name];
        }
        else if (isObject(channel)) {
            set = typeof channel.url === 'string' && channel.url.trim().length > 0;
            delete channel.url;
            if (Object.keys(channel).length === 0)
                delete webhooks?.[name];
        }
        secrets.push({ path: ['webhooks', name, 'url'], set });
    }
    if (webhooks && Object.keys(webhooks).length === 0)
        delete output.webhooks;
    return { value: output, secrets };
}
export function resolveSettingsPath(env = process.env, homeDirectory = homedir()) {
    const configuredHome = env.DSH_HOME?.trim();
    const dshHome = configuredHome || join(homeDirectory, '.dsh');
    return join(dshHome, 'dsh-notify-center', 'settings.json');
}
export class NotificationSettingsStore {
    path;
    revision = 0;
    overrides = {};
    removed = [];
    resolved;
    profile;
    listeners = new Set();
    writeQueue = Promise.resolve();
    logger;
    constructor(profile = {}, options = {}) {
        this.path = options.path ?? resolveSettingsPath(options.env, options.homeDirectory);
        this.logger = options.logger ?? console;
        this.profile = asJsonObject(normalizeSettingsBase(profile));
        this.load();
        this.resolved = resolveConfig(this.effective());
    }
    getResolved() {
        return this.resolved;
    }
    getView() {
        return {
            revision: this.revision,
            writable: true,
            ...redactedView(this.effective()),
        };
    }
    subscribe(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }
    mutate(expectedRevision, ops) {
        const run = this.writeQueue.then(async () => {
            if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
                throw new SettingsValidationError('expectedRevision must be a non-negative integer');
            }
            if (expectedRevision !== this.revision)
                throw new SettingsRevisionConflictError(this.revision);
            if (!Array.isArray(ops) || ops.length < 1 || ops.length > 64) {
                throw new SettingsValidationError('ops must contain between 1 and 64 operations');
            }
            const overrides = cloneJson(this.overrides);
            let removed = cloneJson(this.removed);
            for (const operation of ops) {
                if (!isObject(operation) || (operation.op !== 'set' && operation.op !== 'unset')) {
                    throw new SettingsValidationError('operation is invalid');
                }
                validatePath(operation.path);
                if (operation.op === 'set') {
                    if (!Object.hasOwn(operation, 'value'))
                        throw new SettingsValidationError('set operation requires a value');
                    assertJsonValue(operation.value);
                    setAtPath(overrides, operation.path, operation.value);
                    removed = removed.filter(path => !(isPrefix(path, operation.path) || isPrefix(operation.path, path)));
                }
                else {
                    deleteAtPath(overrides, operation.path);
                    if (!removed.some(path => isPrefix(path, operation.path))) {
                        removed = removed.filter(path => !isPrefix(operation.path, path));
                        removed.push([...operation.path]);
                    }
                }
            }
            const effective = applyRemovals(deepMerge(this.profile, overrides), removed);
            const resolved = resolveConfig(effective);
            const document = {
                version: DOCUMENT_VERSION,
                revision: this.revision + 1,
                overrides,
                removed,
            };
            await this.write(document);
            this.revision = document.revision;
            this.overrides = overrides;
            this.removed = removed;
            this.resolved = resolved;
            for (const listener of this.listeners) {
                try {
                    listener(resolved);
                }
                catch (error) {
                    this.logger.warn(`[dsh-notify-center] settings listener failed: ${error instanceof Error ? error.message : String(error)}`);
                }
            }
        });
        this.writeQueue = run.catch(() => { });
        return run.then(() => this.getView());
    }
    effective() {
        return applyRemovals(deepMerge(this.profile, this.overrides), this.removed);
    }
    load() {
        if (!existsSync(this.path))
            return;
        try {
            const stats = statSync(this.path);
            if (!stats.isFile() || stats.size > MAX_SETTINGS_BYTES) {
                throw new SettingsValidationError('settings file is missing, not a file, or too large');
            }
            const document = parseDocument(readFileSync(this.path, 'utf8'));
            const effective = applyRemovals(deepMerge(this.profile, document.overrides), document.removed);
            resolveConfig(effective);
            this.revision = document.revision;
            this.overrides = document.overrides;
            this.removed = document.removed;
        }
        catch (error) {
            this.logger.warn(`[dsh-notify-center] ignored invalid settings file: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async write(document) {
        const body = `${JSON.stringify(document, null, 2)}\n`;
        if (Buffer.byteLength(body) > MAX_SETTINGS_BYTES) {
            throw new SettingsValidationError('settings document exceeds the size limit');
        }
        const directory = dirname(this.path);
        await mkdir(directory, { recursive: true, mode: 0o700 });
        const temporaryPath = join(directory, `.settings-${process.pid}-${randomUUID()}.tmp`);
        const handle = await open(temporaryPath, 'wx', 0o600);
        try {
            try {
                await handle.writeFile(body, 'utf8');
                await handle.sync();
            }
            finally {
                await handle.close();
            }
            await rename(temporaryPath, this.path);
        }
        catch (error) {
            await unlink(temporaryPath).catch(() => { });
            throw error;
        }
    }
}
//# sourceMappingURL=settings-store.js.map