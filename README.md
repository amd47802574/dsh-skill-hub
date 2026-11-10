<p align="center">
  <img src="icon.svg" width="96" alt="dsh-skill-hub icon">
</p>

<h1 align="center">dsh-skill-hub · 技能中心</h1>

<p align="center">
  A sidebar hub to manage and discover agent skills in DeepSeek Harness (DSH).<br>
  浏览、搜索、导入（文件夹 / GitHub）并查看 DSH 全部技能的侧栏管理中心。
</p>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="README.zh.md">中文</a>
  &nbsp;|&nbsp;
  <a href="https://github.com/amd47802574/dsh-skill-hub/issues">Issues</a>
</p>

---

## Features / 功能

**Browse & discover / 浏览与发现**

- A **sidebar icon** opens a full management page: every skill registered in this DSH, in one list. 左侧栏星形图标打开完整管理页，一屏列出当前 DSH 注册的全部技能。
- Live **search** across name, description, and source. 按名称、描述、来源实时搜索。
- Per-skill badges: `model-invocable` / `command-invocable` / source label. 每个技能带「模型可调用 / 指令可调用 / 来源」徽标。
- **Detail view** renders the full SKILL.md body as Markdown — headings, lists, code blocks, quotes, tables of links. 详情区将技能正文按 Markdown 渲染（标题、列表、代码块、引用等）。
- Light/dark theme support through the host's theme tokens; follows the UI language (zh/en). 明暗主题与中英文界面跟随宿主。

**Import / 导入**

- **From folder**: pick a single skill directory (containing `SKILL.md`) or a collection root (first-level subdirectories each with `SKILL.md`, or first-level `*.md` flat skills). 从文件夹导入：支持单技能目录或技能集合根目录。
- **From GitHub**: paste `github.com/<owner>/<repo>` or `.../tree/<branch>/<subdir>`; the repo archive is downloaded, extracted (gzip + tar, pax/GNU long-name safe), and its skills installed. 从 GitHub 链接导入，支持仓库与子目录，自动解包。
- Same-name conflicts are listed and only overwritten when you opt in. 同名冲突会列出来，勾选「覆盖同名」才会覆盖。
- Installed skills land in `~/.dsh/skills` and appear immediately. 导入即装进 DSH 用户技能目录，立刻可见。

**Honest list / 可信列表**

- Non-DSH skill sources (the generic `.agents/skills` ecologies: Claude Code, Codex, WorkBuddy, CC Switch, …) and read-only bundled skills are hidden by default, with a count of what was hidden. 默认隐藏其他 agent 生态来源与只读内置技能，并显示隐藏数量。
- A **direct disk scan** of `~/.dsh/skills` fills any gap the host's skill registry leaves open, so a skill installed through any route shows up. 内置对用户技能目录的直接扫描兜底，任何途径装进来的技能都能看到。
- Respects the skills-manager policy: sources you turned off and skills you disabled stay hidden. 遵循技能管理器的启用/禁用策略。
- Read-only: the hub never edits or deletes a skill. 只读浏览，不修改、不删除任何技能。

## Install / 安装

**From the plugin market / 从插件市场**（推荐）

Open **Plugins → Plugin Market** (or **插件市场**) in DeepSeek Harness, search for `dsh-skill-hub`, and install. 在 DSH 的插件市场里搜索 `dsh-skill-hub` 一键安装。

**From GitHub with `dsh` / 用命令行从 GitHub 安装**

```sh
dsh plugin --profile desktop add github:amd47802574/dsh-skill-hub
```

Replace `desktop` with your host's actual profile name. Replace `desktop` 为你实际的 profile 名称。

**Manual / 手动安装**

Clone this repo and add it as a bundle to your profile's `package.json`:

```sh
git clone https://github.com/amd47802574/dsh-skill-hub.git
```

```jsonc
// <profile>/package.json
{
  "dependencies": {
    "dsh-skill-hub": "link:F:/path/to/dsh-skill-hub"
  },
  // and add "dsh-skill-hub" to the bundle selection list
}
```

Then restart DSH. 然后重启 DSH。

## Usage / 使用

1. Click the **spark icon** in the left sidebar to open the hub. 点击左侧栏星形图标打开技能中心。
2. Search or scroll to find a skill; click one to read its full definition and body. 搜索或滚动找到技能，点击查看完整定义与正文。
3. Click **导入 (Import)** to install skills from a local folder or a GitHub URL. 点击「导入」从本地文件夹或 GitHub 安装技能。
4. **刷新 (Refresh)** re-reads the catalog and drops discovery caches, so newly written files show up at once. 「刷新」会重新读取目录并清除发现缓存，新写入的文件立刻出现。

### Configuration / 配置

Add fields to the plugin row's `config` in the profile patch to adjust the list:

```yaml
- id: skill-hub
  name: dsh-skill-hub
  config:
    showAllSources: true          # show every source, including other agent ecologies / 显示全部来源
    extraSources:                 # or opt specific sources back in / 或加回指定来源
      - bundled
```

## How it works / 工作原理

- **Host half**: reads the host `skills` service and the user skills root, and serves authenticated JSON routes through the connection service (`/api/dsh-skill-hub.*`). 宿主半区读取技能服务与用户技能目录，经连接服务提供认证 JSON 路由。
- **Client half**: a plain-JS bundle registering a `sidebar.panellist` entry (id = the `main` panel key) and the management page. No build step. 浏览器半区为纯 JS bundle，注册侧栏入口与管理面板，无构建步骤。
- Imports resolve GitHub URLs to codeload tarballs (default branch via the GitHub API), extract with size/entry limits and path-traversal guards, and drop skills into `~/.dsh/skills`. 导入将 GitHub 地址解析为 codeload 压缩包（默认分支经 GitHub API 查询），带大小/条目限制与路径穿越防护，技能落入 `~/.dsh/skills`。

## Compatibility / 兼容性

- DeepSeek Harness `dsh` **0.2.x** (tested on the 0.2.2-rc desktop line). 适用于 dsh 0.2.x。
- Works alongside `@michengai/dsh-skills-manager`: its enable/disable policy is honored. 与技能管理器插件并存，且遵循其策略。

## Development / 开发

```sh
node --check index.js && node --check client.js   # syntax / 语法检查
node smoke-host.mjs                               # host routes
node smoke-client.mjs                             # client registration + markdown
node smoke-import.mjs                             # import engine
node smoke-touch.mjs                              # cache invalidation + self-heal
node smoke-disk.mjs                               # disk fallback scan
```

No build step; the browser half is a `window.__ModuleLoader__` bundle. 无构建步骤，浏览器半区是模块加载器 bundle。

## License / 许可

[MIT](LICENSE)
