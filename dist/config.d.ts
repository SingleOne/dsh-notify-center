import Schema from '@deepseek-ai/schemastery';
import { type PluginConfig, type ResolvedPluginConfig, type WebhookInput } from './types.js';
export declare const Config: Schema<Schemastery.ObjectS<{
    locale: Schema<"zh" | "en", "zh" | "en">;
    notifySubagents: Schema<boolean, boolean>;
    events: Schema<Schemastery.ObjectS<{
        completed: Schema<boolean, boolean>;
        error: Schema<boolean, boolean>;
        aborted: Schema<boolean, boolean>;
        blocked: Schema<boolean, boolean>;
        maxTokens: Schema<boolean, boolean>;
        interrupted: Schema<boolean, boolean>;
        approval: Schema<boolean, boolean>;
    }>, Schemastery.ObjectT<{
        completed: Schema<boolean, boolean>;
        error: Schema<boolean, boolean>;
        aborted: Schema<boolean, boolean>;
        blocked: Schema<boolean, boolean>;
        maxTokens: Schema<boolean, boolean>;
        interrupted: Schema<boolean, boolean>;
        approval: Schema<boolean, boolean>;
    }>>;
    local: Schema<Schemastery.ObjectS<{
        enabled: Schema<boolean, boolean>;
        sound: Schema<boolean, boolean>;
    }>, Schemastery.ObjectT<{
        enabled: Schema<boolean, boolean>;
        sound: Schema<boolean, boolean>;
    }>>;
    rules: Schema<({
        mode?: "include" | "exclude" | null | undefined;
        pattern?: string | null | undefined;
        regex?: boolean | null | undefined;
        caseSensitive?: boolean | null | undefined;
    } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<{
        mode: Schema<"include" | "exclude", "include" | "exclude">;
        pattern: Schema<string, string>;
        regex: Schema<boolean, boolean>;
        caseSensitive: Schema<boolean, boolean>;
    }>[]>;
    webhooks: Schema<Schemastery.ObjectS<{
        feishu: Schema<WebhookInput, WebhookInput>;
        wecom: Schema<WebhookInput, WebhookInput>;
        dingtalk: Schema<WebhookInput, WebhookInput>;
        slack: Schema<WebhookInput, WebhookInput>;
        discord: Schema<WebhookInput, WebhookInput>;
        custom: Schema<WebhookInput, WebhookInput>;
    }>, Schemastery.ObjectT<{
        feishu: Schema<WebhookInput, WebhookInput>;
        wecom: Schema<WebhookInput, WebhookInput>;
        dingtalk: Schema<WebhookInput, WebhookInput>;
        slack: Schema<WebhookInput, WebhookInput>;
        discord: Schema<WebhookInput, WebhookInput>;
        custom: Schema<WebhookInput, WebhookInput>;
    }>>;
    delivery: Schema<Schemastery.ObjectS<{
        timeoutMs: Schema<number, number>;
        retries: Schema<number, number>;
        retryBaseMs: Schema<number, number>;
        maxBodyChars: Schema<number, number>;
    }>, Schemastery.ObjectT<{
        timeoutMs: Schema<number, number>;
        retries: Schema<number, number>;
        retryBaseMs: Schema<number, number>;
        maxBodyChars: Schema<number, number>;
    }>>;
}>, Schemastery.ObjectT<{
    locale: Schema<"zh" | "en", "zh" | "en">;
    notifySubagents: Schema<boolean, boolean>;
    events: Schema<Schemastery.ObjectS<{
        completed: Schema<boolean, boolean>;
        error: Schema<boolean, boolean>;
        aborted: Schema<boolean, boolean>;
        blocked: Schema<boolean, boolean>;
        maxTokens: Schema<boolean, boolean>;
        interrupted: Schema<boolean, boolean>;
        approval: Schema<boolean, boolean>;
    }>, Schemastery.ObjectT<{
        completed: Schema<boolean, boolean>;
        error: Schema<boolean, boolean>;
        aborted: Schema<boolean, boolean>;
        blocked: Schema<boolean, boolean>;
        maxTokens: Schema<boolean, boolean>;
        interrupted: Schema<boolean, boolean>;
        approval: Schema<boolean, boolean>;
    }>>;
    local: Schema<Schemastery.ObjectS<{
        enabled: Schema<boolean, boolean>;
        sound: Schema<boolean, boolean>;
    }>, Schemastery.ObjectT<{
        enabled: Schema<boolean, boolean>;
        sound: Schema<boolean, boolean>;
    }>>;
    rules: Schema<({
        mode?: "include" | "exclude" | null | undefined;
        pattern?: string | null | undefined;
        regex?: boolean | null | undefined;
        caseSensitive?: boolean | null | undefined;
    } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<{
        mode: Schema<"include" | "exclude", "include" | "exclude">;
        pattern: Schema<string, string>;
        regex: Schema<boolean, boolean>;
        caseSensitive: Schema<boolean, boolean>;
    }>[]>;
    webhooks: Schema<Schemastery.ObjectS<{
        feishu: Schema<WebhookInput, WebhookInput>;
        wecom: Schema<WebhookInput, WebhookInput>;
        dingtalk: Schema<WebhookInput, WebhookInput>;
        slack: Schema<WebhookInput, WebhookInput>;
        discord: Schema<WebhookInput, WebhookInput>;
        custom: Schema<WebhookInput, WebhookInput>;
    }>, Schemastery.ObjectT<{
        feishu: Schema<WebhookInput, WebhookInput>;
        wecom: Schema<WebhookInput, WebhookInput>;
        dingtalk: Schema<WebhookInput, WebhookInput>;
        slack: Schema<WebhookInput, WebhookInput>;
        discord: Schema<WebhookInput, WebhookInput>;
        custom: Schema<WebhookInput, WebhookInput>;
    }>>;
    delivery: Schema<Schemastery.ObjectS<{
        timeoutMs: Schema<number, number>;
        retries: Schema<number, number>;
        retryBaseMs: Schema<number, number>;
        maxBodyChars: Schema<number, number>;
    }>, Schemastery.ObjectT<{
        timeoutMs: Schema<number, number>;
        retries: Schema<number, number>;
        retryBaseMs: Schema<number, number>;
        maxBodyChars: Schema<number, number>;
    }>>;
}>>;
export declare function resolveConfig(input?: PluginConfig): ResolvedPluginConfig;
//# sourceMappingURL=config.d.ts.map