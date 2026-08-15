# Marketplace submission

`dsh-notify-center` 满足 awesome-dsh-plugin 的 bundle、真实代码、peer dependency 和预构建要求。代码推送后：

1. 给 `SingleOne/dsh-notify-center` 仓库添加 `dsh-plugin` topic。
2. 向 `awesome-dsh-plugin/awesome-dsh-plugin` 提交 PR。
3. 在 `README.md` 的 **Notifications & Integrations** 下添加：

```markdown
- [SingleOne/dsh-notify-center](https://github.com/SingleOne/dsh-notify-center) - Native desktop and webhook notifications for turn completions, failures, and approval requests, with outcome filters, content rules, privacy controls, and retrying delivery.
```

4. 在 `README.zh.md` 的 **通知与集成** 下添加：

```markdown
- [SingleOne/dsh-notify-center](https://github.com/SingleOne/dsh-notify-center) — 回合完成、失败和待审批时发送跨平台本机通知与 Webhook，支持结果过滤、内容规则、隐私控制和失败重试。
```

预期安装命令：

```sh
dsh plugin --profile web add github:SingleOne/dsh-notify-center
```

市场合并并刷新 `plugins.json` 后，当前桌面 App 会自动展示该插件，并使用已有的官方 DSH 安装、校验、重启和卸载流程，无需再修改 App 代码。
