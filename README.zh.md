<p align="center">
  <img src="icon.svg" width="96" alt="dsh-skill-hub icon">
</p>

<h1 align="center">dsh-skill-hub · 技能中心</h1>

<p align="center">
  DeepSeek Harness（DSH）技能侧栏管理中心：浏览、搜索、导入（文件夹 / GitHub）并查看全部技能。<br>
  A sidebar hub to manage and discover agent skills in DeepSeek Harness (DSH).
</p>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="README.zh.md">中文</a>
  &nbsp;|&nbsp;
  <a href="https://github.com/amd47802574/dsh-skill-hub/issues">反馈 / Issues</a>
</p>

---

## 功能

**浏览与发现**

- **左侧栏入口**：星形图标打开完整管理页，一屏列出当前 DSH 注册的全部技能。
- **实时搜索**：按名称、描述、来源过滤。
- 徽标一目了然：「模型可调用」「指令可调用」「来源」。
- **详情渲染**：技能正文按 Markdown 渲染——标题、列表、代码块、引用、链接、删除线，明暗主题自动跟随。
- 界面语言跟随宿主（中 / 英）。

**导入**

- **从文件夹**：支持单个技能目录（含 `SKILL.md`），或技能集合根目录（一级子目录各含 `SKILL.md`，或一级 `*.md` 平铺技能）。
- **从 GitHub**：粘贴 `github.com/<owner>/<repo>` 或 `.../tree/<分支>/<子目录>`；自动下载仓库压缩包并解包提取（gzip + tar，兼容 pax / GNU 长名头）。
- 同名冲突会列出来，勾选「覆盖同名技能」才会覆盖。
- 导入即装进 `~/.dsh/skills`，立刻可见。

**删除**

- 用户技能目录（`user-dsh` 来源）里的技能可在详情区删除，带确认弹窗。
- 删除是**移入回收站**（`~/.dsh/skills/.trash/`），永不物理删除——误点不丢数据，且两个技能 provider 都会忽略回收站目录。
- 其他来源（内置、其他 agent 生态）只读，不显示删除按钮。
- **批量删除**：工具栏进入多选模式，可删技能带复选框（只读来源置灰），支持全选/取消，一次确认列出全部所选名字并统一移入回收站；逐项汇报结果，单个失败不影响其余。

**可信列表**

- 默认隐藏其他 agent 生态来源（`.agents/skills` 通用生态：Claude Code、Codex、WorkBuddy、CC Switch 等）与只读内置技能，并显示隐藏数量与来源名单。
- 内置对用户技能目录的**直接扫描兜底**：技能注册表漏报时以磁盘事实补齐，任何途径装进来的技能都能看到。
- 遵循 `@michengai/dsh-skills-manager`（技能管理器）的启用 / 禁用策略。
- **显式写入**：所有写操作都是显式的——技能只会经「导入」安装（同名覆盖需勾选确认），删除带确认且只移入回收站（`~/.dsh/skills/.trash/`）；只读来源的技能永不改动。

## 安装

**从插件市场**（推荐）

在 DeepSeek Harness 里打开「插件市场」，搜索 `dsh-skill-hub` 一键安装。

**用命令行从 GitHub 安装**

```sh
dsh plugin --profile desktop add github:amd47802574/dsh-skill-hub
```

把 `desktop` 换成你实际的 profile 名称。

**手动安装**

克隆本仓库，在你的 profile 的 `package.json` 里以 link 方式挂载：

```sh
git clone https://github.com/amd47802574/dsh-skill-hub.git
```

```jsonc
// <profile>/package.json
{
  "dependencies": {
    "dsh-skill-hub": "link:F:/path/to/dsh-skill-hub"
  },
  // 并把 "dsh-skill-hub" 加进 bundle 启用列表
}
```

然后重启 DSH。

## 使用

1. 点击左侧栏星形图标打开技能中心。
2. 搜索或滚动找到技能，点击查看完整定义与正文。
3. 点击「导入」从本地文件夹或 GitHub 链接安装技能。
4. 「刷新」会重新读取目录并清除发现缓存，新写入的技能文件立刻出现。

### 配置

在 profile 补丁的插件行 `config` 里可调整列表行为：

```yaml
- id: skill-hub
  name: dsh-skill-hub
  config:
    showAllSources: true          # 显示全部来源（含其他 agent 生态与内置技能）
    extraSources:                 # 或只加回指定来源
      - bundled
```

## 工作原理

- **宿主半区**：读取宿主 `skills` 服务与用户技能目录，经连接服务提供认证 JSON 路由（`/api/dsh-skill-hub.*`）。
- **浏览器半区**：纯 JS bundle，注册 `sidebar.panellist` 入口（id 即 `main` 面板 key）与管理面板，无构建步骤。
- **导入**：GitHub 地址解析为 codeload 压缩包（默认分支经 GitHub API 查询），tar 解析兼容 pax / GNU 长名头，带大小 / 条目数限制与路径穿越防护，技能落入 `~/.dsh/skills`。

## 兼容性

- DeepSeek Harness `dsh` **0.2.x**（在 0.2.2-rc 桌面线上验证）。
- 与 `@michengai/dsh-skills-manager` 并存，且遵循其策略。

## 开发

```sh
node --check index.js && node --check client.js   # 语法检查
node smoke-host.mjs                               # 宿主路由
node smoke-client.mjs                             # 客户端注册 + Markdown
node smoke-import.mjs                             # 导入引擎
node smoke-touch.mjs                              # 缓存失效 + 自愈
node smoke-disk.mjs                               # 磁盘兜底扫描
```

无构建步骤，浏览器半区是 `window.__ModuleLoader__` bundle。

## 许可

[MIT](LICENSE)
