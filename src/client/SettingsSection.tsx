import {
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type ReactNode,
} from 'react'
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import {
  NOTIFICATION_KINDS,
  WEBHOOK_CHANNELS,
  type NotificationKind,
  type WebhookChannelName,
} from '../types.js'
import {
  normalizeSettingsValue,
  type NotificationSettingsController,
  type NotificationSettingsValue,
  type SettingsPathOp,
} from './settings-store.js'

export interface SettingsSectionInjected {
  controller: NotificationSettingsController
}

export type SettingsSectionProps = PropsRuntime<'settings.section'> & InjectFace<SettingsSectionInjected>

const EVENT_LABELS: Record<NotificationKind, string> = {
  completed: '任务完成',
  error: '运行出错',
  aborted: '任务中止',
  blocked: '任务阻塞',
  'max-tokens': '达到 Token 上限',
  interrupted: '任务中断',
  approval: '等待审批',
}

const CHANNEL_LABELS: Record<WebhookChannelName, string> = {
  feishu: '飞书',
  wecom: '企业微信',
  dingtalk: '钉钉',
  slack: 'Slack',
  discord: 'Discord',
  custom: '自定义 Webhook',
}

const BANNER_TIMEOUT_MS = 5_000

function eventConfig(value: NotificationSettingsValue): Record<string, boolean> {
  return {
    completed: value.events.completed,
    error: value.events.error,
    aborted: value.events.aborted,
    blocked: value.events.blocked,
    maxTokens: value.events['max-tokens'],
    interrupted: value.events.interrupted,
    approval: value.events.approval,
  }
}

function numberInRange(value: number, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.max(min, Math.min(max, Math.round(value)))
}

export function SettingsSection({ controller }: SettingsSectionProps): ReactNode {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
  const resolved = useMemo(
    () => normalizeSettingsValue(state.view?.value),
    [state.view?.revision],
  )
  const [draft, setDraft] = useState(resolved)
  const [webhookUrls, setWebhookUrls] = useState<Partial<Record<WebhookChannelName, string>>>({})
  const [saved, setSaved] = useState(false)
  const [errorDismissed, setErrorDismissed] = useState(false)

  useEffect(() => { void controller.load() }, [controller])
  useEffect(() => {
    setDraft(resolved)
    setWebhookUrls({})
  }, [resolved])
  useEffect(() => {
    if (state.status === 'error') setErrorDismissed(false)
  }, [state.status, state.error])
  useEffect(() => {
    if (!saved) return
    const timeout = window.setTimeout(() => setSaved(false), BANNER_TIMEOUT_MS)
    return () => window.clearTimeout(timeout)
  }, [saved])
  useEffect(() => {
    if (!state.error || errorDismissed) return
    const timeout = window.setTimeout(() => setErrorDismissed(true), BANNER_TIMEOUT_MS)
    return () => window.clearTimeout(timeout)
  }, [state.error, errorDismissed])

  if (state.status === 'idle' || (state.status === 'loading' && state.view === null)) {
    return <p className="dnc-status">正在读取通知设置…</p>
  }
  if (state.status === 'unavailable') {
    return <p className="dnc-status dnc-status--error">通知插件的配置接口不可用；本机通知和 Webhook 投递仍会继续工作。</p>
  }

  const saving = state.status === 'saving'
  const disabled = saving || !state.writable

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    setSaved(false)
    const ops: SettingsPathOp[] = [
      { op: 'set', path: ['locale'], value: draft.locale },
      { op: 'set', path: ['notifySubagents'], value: draft.notifySubagents },
      { op: 'set', path: ['events'], value: eventConfig(draft) },
      { op: 'set', path: ['local'], value: draft.local },
      { op: 'set', path: ['rules'], value: draft.rules.filter(rule => rule.pattern.trim()) },
      { op: 'set', path: ['delivery'], value: draft.delivery },
    ]
    for (const name of WEBHOOK_CHANNELS) {
      const url = webhookUrls[name]?.trim()
      if (!controller.webhookConfigured(name) && !url) continue
      ops.push(
        { op: 'set', path: ['webhooks', name, 'events'], value: draft.webhooks[name].events },
        { op: 'set', path: ['webhooks', name, 'includeSummary'], value: draft.webhooks[name].includeSummary },
      )
      if (url) ops.push({ op: 'set', path: ['webhooks', name, 'url'], value: url })
    }
    const ok = await controller.mutate(ops)
    setSaved(ok)
  }

  const removeWebhook = async (name: WebhookChannelName): Promise<void> => {
    setSaved(false)
    const ok = await controller.mutate([{ op: 'unset', path: ['webhooks', name] }])
    if (ok) setWebhookUrls(current => ({ ...current, [name]: '' }))
  }

  return (
    <form className="dnc-page" onSubmit={(event) => { void submit(event) }}>
      <header className="dnc-heading">
        <div>
          <h2>通知中心</h2>
          <p>统一管理本机通知、Webhook、触发条件和隐私选项。设置由插件持久化并实时生效。</p>
        </div>
        <span className="dnc-version">v0.2</span>
      </header>

      {!state.writable ? <p className="dnc-banner">当前插件设置存储为只读，所有控件已禁用。</p> : null}
      {state.error && !errorDismissed ? (
        <div className="dnc-banner dnc-banner--error" role="alert">
          <span>保存失败：{state.error}</span>
          <button
            className="dnc-banner-close"
            type="button"
            aria-label="关闭保存失败提示"
            onClick={() => setErrorDismissed(true)}
          >×</button>
        </div>
      ) : null}
      {saved ? (
        <div className="dnc-banner dnc-banner--success" role="status">
          <span>设置已保存并实时应用。</span>
          <button
            className="dnc-banner-close"
            type="button"
            aria-label="关闭保存成功提示"
            onClick={() => setSaved(false)}
          >×</button>
        </div>
      ) : null}

      <section className="dnc-panel">
        <div className="dnc-panel-title">
          <h3>常规</h3>
          <p>选择语言、通知范围和本机系统通知行为。</p>
        </div>
        <div className="dnc-general-grid">
          <label className="dnc-general-language">
            <span><strong>通知语言</strong><small>设置通知内容使用的语言</small></span>
            <select
              value={draft.locale}
              disabled={disabled}
              onChange={(event) => {
                const locale = event.currentTarget.value === 'en' ? 'en' : 'zh'
                setDraft(current => ({ ...current, locale }))
              }}
            >
              <option value="zh">简体中文</option>
              <option value="en">English</option>
            </select>
          </label>
          <label className="dnc-switch">
            <input
              type="checkbox"
              checked={draft.local.enabled}
              disabled={disabled}
              onChange={(event) => {
                const enabled = event.currentTarget.checked
                setDraft(current => ({ ...current, local: { ...current.local, enabled } }))
              }}
            />
            <span><strong>本机系统通知</strong><small>桌面 App 不可用时自动使用系统原生实现</small></span>
          </label>
          <label className="dnc-switch">
            <input
              type="checkbox"
              checked={draft.local.sound}
              disabled={disabled || !draft.local.enabled}
              onChange={(event) => {
                const sound = event.currentTarget.checked
                setDraft(current => ({ ...current, local: { ...current.local, sound } }))
              }}
            />
            <span><strong>通知声音</strong><small>是否请求系统播放提示音</small></span>
          </label>
          <label className="dnc-switch">
            <input
              type="checkbox"
              checked={draft.notifySubagents}
              disabled={disabled}
              onChange={(event) => {
                const notifySubagents = event.currentTarget.checked
                setDraft(current => ({ ...current, notifySubagents }))
              }}
            />
            <span><strong>包含子代理</strong><small>默认仅通知根任务，开启后包含子代理任务</small></span>
          </label>
        </div>
      </section>

      <section className="dnc-panel">
        <div className="dnc-panel-title">
          <h3>触发事件</h3>
          <p>所选事件同时作用于本机通知；每个 Webhook 还可以进一步收窄范围。</p>
        </div>
        <div className="dnc-check-grid">
          {NOTIFICATION_KINDS.map(kind => (
            <label className="dnc-check" key={kind}>
              <input
                type="checkbox"
                checked={draft.events[kind]}
                disabled={disabled}
                onChange={(event) => {
                  const enabled = event.currentTarget.checked
                  setDraft(current => ({
                    ...current,
                    events: { ...current.events, [kind]: enabled },
                  }))
                }}
              />
              <span>{EVENT_LABELS[kind]}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="dnc-panel">
        <div className="dnc-panel-title dnc-panel-title--row">
          <div>
            <h3>内容规则</h3>
            <p>按会话标题、摘要和工具名包含或排除通知。</p>
          </div>
          <button
            className="dnc-button dnc-button--secondary"
            type="button"
            disabled={disabled}
            onClick={() => setDraft(current => ({
              ...current,
              rules: [...current.rules, { mode: 'include', pattern: '', regex: false, caseSensitive: false }],
            }))}
          >添加规则</button>
        </div>
        {draft.rules.length === 0 ? <p className="dnc-empty">没有内容规则，所有匹配已启用事件的任务都会通知。</p> : null}
        <div className="dnc-rules">
          {draft.rules.map((rule, index) => (
            <div className="dnc-rule" key={index}>
              <select
                value={rule.mode ?? 'include'}
                disabled={disabled}
                aria-label={`规则 ${index + 1} 模式`}
                onChange={(event) => {
                  const mode = event.currentTarget.value === 'exclude' ? 'exclude' : 'include'
                  setDraft(current => ({
                    ...current,
                    rules: current.rules.map((item, itemIndex) => itemIndex === index
                      ? { ...item, mode }
                      : item),
                  }))
                }}
              >
                <option value="include">包含</option>
                <option value="exclude">排除</option>
              </select>
              <input
                value={rule.pattern}
                disabled={disabled}
                placeholder="关键词或正则表达式"
                aria-label={`规则 ${index + 1} 内容`}
                onChange={(event) => {
                  const pattern = event.currentTarget.value
                  setDraft(current => ({
                    ...current,
                    rules: current.rules.map((item, itemIndex) => itemIndex === index
                      ? { ...item, pattern }
                      : item),
                  }))
                }}
              />
              <label><input
                type="checkbox"
                checked={rule.regex ?? false}
                disabled={disabled}
                onChange={(event) => {
                  const regex = event.currentTarget.checked
                  setDraft(current => ({
                    ...current,
                    rules: current.rules.map((item, itemIndex) => itemIndex === index
                      ? { ...item, regex }
                      : item),
                  }))
                }}
              />正则</label>
              <label><input
                type="checkbox"
                checked={rule.caseSensitive ?? false}
                disabled={disabled}
                onChange={(event) => {
                  const caseSensitive = event.currentTarget.checked
                  setDraft(current => ({
                    ...current,
                    rules: current.rules.map((item, itemIndex) => itemIndex === index
                      ? { ...item, caseSensitive }
                      : item),
                  }))
                }}
              />区分大小写</label>
              <button
                className="dnc-icon-button"
                type="button"
                disabled={disabled}
                aria-label={`删除规则 ${index + 1}`}
                onClick={() => setDraft(current => ({
                  ...current,
                  rules: current.rules.filter((_item, itemIndex) => itemIndex !== index),
                }))}
              >删除</button>
            </div>
          ))}
        </div>
      </section>

      <section className="dnc-panel">
        <div className="dnc-panel-title">
          <h3>Webhook 渠道</h3>
          <p>URL 作为 secret 保存且不会回传到浏览器；留空表示保留已配置的地址。</p>
        </div>
        <div className="dnc-webhooks">
          {WEBHOOK_CHANNELS.map(name => {
            const configured = controller.webhookConfigured(name)
            const channel = draft.webhooks[name]
            return (
              <article className="dnc-webhook" key={name} data-configured={configured ? 'true' : 'false'}>
                <div className="dnc-webhook-head">
                  <div><h4>{CHANNEL_LABELS[name]}</h4><span>{configured ? '已配置' : '未配置'}</span></div>
                  {configured ? <button
                    className="dnc-icon-button"
                    type="button"
                    disabled={disabled}
                    onClick={() => { void removeWebhook(name) }}
                  >移除</button> : null}
                </div>
                <label className="dnc-field">
                  <span>Webhook URL</span>
                  <input
                    type="password"
                    value={webhookUrls[name] ?? ''}
                    disabled={disabled}
                    autoComplete="new-password"
                    placeholder={configured ? '已安全保存；输入新地址可替换' : 'https://…'}
                    onChange={(event) => {
                      const url = event.currentTarget.value
                      setWebhookUrls(current => ({ ...current, [name]: url }))
                    }}
                  />
                </label>
                <label className="dnc-check dnc-check--inline">
                  <input
                    type="checkbox"
                    checked={channel.includeSummary}
                    disabled={disabled}
                  onChange={(event) => {
                    const includeSummary = event.currentTarget.checked
                    setDraft(current => ({
                      ...current,
                      webhooks: {
                        ...current.webhooks,
                        [name]: { ...current.webhooks[name], includeSummary },
                      },
                    }))
                  }}
                  />
                  <span>发送任务摘要和失败原因</span>
                </label>
                <details>
                  <summary>事件范围（{channel.events.length}/{NOTIFICATION_KINDS.length}）</summary>
                  <div className="dnc-webhook-events">
                    {NOTIFICATION_KINDS.map(kind => (
                      <label className="dnc-check" key={kind}>
                        <input
                          type="checkbox"
                          checked={channel.events.includes(kind)}
                          disabled={disabled}
                          onChange={(event) => {
                            const checked = event.currentTarget.checked
                            setDraft(current => {
                            const events = checked
                              ? [...current.webhooks[name].events, kind]
                              : current.webhooks[name].events.filter(item => item !== kind)
                            return {
                              ...current,
                              webhooks: { ...current.webhooks, [name]: { ...current.webhooks[name], events } },
                            }
                            })
                          }}
                        />
                        <span>{EVENT_LABELS[kind]}</span>
                      </label>
                    ))}
                  </div>
                </details>
              </article>
            )
          })}
        </div>
      </section>

      <section className="dnc-panel">
        <div className="dnc-panel-title">
          <h3>投递策略</h3>
          <p>控制 Webhook 超时与重试，以及通知正文的最大长度。</p>
        </div>
        <div className="dnc-grid dnc-grid--four">
          <label className="dnc-field"><span>超时（毫秒）</span><input
            type="number" min="100" max="60000" step="100"
            value={draft.delivery.timeoutMs} disabled={disabled}
            onChange={(event) => {
              const timeoutMs = numberInRange(event.currentTarget.valueAsNumber, 5000, 100, 60000)
              setDraft(current => ({ ...current, delivery: { ...current.delivery, timeoutMs } }))
            }}
          /></label>
          <label className="dnc-field"><span>重试次数</span><input
            type="number" min="0" max="5" step="1"
            value={draft.delivery.retries} disabled={disabled}
            onChange={(event) => {
              const retries = numberInRange(event.currentTarget.valueAsNumber, 2, 0, 5)
              setDraft(current => ({ ...current, delivery: { ...current.delivery, retries } }))
            }}
          /></label>
          <label className="dnc-field"><span>重试基数（毫秒）</span><input
            type="number" min="50" max="30000" step="50"
            value={draft.delivery.retryBaseMs} disabled={disabled}
            onChange={(event) => {
              const retryBaseMs = numberInRange(event.currentTarget.valueAsNumber, 500, 50, 30000)
              setDraft(current => ({ ...current, delivery: { ...current.delivery, retryBaseMs } }))
            }}
          /></label>
          <label className="dnc-field"><span>正文上限（字符）</span><input
            type="number" min="40" max="4000" step="10"
            value={draft.delivery.maxBodyChars} disabled={disabled}
            onChange={(event) => {
              const maxBodyChars = numberInRange(event.currentTarget.valueAsNumber, 400, 40, 4000)
              setDraft(current => ({ ...current, delivery: { ...current.delivery, maxBodyChars } }))
            }}
          /></label>
        </div>
      </section>

      <footer className="dnc-actions">
        <span>{saving ? '正在安全保存…' : 'Webhook 密钥不会显示在页面或日志中。'}</span>
        <button className="dnc-button dnc-button--primary" type="submit" disabled={disabled}>保存设置</button>
      </footer>
    </form>
  )
}
