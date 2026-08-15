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

## 当前阶段

第一阶段是纯 Host bundle：配置来自 DSH profile，安装后不依赖浏览器页面或 Notification 权限。设置页面、前台会话免打扰以及点击通知跳转桌面会话属于后续阶段。

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

安装或修改配置后重启 `dsh web`。

## 配置

在 `~/.dsh/profiles/web/cordis.patch.yml` 中为插件行添加 `config`：

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

- Webhook URL 只存在 Host 配置中，不写入会话日志，也不会进入模型上下文。
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

测试覆盖配置与安全默认值、完成/审批事件折叠、去重、规则、各平台命令构造、Webhook 载荷脱敏、失败重试和普通 4xx 不重试。

## 已知限制

- Windows Toast 点击尚不能激活当前 Electron 会话；需要桌面 App 后续提供自定义协议。
- Linux 系统必须提供 `notify-send`。
- 第一阶段无浏览器设置页面，Webhook 密钥需在 Host profile 中配置。
- 投递队列仅保存在内存中；DSH 进程退出时不会持久化未完成重试。

## License

MIT
