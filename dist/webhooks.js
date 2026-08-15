import { renderWebhookText } from './render.js';
function webhookPayload(channel, envelope, text) {
    switch (channel) {
        case 'feishu': return { msg_type: 'text', content: { text } };
        case 'wecom': return { msgtype: 'text', text: { content: text } };
        case 'dingtalk': return { msgtype: 'text', text: { content: text } };
        case 'slack': return { text };
        case 'discord': return { content: text };
        case 'custom': return {
            text,
            kind: envelope.kind,
            title: envelope.title,
            sessionId: envelope.sessionId,
            turn: envelope.turn,
            durationMs: envelope.durationMs,
            time: new Date(envelope.time).toISOString(),
        };
    }
}
function defaultSleep(ms, signal) {
    return new Promise((resolve, reject) => {
        if (signal.aborted) {
            reject(new Error('webhook delivery cancelled'));
            return;
        }
        const timer = setTimeout(done, ms);
        function done() {
            signal.removeEventListener('abort', abort);
            resolve();
        }
        function abort() {
            clearTimeout(timer);
            reject(new Error('webhook delivery cancelled'));
        }
        signal.addEventListener('abort', abort, { once: true });
    });
}
function requestSignal(parent, timeoutMs) {
    const controller = new AbortController();
    const abort = () => controller.abort(parent.reason);
    parent.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => controller.abort(new Error('webhook request timed out')), timeoutMs);
    return {
        signal: controller.signal,
        cleanup() {
            clearTimeout(timer);
            parent.removeEventListener('abort', abort);
        },
    };
}
function retryableStatus(status) {
    return status === 408 || status === 425 || status === 429 || status >= 500;
}
function safeError(error, secretUrl) {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    return message.replaceAll(secretUrl, '[redacted webhook]');
}
export async function deliverWebhook(channel, envelope, options) {
    const fetchImpl = options.fetch ?? fetch;
    const sleep = options.sleep ?? defaultSleep;
    const text = renderWebhookText(envelope, channel.includeSummary, options.locale);
    const body = JSON.stringify(webhookPayload(channel.name, envelope, text));
    let lastError = 'unknown error';
    for (let attempt = 0; attempt <= options.retries; attempt += 1) {
        if (options.signal.aborted)
            throw new Error('webhook delivery cancelled');
        const request = requestSignal(options.signal, options.timeoutMs);
        try {
            const response = await fetchImpl(channel.url, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body,
                signal: request.signal,
            });
            if (response.ok)
                return attempt + 1;
            lastError = `HTTP ${response.status}`;
            if (!retryableStatus(response.status))
                break;
        }
        catch (error) {
            lastError = safeError(error, channel.url);
            if (options.signal.aborted)
                throw new Error('webhook delivery cancelled');
        }
        finally {
            request.cleanup();
        }
        if (attempt < options.retries) {
            await sleep(options.retryBaseMs * (2 ** attempt), options.signal);
        }
    }
    throw new Error(`${channel.name} webhook failed after ${options.retries + 1} attempt(s): ${lastError}`);
}
//# sourceMappingURL=webhooks.js.map