import { renderLocal } from './render.js';
export const DESKTOP_BRIDGE_URL_ENV = 'DSH_NOTIFY_BRIDGE_URL';
export const DESKTOP_BRIDGE_TOKEN_ENV = 'DSH_NOTIFY_BRIDGE_TOKEN';
export const DESKTOP_BRIDGE_PROTOCOL_VERSION = 1;
function bridgeEndpoint(value) {
    let endpoint;
    try {
        endpoint = new URL(value);
    }
    catch {
        throw new Error('desktop bridge endpoint is invalid');
    }
    if (endpoint.protocol !== 'http:' || endpoint.hostname !== '127.0.0.1') {
        throw new Error('desktop bridge endpoint must use HTTP on 127.0.0.1');
    }
    if (endpoint.username || endpoint.password || endpoint.hash) {
        throw new Error('desktop bridge endpoint contains unsupported credentials or fragment');
    }
    return endpoint;
}
function bridgeToken(value) {
    if (value.length < 32 || value.length > 512 || /[\r\n]/.test(value)) {
        throw new Error('desktop bridge token is invalid');
    }
    return value;
}
export class HttpDesktopBridge {
    endpoint;
    token;
    fetchImpl;
    constructor(endpoint, token, fetchImpl = fetch) {
        this.endpoint = endpoint;
        this.token = token;
        this.fetchImpl = fetchImpl;
    }
    async deliver(envelope, config, signal) {
        const rendered = renderLocal(envelope, config.locale);
        const controller = new AbortController();
        const abort = () => controller.abort(signal.reason);
        if (signal.aborted)
            abort();
        else
            signal.addEventListener('abort', abort, { once: true });
        const timeout = setTimeout(() => controller.abort(new Error('desktop bridge request timed out')), Math.min(config.delivery.timeoutMs, 5_000));
        try {
            let response;
            try {
                response = await this.fetchImpl(this.endpoint, {
                    method: 'POST',
                    headers: {
                        authorization: `Bearer ${this.token}`,
                        'content-type': 'application/json',
                    },
                    body: JSON.stringify({
                        version: DESKTOP_BRIDGE_PROTOCOL_VERSION,
                        notification: {
                            id: envelope.id,
                            kind: envelope.kind,
                            title: rendered.title,
                            body: rendered.body,
                            sessionId: envelope.sessionId,
                            ...(envelope.turn === undefined ? {} : { turn: envelope.turn }),
                            time: envelope.time,
                            sound: config.local.sound,
                        },
                    }),
                    signal: controller.signal,
                });
            }
            catch {
                throw new Error('desktop bridge request failed');
            }
            if (!response.ok) {
                throw new Error(`desktop bridge rejected the notification (${response.status})`);
            }
        }
        finally {
            clearTimeout(timeout);
            signal.removeEventListener('abort', abort);
        }
    }
}
export function createDesktopBridgeFromEnvironment(environment = process.env, fetchImpl = fetch) {
    const endpoint = environment[DESKTOP_BRIDGE_URL_ENV];
    const token = environment[DESKTOP_BRIDGE_TOKEN_ENV];
    if (!endpoint && !token)
        return null;
    if (!endpoint || !token)
        throw new Error('desktop bridge environment is incomplete');
    return new HttpDesktopBridge(bridgeEndpoint(endpoint), bridgeToken(token), fetchImpl);
}
//# sourceMappingURL=bridge.js.map