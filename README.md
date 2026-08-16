# dsh-notify-center

DeepSeek Harness 的统一通知插件。顶层 Agent 完成一轮任务或等待审批时，同时支持操作系统本机通知和远程 Webhook，不修改模型提示词、工具或会话日志。

## 功能

- 以 `session/event → turn/end` 保存准确的结束原因，在顶层 Agent 进入 `idle` 后派发完成通知。
- 监听持久的 `approval/asked` 审计事件，提醒用户处理审批，不接管审批 waterfall。
- 默认过滤子 Agent；同一 Agent 连续完成多轮时按顺序逐轮通知。
- Windows 原生 Toast（失败时降级 NotifyIcon 气泡）、macOS `osascript`、Linux `notify-send`。
- 飞书、企业微信、钉钉、Slack、Discord 和自定义 JSON Webhook。
- 按完成结果开关、关键词/正则包含与排除规则、正文长度上限。
- 每个 Webhook 可独立选择事件和摘要权限；默认不向远程通道发送回复摘要。
- Webhook 超时和指数退避重试；投递不阻塞 Agent，日志不会输出 Webhook URL。
- 每条本机通知使用 `session + turn/event` 唯一标识，避免 Windows 因复用 tag 静默吞掉后续通知。
- DSH Web UI 内置可视化设置页，Webhook URL 以 secret 字段持久化且不会回传浏览器。
- 可选的认证回环桥接优先交给桌面 App 展示通知；桥接缺失或失败时自动回退系统原生通知。

## 当前阶段

第二阶段包含 Host 通知服务和随包发布的浏览器设置页。插件仍可独立运行：没有桌面 App 时直接使用 Windows、macOS 或 Linux 的系统通知；桌面 App 只提供更可靠的 Electron 通知和点击会话定位。

## 本地开发安装

在插件仓库根目录构建：

```powershell
npm install
npm run check
```

安装到 DSH web profile：

```powershell
dsh plugin --profile web add .
```

也可以直接从 GitHub 安装：

```powershell
dsh plugin --profile web add github:SingleOne/dsh-notify-center
```

仓库提交预构建的 `dist`，GitHub 安装不需要放开 pnpm 的依赖构建权限；npm 发布时由 `prepack` 重新构建。

安装后重启 `dsh web`。在 DSH 左侧设置入口中选择“通知中心”即可修改设置，保存后实时生效。

## 配置

推荐通过 DSH Web UI 的“通知中心”页面配置。也可以在 `~/.dsh/profiles/web/cordis.patch.yml` 中为插件行添加 `config` 作为组合基础值；可视化页面保存的用户层设置会覆盖基础值：

```yaml
- id: dsh-notify-center
  config:
    locale: zh
    notifySubagents: false

    events:
      completed: true
      error: true
      aborted: false
      blocked: true
      maxTokens: true
      interrupted: true
      approval: true

    local:
      enabled: true
      sound: true

    rules:
      - mode: exclude
        pattern: 测试
        regex: false
        caseSensitive: false
      - mode: include
        pattern: '部署|发布'
        regex: true
        caseSensitive: false

    webhooks:
      feishu:
        url: 'https://open.feishu.cn/open-apis/bot/v2/hook/REPLACE_ME'
        events: [completed, error, approval]
        includeSummary: false
      custom:
        url: 'https://example.com/dsh-hook'
        events: [completed, error]
        includeSummary: true

    delivery:
      timeoutMs: 5000
      retries: 2
      retryBaseMs: 500
      maxBodyChars: 400
```

Webhook 也可简写为 URL，此时启用所有事件并默认隐藏摘要：

```yaml
webhooks:
  slack: 'https://hooks.slack.com/services/REPLACE_ME'
```

旧版 URL 简写在载入配置基础层时会自动归一化为对象形式，后续从设置页修改事件范围不会丢失基础层 URL。

页面保存的用户层位于 `$DSH_HOME/dsh-notify-center/settings.json`；未设置 `DSH_HOME` 时使用 `~/.dsh/dsh-notify-center/settings.json`。插件使用 revision 防止多个页面互相覆盖，并通过同目录临时文件原子替换。该文件由插件维护，不建议手工编辑。

### 桌面桥接

桌面 App 启动 DSH 子进程时可注入以下临时环境变量：

- `DSH_NOTIFY_BRIDGE_URL`：仅接受 `http://127.0.0.1:<随机端口>/...`。
- `DSH_NOTIFY_BRIDGE_TOKEN`：每次 App 启动生成的高强度临时令牌。

插件以 Bearer Token 向桥接发送已经本地化的通知标题、正文和会话定位信息。URL 与令牌不会写入插件日志；任一变量缺失、端点不是回环地址、认证失败或请求超时都会禁用桥接或回退到系统原生通知。Webhook 通知始终由插件直接投递，不经过桌面 App。

用户点击桌面 App 展示的通知后，App 会在 DSH Web 页面派发版本化的 `dsh-notify-center:activate-session` 事件。插件客户端严格校验 `{ version: 1, sessionId, turn? }`，确认目标是已列出或已寻址的会话后，通过 DSH Client Runtime 的 `sessions.open()` 完成定位。桌面 App 不读取或操作 DSH 会话列表 DOM。

### 规则语义

- 任意排除规则命中时不通知。
- 存在包含规则时，必须至少命中一条才通知。
- 匹配内容为会话标题、本轮回复摘要、结束原因和工具名称。
- 正则表达式在插件加载时验证；无效正则会阻止插件带着错误配置启动。

### 自定义 Webhook

自定义通道接收 JSON：

```json
{
  "text": "【DSH 任务完成】会话标题\n耗时：2 秒\n会话：session-1",
  "kind": "completed",
  "title": "会话标题",
  "sessionId": "session-1",
  "turn": 2,
  "durationMs": 2000,
  "time": "2026-08-16T00:00:00.000Z"
}
```

## 隐私与权限

- Webhook URL 只存在当前用户的 Host 设置文件或 profile 基础配置中；插件配置 API 仅接受回环同源请求，并从所有响应中剥离 URL，不写入会话日志，也不会进入模型上下文。
- 远程通道默认 `includeSummary: false`；启用后会发送该轮回复的有界摘要。
- 插件仅向显式配置的 HTTP(S) 地址发请求。
- Windows 首次通知会创建开始菜单快捷方式 `dsh-notify-center.lnk` 并在当前用户的 `HKCU\\Software\\Classes\\AppUserModelId` 下注册 `DeepSeekHarness.NotifyCenter`。这是未打包 Win32 进程可靠显示 Toast 所需的 AUMID 注册，不写入系统级注册表；移除快捷方式和该 HKCU 项即可撤销。
- 无提示词、Token、工具调用或模型行为开销。

## 验证

```powershell
npm run typecheck
npm test
npm run build
```

测试覆盖配置与安全默认值、设置原子持久化、revision 冲突与 HTTP 同源限制、桌面桥接认证和脱敏、完成/审批事件折叠、去重、规则、各平台命令构造、Webhook 载荷脱敏、失败重试和普通 4xx 不重试。

## 已知限制

- 独立系统通知的点击行为由操作系统负责，只有桌面桥接通知支持唤醒 App 并定位会话。
- Linux 系统必须提供 `notify-send`。
- 可视化设置页仅随 DSH Web UI 加载；headless 使用方式仍通过 profile 配置。缺少 WebServer 时只会停用页面和配置 API，不影响本机通知与 Webhook 投递。
- 投递队列仅保存在内存中；DSH 进程退出时不会持久化未完成重试。

## License

MIT
