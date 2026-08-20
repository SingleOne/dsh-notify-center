window.__ModuleLoader__.load({
	id: "dsh-notify-center",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/types.ts
		const NOTIFICATION_KINDS = [
			"completed",
			"error",
			"aborted",
			"blocked",
			"max-tokens",
			"interrupted",
			"approval"
		];
		const WEBHOOK_CHANNELS = [
			"feishu",
			"wecom",
			"dingtalk",
			"slack",
			"discord",
			"custom"
		];
		//#endregion
		//#region src/client/settings-store.ts
		const SETTINGS_API_PATH = "/api/dsh-notify-center/settings";
		const DEFAULT_EVENTS = {
			completed: true,
			error: true,
			aborted: false,
			blocked: true,
			"max-tokens": true,
			interrupted: true,
			approval: true
		};
		function objectOf(value) {
			return typeof value === "object" && value !== null && !Array.isArray(value) ? value : {};
		}
		function booleanOf(value, fallback) {
			return typeof value === "boolean" ? value : fallback;
		}
		function numberOf(value, fallback) {
			return typeof value === "number" && Number.isFinite(value) ? value : fallback;
		}
		function webhookValue(value) {
			const object = objectOf(value);
			const configuredEvents = Array.isArray(object.events) ? object.events.filter((kind) => typeof kind === "string" && NOTIFICATION_KINDS.includes(kind)) : [];
			return {
				events: configuredEvents.length ? configuredEvents : [...NOTIFICATION_KINDS],
				includeSummary: booleanOf(object.includeSummary, false)
			};
		}
		function normalizeSettingsValue(value) {
			const root = objectOf(value);
			const events = objectOf(root.events);
			const local = objectOf(root.local);
			const delivery = objectOf(root.delivery);
			const webhooks = objectOf(root.webhooks);
			const rules = Array.isArray(root.rules) ? root.rules.flatMap((item) => {
				const rule = objectOf(item);
				if (typeof rule.pattern !== "string") return [];
				return [{
					mode: rule.mode === "exclude" ? "exclude" : "include",
					pattern: rule.pattern,
					regex: booleanOf(rule.regex, false),
					caseSensitive: booleanOf(rule.caseSensitive, false)
				}];
			}) : [];
			return {
				locale: root.locale === "en" ? "en" : "zh",
				notifySubagents: booleanOf(root.notifySubagents, false),
				events: {
					completed: booleanOf(events.completed, DEFAULT_EVENTS.completed),
					error: booleanOf(events.error, DEFAULT_EVENTS.error),
					aborted: booleanOf(events.aborted, DEFAULT_EVENTS.aborted),
					blocked: booleanOf(events.blocked, DEFAULT_EVENTS.blocked),
					"max-tokens": booleanOf(events.maxTokens, DEFAULT_EVENTS["max-tokens"]),
					interrupted: booleanOf(events.interrupted, DEFAULT_EVENTS.interrupted),
					approval: booleanOf(events.approval, DEFAULT_EVENTS.approval)
				},
				local: {
					enabled: booleanOf(local.enabled, true),
					sound: booleanOf(local.sound, true)
				},
				rules,
				webhooks: Object.fromEntries(WEBHOOK_CHANNELS.map((name) => [name, webhookValue(webhooks[name])])),
				delivery: {
					timeoutMs: numberOf(delivery.timeoutMs, 5e3),
					retries: numberOf(delivery.retries, 2),
					retryBaseMs: numberOf(delivery.retryBaseMs, 500),
					maxBodyChars: numberOf(delivery.maxBodyChars, 400)
				}
			};
		}
		async function responseError(response) {
			try {
				const body = await response.json();
				if (typeof body.error?.message === "string") return new Error(body.error.message);
			} catch {}
			return /* @__PURE__ */ new Error(`settings request failed (${response.status})`);
		}
		function parseView(value) {
			const object = objectOf(value);
			if (!Number.isSafeInteger(object.revision) || Number(object.revision) < 0) throw new Error("settings response has an invalid revision");
			if (!Array.isArray(object.secrets)) throw new Error("settings response has invalid secret metadata");
			const secrets = object.secrets.flatMap((item) => {
				const secret = objectOf(item);
				if (!Array.isArray(secret.path) || secret.path.some((part) => typeof part !== "string")) return [];
				return [{
					path: secret.path,
					set: secret.set === true
				}];
			});
			return {
				revision: Number(object.revision),
				writable: object.writable === true,
				value: object.value,
				secrets
			};
		}
		var NotificationSettingsController = class {
			fetcher;
			state = {
				status: "idle",
				error: null,
				writable: false,
				view: null
			};
			listeners = /* @__PURE__ */ new Set();
			generation = 0;
			constructor(fetcher = globalThis.fetch.bind(globalThis)) {
				this.fetcher = fetcher;
			}
			getSnapshot = () => this.state;
			subscribe = (listener) => {
				this.listeners.add(listener);
				return () => this.listeners.delete(listener);
			};
			async load() {
				const generation = ++this.generation;
				this.publish({
					...this.state,
					status: "loading",
					error: null
				});
				try {
					const response = await this.fetcher(SETTINGS_API_PATH, {
						method: "GET",
						headers: { accept: "application/json" },
						credentials: "same-origin",
						cache: "no-store"
					});
					if (generation !== this.generation) return;
					if (response.status === 404) {
						this.publish({
							status: "unavailable",
							error: null,
							writable: false,
							view: null
						});
						return;
					}
					if (!response.ok) throw await responseError(response);
					const view = parseView(await response.json());
					this.publish({
						status: "ready",
						error: null,
						writable: view.writable,
						view
					});
				} catch (error) {
					if (generation !== this.generation) return;
					this.publish({
						...this.state,
						status: "error",
						error: error instanceof Error ? error.message : String(error)
					});
				}
			}
			async mutate(ops) {
				const view = this.state.view;
				if (!this.state.writable || !view || ops.length === 0) return false;
				const generation = ++this.generation;
				const previous = this.state;
				this.publish({
					...this.state,
					status: "saving",
					error: null
				});
				try {
					const response = await this.fetcher(SETTINGS_API_PATH, {
						method: "PATCH",
						headers: {
							accept: "application/json",
							"content-type": "application/json"
						},
						credentials: "same-origin",
						body: JSON.stringify({
							expectedRevision: view.revision,
							ops
						})
					});
					if (generation !== this.generation) return false;
					if (!response.ok) throw await responseError(response);
					const next = parseView(await response.json());
					this.publish({
						status: "ready",
						error: null,
						writable: next.writable,
						view: next
					});
					return true;
				} catch (error) {
					if (generation !== this.generation) return false;
					this.publish({
						...previous,
						status: "error",
						error: error instanceof Error ? error.message : String(error)
					});
					return false;
				}
			}
			webhookConfigured(name, view = this.state.view) {
				if (!view) return false;
				return view.secrets.some((secret) => secret.set && secret.path.join(".") === `webhooks.${name}.url`);
			}
			publish(state) {
				this.state = state;
				for (const listener of this.listeners) listener();
			}
		};
		//#endregion
		//#region src/client/SettingsSection.tsx
		const EVENT_LABELS = {
			completed: "任务完成",
			error: "运行出错",
			aborted: "任务中止",
			blocked: "任务阻塞",
			"max-tokens": "达到 Token 上限",
			interrupted: "任务中断",
			approval: "等待审批"
		};
		const CHANNEL_LABELS = {
			feishu: "飞书",
			wecom: "企业微信",
			dingtalk: "钉钉",
			slack: "Slack",
			discord: "Discord",
			custom: "自定义 Webhook"
		};
		const BANNER_TIMEOUT_MS = 5e3;
		function eventConfig(value) {
			return {
				completed: value.events.completed,
				error: value.events.error,
				aborted: value.events.aborted,
				blocked: value.events.blocked,
				maxTokens: value.events["max-tokens"],
				interrupted: value.events.interrupted,
				approval: value.events.approval
			};
		}
		function numberInRange(value, fallback, min, max) {
			if (!Number.isFinite(value)) return fallback;
			return Math.max(min, Math.min(max, Math.round(value)));
		}
		function SettingsSection({ controller }) {
			const state = (0, react.useSyncExternalStore)(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
			const resolved = (0, react.useMemo)(() => normalizeSettingsValue(state.view?.value), [state.view?.revision]);
			const [draft, setDraft] = (0, react.useState)(resolved);
			const [webhookUrls, setWebhookUrls] = (0, react.useState)({});
			const [saved, setSaved] = (0, react.useState)(false);
			const [errorDismissed, setErrorDismissed] = (0, react.useState)(false);
			(0, react.useEffect)(() => {
				controller.load();
			}, [controller]);
			(0, react.useEffect)(() => {
				setDraft(resolved);
				setWebhookUrls({});
			}, [resolved]);
			(0, react.useEffect)(() => {
				if (state.status === "error") setErrorDismissed(false);
			}, [state.status, state.error]);
			(0, react.useEffect)(() => {
				if (!saved) return;
				const timeout = window.setTimeout(() => setSaved(false), BANNER_TIMEOUT_MS);
				return () => window.clearTimeout(timeout);
			}, [saved]);
			(0, react.useEffect)(() => {
				if (!state.error || errorDismissed) return;
				const timeout = window.setTimeout(() => setErrorDismissed(true), BANNER_TIMEOUT_MS);
				return () => window.clearTimeout(timeout);
			}, [state.error, errorDismissed]);
			if (state.status === "idle" || state.status === "loading" && state.view === null) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: "dnc-status",
				children: "正在读取通知设置…"
			});
			if (state.status === "unavailable") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: "dnc-status dnc-status--error",
				children: "通知插件的配置接口不可用；本机通知和 Webhook 投递仍会继续工作。"
			});
			const saving = state.status === "saving";
			const disabled = saving || !state.writable;
			const submit = async (event) => {
				event.preventDefault();
				setSaved(false);
				const ops = [
					{
						op: "set",
						path: ["locale"],
						value: draft.locale
					},
					{
						op: "set",
						path: ["notifySubagents"],
						value: draft.notifySubagents
					},
					{
						op: "set",
						path: ["events"],
						value: eventConfig(draft)
					},
					{
						op: "set",
						path: ["local"],
						value: draft.local
					},
					{
						op: "set",
						path: ["rules"],
						value: draft.rules.filter((rule) => rule.pattern.trim())
					},
					{
						op: "set",
						path: ["delivery"],
						value: draft.delivery
					}
				];
				for (const name of WEBHOOK_CHANNELS) {
					const url = webhookUrls[name]?.trim();
					if (!controller.webhookConfigured(name) && !url) continue;
					ops.push({
						op: "set",
						path: [
							"webhooks",
							name,
							"events"
						],
						value: draft.webhooks[name].events
					}, {
						op: "set",
						path: [
							"webhooks",
							name,
							"includeSummary"
						],
						value: draft.webhooks[name].includeSummary
					});
					if (url) ops.push({
						op: "set",
						path: [
							"webhooks",
							name,
							"url"
						],
						value: url
					});
				}
				const ok = await controller.mutate(ops);
				setSaved(ok);
			};
			const removeWebhook = async (name) => {
				setSaved(false);
				if (await controller.mutate([{
					op: "unset",
					path: ["webhooks", name]
				}])) setWebhookUrls((current) => ({
					...current,
					[name]: ""
				}));
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("form", {
				className: "dnc-page",
				onSubmit: (event) => {
					submit(event);
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
						className: "dnc-heading",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", { children: "通知中心" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: "统一管理本机通知、Webhook、触发条件和隐私选项。设置由插件持久化并实时生效。" })] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "dnc-version",
							children: "v0.2"
						})]
					}),
					!state.writable ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "dnc-banner",
						children: "当前插件设置存储为只读，所有控件已禁用。"
					}) : null,
					state.error && !errorDismissed ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dnc-banner dnc-banner--error",
						role: "alert",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: ["保存失败：", state.error] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							className: "dnc-banner-close",
							type: "button",
							"aria-label": "关闭保存失败提示",
							onClick: () => setErrorDismissed(true),
							children: "×"
						})]
					}) : null,
					saved ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dnc-banner dnc-banner--success",
						role: "status",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "设置已保存并实时应用。" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							className: "dnc-banner-close",
							type: "button",
							"aria-label": "关闭保存成功提示",
							onClick: () => setSaved(false),
							children: "×"
						})]
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: "dnc-panel",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dnc-panel-title",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: "常规" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: "选择语言、通知范围和本机系统通知行为。" })]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dnc-general-grid",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									className: "dnc-general-language",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: "通知语言" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: "设置通知内容使用的语言" })] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
										value: draft.locale,
										disabled,
										onChange: (event) => {
											const locale = event.currentTarget.value === "en" ? "en" : "zh";
											setDraft((current) => ({
												...current,
												locale
											}));
										},
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: "zh",
											children: "简体中文"
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: "en",
											children: "English"
										})]
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									className: "dnc-switch",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										type: "checkbox",
										checked: draft.local.enabled,
										disabled,
										onChange: (event) => {
											const enabled = event.currentTarget.checked;
											setDraft((current) => ({
												...current,
												local: {
													...current.local,
													enabled
												}
											}));
										}
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: "本机系统通知" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: "桌面 App 不可用时自动使用系统原生实现" })] })]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									className: "dnc-switch",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										type: "checkbox",
										checked: draft.local.sound,
										disabled: disabled || !draft.local.enabled,
										onChange: (event) => {
											const sound = event.currentTarget.checked;
											setDraft((current) => ({
												...current,
												local: {
													...current.local,
													sound
												}
											}));
										}
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: "通知声音" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: "是否请求系统播放提示音" })] })]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									className: "dnc-switch",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										type: "checkbox",
										checked: draft.notifySubagents,
										disabled,
										onChange: (event) => {
											const notifySubagents = event.currentTarget.checked;
											setDraft((current) => ({
												...current,
												notifySubagents
											}));
										}
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: "包含子代理" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: "默认仅通知根任务，开启后包含子代理任务" })] })]
								})
							]
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: "dnc-panel",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dnc-panel-title",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: "触发事件" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: "所选事件同时作用于本机通知；每个 Webhook 还可以进一步收窄范围。" })]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "dnc-check-grid",
							children: NOTIFICATION_KINDS.map((kind) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: "dnc-check",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									type: "checkbox",
									checked: draft.events[kind],
									disabled,
									onChange: (event) => {
										const enabled = event.currentTarget.checked;
										setDraft((current) => ({
											...current,
											events: {
												...current.events,
												[kind]: enabled
											}
										}));
									}
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: EVENT_LABELS[kind] })]
							}, kind))
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: "dnc-panel",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "dnc-panel-title dnc-panel-title--row",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: "内容规则" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: "按会话标题、摘要和工具名包含或排除通知。" })] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									className: "dnc-button dnc-button--secondary",
									type: "button",
									disabled,
									onClick: () => setDraft((current) => ({
										...current,
										rules: [...current.rules, {
											mode: "include",
											pattern: "",
											regex: false,
											caseSensitive: false
										}]
									})),
									children: "添加规则"
								})]
							}),
							draft.rules.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "dnc-empty",
								children: "没有内容规则，所有匹配已启用事件的任务都会通知。"
							}) : null,
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "dnc-rules",
								children: draft.rules.map((rule, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "dnc-rule",
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
											value: rule.mode ?? "include",
											disabled,
											"aria-label": `规则 ${index + 1} 模式`,
											onChange: (event) => {
												const mode = event.currentTarget.value === "exclude" ? "exclude" : "include";
												setDraft((current) => ({
													...current,
													rules: current.rules.map((item, itemIndex) => itemIndex === index ? {
														...item,
														mode
													} : item)
												}));
											},
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
												value: "include",
												children: "包含"
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
												value: "exclude",
												children: "排除"
											})]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											value: rule.pattern,
											disabled,
											placeholder: "关键词或正则表达式",
											"aria-label": `规则 ${index + 1} 内容`,
											onChange: (event) => {
												const pattern = event.currentTarget.value;
												setDraft((current) => ({
													...current,
													rules: current.rules.map((item, itemIndex) => itemIndex === index ? {
														...item,
														pattern
													} : item)
												}));
											}
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											type: "checkbox",
											checked: rule.regex ?? false,
											disabled,
											onChange: (event) => {
												const regex = event.currentTarget.checked;
												setDraft((current) => ({
													...current,
													rules: current.rules.map((item, itemIndex) => itemIndex === index ? {
														...item,
														regex
													} : item)
												}));
											}
										}), "正则"] }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											type: "checkbox",
											checked: rule.caseSensitive ?? false,
											disabled,
											onChange: (event) => {
												const caseSensitive = event.currentTarget.checked;
												setDraft((current) => ({
													...current,
													rules: current.rules.map((item, itemIndex) => itemIndex === index ? {
														...item,
														caseSensitive
													} : item)
												}));
											}
										}), "区分大小写"] }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											className: "dnc-icon-button",
											type: "button",
											disabled,
											"aria-label": `删除规则 ${index + 1}`,
											onClick: () => setDraft((current) => ({
												...current,
												rules: current.rules.filter((_item, itemIndex) => itemIndex !== index)
											})),
											children: "删除"
										})
									]
								}, index))
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: "dnc-panel",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dnc-panel-title",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: "Webhook 渠道" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: "URL 作为 secret 保存且不会回传到浏览器；留空表示保留已配置的地址。" })]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "dnc-webhooks",
							children: WEBHOOK_CHANNELS.map((name) => {
								const configured = controller.webhookConfigured(name);
								const channel = draft.webhooks[name];
								return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("article", {
									className: "dnc-webhook",
									"data-configured": configured ? "true" : "false",
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: "dnc-webhook-head",
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", { children: CHANNEL_LABELS[name] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: configured ? "已配置" : "未配置" })] }), configured ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												className: "dnc-icon-button",
												type: "button",
												disabled,
												onClick: () => {
													removeWebhook(name);
												},
												children: "移除"
											}) : null]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
											className: "dnc-field",
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "Webhook URL" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
												type: "password",
												value: webhookUrls[name] ?? "",
												disabled,
												autoComplete: "new-password",
												placeholder: configured ? "已安全保存；输入新地址可替换" : "https://…",
												onChange: (event) => {
													const url = event.currentTarget.value;
													setWebhookUrls((current) => ({
														...current,
														[name]: url
													}));
												}
											})]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
											className: "dnc-check dnc-check--inline",
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
												type: "checkbox",
												checked: channel.includeSummary,
												disabled,
												onChange: (event) => {
													const includeSummary = event.currentTarget.checked;
													setDraft((current) => ({
														...current,
														webhooks: {
															...current.webhooks,
															[name]: {
																...current.webhooks[name],
																includeSummary
															}
														}
													}));
												}
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "发送任务摘要和失败原因" })]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("summary", { children: [
											"事件范围（",
											channel.events.length,
											"/",
											NOTIFICATION_KINDS.length,
											"）"
										] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											className: "dnc-webhook-events",
											children: NOTIFICATION_KINDS.map((kind) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
												className: "dnc-check",
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
													type: "checkbox",
													checked: channel.events.includes(kind),
													disabled,
													onChange: (event) => {
														const checked = event.currentTarget.checked;
														setDraft((current) => {
															const events = checked ? [...current.webhooks[name].events, kind] : current.webhooks[name].events.filter((item) => item !== kind);
															return {
																...current,
																webhooks: {
																	...current.webhooks,
																	[name]: {
																		...current.webhooks[name],
																		events
																	}
																}
															};
														});
													}
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: EVENT_LABELS[kind] })]
											}, kind))
										})] })
									]
								}, name);
							})
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: "dnc-panel",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dnc-panel-title",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: "投递策略" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: "控制 Webhook 超时与重试，以及通知正文的最大长度。" })]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dnc-grid dnc-grid--four",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									className: "dnc-field",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "超时（毫秒）" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										type: "number",
										min: "100",
										max: "60000",
										step: "100",
										value: draft.delivery.timeoutMs,
										disabled,
										onChange: (event) => {
											const timeoutMs = numberInRange(event.currentTarget.valueAsNumber, 5e3, 100, 6e4);
											setDraft((current) => ({
												...current,
												delivery: {
													...current.delivery,
													timeoutMs
												}
											}));
										}
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									className: "dnc-field",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "重试次数" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										type: "number",
										min: "0",
										max: "5",
										step: "1",
										value: draft.delivery.retries,
										disabled,
										onChange: (event) => {
											const retries = numberInRange(event.currentTarget.valueAsNumber, 2, 0, 5);
											setDraft((current) => ({
												...current,
												delivery: {
													...current.delivery,
													retries
												}
											}));
										}
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									className: "dnc-field",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "重试基数（毫秒）" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										type: "number",
										min: "50",
										max: "30000",
										step: "50",
										value: draft.delivery.retryBaseMs,
										disabled,
										onChange: (event) => {
											const retryBaseMs = numberInRange(event.currentTarget.valueAsNumber, 500, 50, 3e4);
											setDraft((current) => ({
												...current,
												delivery: {
													...current.delivery,
													retryBaseMs
												}
											}));
										}
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									className: "dnc-field",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "正文上限（字符）" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										type: "number",
										min: "40",
										max: "4000",
										step: "10",
										value: draft.delivery.maxBodyChars,
										disabled,
										onChange: (event) => {
											const maxBodyChars = numberInRange(event.currentTarget.valueAsNumber, 400, 40, 4e3);
											setDraft((current) => ({
												...current,
												delivery: {
													...current.delivery,
													maxBodyChars
												}
											}));
										}
									})]
								})
							]
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("footer", {
						className: "dnc-actions",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: saving ? "正在安全保存…" : "Webhook 密钥不会显示在页面或日志中。" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							className: "dnc-button dnc-button--primary",
							type: "submit",
							disabled,
							children: "保存设置"
						})]
					})
				]
			});
		}
		//#endregion
		//#region src/client/activation.ts
		const DESKTOP_SESSION_ACTIVATION_EVENT = "dsh-notify-center:activate-session";
		function isRecord(value) {
			return typeof value === "object" && value !== null && !Array.isArray(value);
		}
		function parseSessionActivationDetail(value) {
			if (!isRecord(value)) return null;
			if (Object.keys(value).some((key) => key !== "version" && key !== "sessionId" && key !== "turn")) return null;
			if (value.version !== 1) return null;
			if (typeof value.sessionId !== "string" || value.sessionId.length === 0 || value.sessionId.length > 512 || value.sessionId.trim() !== value.sessionId) return null;
			if (value.turn !== void 0 && (!Number.isSafeInteger(value.turn) || value.turn < 0)) return null;
			return {
				version: 1,
				sessionId: value.sessionId,
				...value.turn === void 0 ? {} : { turn: value.turn }
			};
		}
		function registerDesktopSessionActivation(target, sessions, logger = console) {
			const listener = (event) => {
				const detail = parseSessionActivationDetail(event.detail);
				if (!detail) {
					logger.warn("[dsh-notify-center] ignored invalid desktop session activation");
					return;
				}
				try {
					if (!Object.prototype.hasOwnProperty.call(sessions.list.getSnapshot().byId, detail.sessionId) && !sessions.subagentAddress(detail.sessionId)) {
						logger.warn("[dsh-notify-center] ignored desktop activation for an unknown session");
						return;
					}
					sessions.open(detail.sessionId);
				} catch {
					logger.warn("[dsh-notify-center] desktop session activation failed");
				}
			};
			target.addEventListener(DESKTOP_SESSION_ACTIVATION_EVENT, listener);
			return () => target.removeEventListener(DESKTOP_SESSION_ACTIVATION_EVENT, listener);
		}
		//#endregion
		//#region src/client/styles.ts
		const styles = String.raw`
.dnc-page{display:flex;flex-direction:column;gap:16px;width:100%;max-width:920px;padding:0 0 28px;color:var(--dsw-alias-label-primary);font-family:var(--ds-font-family-sans,system-ui,sans-serif)}
.dnc-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:20px}.dnc-heading h2,.dnc-panel h3,.dnc-webhook h4{margin:0}.dnc-heading h2{font-size:22px;line-height:30px}.dnc-heading p,.dnc-panel-title p{margin:5px 0 0;color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:20px}.dnc-version{flex:none;border:1px solid var(--dsw-alias-border-l2);border-radius:999px;padding:3px 9px;color:var(--dsw-alias-label-secondary);font-size:11px}
.dnc-panel{border:1px solid var(--dsw-alias-border-l2);border-radius:12px;padding:18px;background:var(--dsw-alias-bg-layer-3)}.dnc-panel-title{margin-bottom:16px}.dnc-panel-title--row{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.dnc-panel-title h3{font-size:15px;line-height:22px}.dnc-grid{display:grid;gap:14px}.dnc-grid--four{grid-template-columns:repeat(4,minmax(0,1fr))}
.dnc-field{display:flex;flex-direction:column;gap:7px;color:var(--dsw-alias-label-secondary);font-size:12px}.dnc-field input,.dnc-field select,.dnc-rule input,.dnc-rule select{box-sizing:border-box;width:100%;min-height:36px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:7px 10px;outline:none;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit}.dnc-field input:focus,.dnc-field select:focus,.dnc-rule input:focus,.dnc-rule select:focus{border-color:var(--dsw-alias-state-business-primary);box-shadow:0 0 0 2px color-mix(in srgb,var(--dsw-alias-state-business-primary) 18%,transparent)}
.dnc-general-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.dnc-general-language,.dnc-switch{box-sizing:border-box;min-height:72px;border:1px solid var(--dsw-alias-border-l2);border-radius:9px;padding:10px 12px;background:var(--dsw-alias-bg-layer-1)}.dnc-general-language{display:grid;grid-template-columns:minmax(0,1fr) minmax(120px,140px);align-items:center;gap:12px}.dnc-general-language>span,.dnc-switch span{display:flex;flex-direction:column;gap:2px}.dnc-general-language strong,.dnc-switch strong{font-size:13px;line-height:18px}.dnc-general-language small,.dnc-switch small{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:17px}.dnc-general-language select{box-sizing:border-box;width:100%;min-height:36px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:7px 10px;outline:none;background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px}.dnc-general-language select:focus{border-color:var(--dsw-alias-state-business-primary);box-shadow:0 0 0 2px color-mix(in srgb,var(--dsw-alias-state-business-primary) 18%,transparent)}.dnc-switch{display:flex;align-items:flex-start;gap:10px}.dnc-switch input,.dnc-check input{margin:3px 0 0;accent-color:var(--dsw-alias-state-business-primary)}
.dnc-check-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.dnc-check{display:flex;align-items:flex-start;gap:8px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}.dnc-check--inline{margin-top:12px}.dnc-rules{display:flex;flex-direction:column;gap:8px}.dnc-rule{display:grid;grid-template-columns:90px minmax(140px,1fr) auto auto auto;align-items:center;gap:8px}.dnc-rule label{display:flex;align-items:center;gap:5px;white-space:nowrap;color:var(--dsw-alias-label-secondary);font-size:11px}.dnc-rule label input{width:auto;min-height:auto}.dnc-empty,.dnc-status{margin:0;color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:20px}.dnc-status--error{color:var(--dsw-alias-state-error-primary)}
.dnc-webhooks{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.dnc-webhook{border:1px solid var(--dsw-alias-border-l2);border-radius:10px;padding:14px;background:var(--dsw-alias-bg-layer-1)}.dnc-webhook[data-configured=true]{border-color:color-mix(in srgb,var(--dsw-alias-state-success-primary) 35%,var(--dsw-alias-border-l2))}.dnc-webhook-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:12px}.dnc-webhook-head>div{display:flex;align-items:center;gap:8px}.dnc-webhook h4{font-size:13px;line-height:20px}.dnc-webhook-head span{border-radius:5px;padding:1px 6px;background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-tertiary);font-size:10px}.dnc-webhook[data-configured=true] .dnc-webhook-head span{background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 10%,transparent);color:var(--dsw-alias-state-success-primary)}.dnc-webhook details{margin-top:11px;border-top:1px solid var(--dsw-alias-border-l2);padding-top:9px}.dnc-webhook summary{cursor:pointer;color:var(--dsw-alias-label-secondary);font-size:11px}.dnc-webhook-events{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin-top:10px}
.dnc-button,.dnc-icon-button{border:0;border-radius:8px;padding:8px 13px;font:inherit;font-size:12px;cursor:pointer}.dnc-button:disabled,.dnc-icon-button:disabled{cursor:not-allowed;opacity:.45}.dnc-button--primary{background:var(--dsw-alias-state-business-primary);color:#fff;font-weight:600}.dnc-button--secondary{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary)}.dnc-icon-button{padding:4px 7px;background:transparent;color:var(--dsw-alias-state-error-primary);font-size:11px}.dnc-actions{position:sticky;bottom:0;display:flex;align-items:center;justify-content:space-between;gap:14px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;padding:10px 12px;background:color-mix(in srgb,var(--dsw-alias-bg-layer-1) 94%,transparent);box-shadow:var(--dsw-shadow-lv1);backdrop-filter:blur(10px)}.dnc-actions span{color:var(--dsw-alias-label-tertiary);font-size:11px}.dnc-banner{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:9px 12px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font-size:12px}.dnc-banner-close{flex:none;width:22px;height:22px;border:0;border-radius:6px;padding:0;background:transparent;color:currentColor;font:inherit;font-size:18px;line-height:22px;cursor:pointer;opacity:.7}.dnc-banner-close:hover{background:color-mix(in srgb,currentColor 10%,transparent);opacity:1}.dnc-banner-close:focus-visible{outline:2px solid currentColor;outline-offset:1px}.dnc-banner--error{border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 35%,transparent);color:var(--dsw-alias-state-error-primary)}.dnc-banner--success{border-color:color-mix(in srgb,var(--dsw-alias-state-success-primary) 35%,transparent);color:var(--dsw-alias-state-success-primary)}
@media(max-width:760px){.dnc-general-grid,.dnc-webhooks{grid-template-columns:1fr}.dnc-grid--four,.dnc-check-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.dnc-rule{grid-template-columns:90px minmax(0,1fr)}.dnc-rule label,.dnc-rule button{justify-self:start}}
@media(max-width:480px){.dnc-general-language{grid-template-columns:1fr}.dnc-general-language select{margin-top:4px}}
`;
		//#endregion
		//#region src/client/index.tsx
		const inject = ["slots", "sessions"];
		function apply(ctx) {
			const style = document.createElement("style");
			style.dataset.plugin = "dsh-notify-center";
			style.dataset.pluginCss = "dsh-notify-center/settings";
			style.textContent = styles;
			document.head.appendChild(style);
			ctx.effect(() => () => style.remove(), "dsh-notify-center: settings styles");
			ctx.effect(() => registerDesktopSessionActivation(window, ctx.sessions), "dsh-notify-center: desktop session activation");
			const controller = new NotificationSettingsController();
			const injected = () => ({ controller });
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "dsh-notify-center",
				order: 35,
				label: "通知中心",
				inject: injected
			}, SettingsSection));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map