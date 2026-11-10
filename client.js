// dsh-skill-hub - browser half.
//
// A left-sidebar hub for managing and discovering agent skills: a panel icon
// in `sidebar.panellist` (id === the `main` panel key, the dsh-context shape)
// opens a management page that lists every registered skill with its source
// and invocation policy, supports search, and shows the full body of the
// selected skill. Data comes from the host half's authenticated routes via a
// same-origin fetch. Everything is required by name; no build step.
window.__ModuleLoader__.load({
  id: 'dsh-skill-hub',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const react = require('react')
    const { createElement: h, useState, useEffect, useCallback, useMemo } = react

    const NS = 'dsh-skill-hub'
    const PANEL_ID = 'dsh-skill-hub'
    const API = '/api/dsh-skill-hub'

    // --- copy -----------------------------------------------------------------

    const zh = {
      'panel.label': '技能中心',
      'page.title': '技能中心',
      'page.subtitle': '浏览、搜索并查看当前 DSH 注册的全部技能（skill）。',
      'page.github': '打开作者的 GitHub',
      'search.placeholder': '搜索技能名称、描述或来源…',
      'list.count': '{n} 个技能',
      'list.empty': '没有匹配的技能。换个关键词试试。',
      'list.none': '当前没有已注册的技能。',
      'list.filtered': '已隐藏 {n} 个非 DSH 来源的技能（{sources}）。',
      'badge.model': '模型可调用',
      'badge.user': '指令可调用',
      'badge.readonly': '只读浏览',
      'field.source': '来源',
      'field.provider': '提供者',
      'field.path': '路径',
      'field.whenToUse': '适用时机',
      'field.resources': '资源基址',
      'field.invocation': '调用策略',
      'detail.title': '技能详情',
      'detail.select': '从左侧选择一个技能查看完整定义与正文。',
      'detail.loading': '正在加载技能正文…',
      'action.refresh': '刷新',
      'action.refreshing': '刷新中…',
      'action.close': '收起详情',
      'action.import': '导入',
      'action.delete': '删除',
      'delete.title': '删除技能',
      'delete.body': '把技能「{name}」从用户技能目录移入回收站（~/.dsh/skills/.trash）？该技能将立即从列表中消失。',
      'delete.busy': '正在删除…',
      'delete.done': '已删除「{name}」，已移入回收站。',
      'delete.confirm': '确认删除',
      'import.title': '导入技能',
      'import.folderTab': '从文件夹',
      'import.githubTab': '从 GitHub',
      'import.folder.path': '文件夹路径',
      'import.folder.pick': '选择文件夹…',
      'import.folder.pickUnavailable': '当前环境无法打开系统目录选择器，请手动输入路径。',
      'import.folder.hint': '支持两种形态：单个技能目录（含 SKILL.md），或一个技能集合根目录（一级子目录各含 SKILL.md，或一级 *.md 平铺技能）。导入到 DSH 用户技能目录（~/.dsh/skills）。',
      'import.github.url': 'GitHub 仓库链接',
      'import.github.hint': '支持 github.com/<owner>/<repo> 与 github.com/<owner>/<repo>/tree/<分支>/<子目录>；将下载仓库压缩包并提取其中的技能。',
      'import.overwrite': '覆盖同名技能',
      'import.submit': '开始导入',
      'import.cancel': '取消',
      'import.busy': '正在导入…',
      'import.done': '导入成功：{n} 个技能。',
      'import.conflict': '以下条目已存在：{names}。勾选「覆盖同名技能」后重试。',
      'import.close': '关闭',
      'error.generic': '加载失败：{message}',
      'error.none': '技能服务不可用。',
    }

    const en = {
      'panel.label': 'Skill hub',
      'page.title': 'Skill hub',
      'page.subtitle': 'Browse, search, and inspect every skill registered in this DSH.',
      'page.github': "Open the author's GitHub",
      'search.placeholder': 'Search skills by name, description, or source…',
      'list.count': '{n} skills',
      'list.empty': 'No skills match. Try another keyword.',
      'list.none': 'No skills are registered yet.',
      'list.filtered': '{n} non-DSH skill(s) hidden (from {sources}).',
      'badge.model': 'Model-invocable',
      'badge.user': 'Command-invocable',
      'badge.readonly': 'Read-only browse',
      'field.source': 'Source',
      'field.provider': 'Provider',
      'field.path': 'Path',
      'field.whenToUse': 'When to use',
      'field.resources': 'Resource base',
      'field.invocation': 'Invocation',
      'detail.title': 'Skill detail',
      'detail.select': 'Pick a skill on the left to read its full definition and body.',
      'detail.loading': 'Loading the skill body…',
      'action.refresh': 'Refresh',
      'action.refreshing': 'Refreshing…',
      'action.close': 'Hide detail',
      'action.import': 'Import',
      'action.delete': 'Delete',
      'delete.title': 'Delete skill',
      'delete.body': "Move the skill \"{name}\" from the user skills root into the trash (~/.dsh/skills/.trash)? It will disappear from the list immediately.",
      'delete.busy': 'Deleting…',
      'delete.done': 'Deleted "{name}"; it was moved to the trash.',
      'delete.confirm': 'Delete',
      'import.title': 'Import skills',
      'import.folderTab': 'From folder',
      'import.githubTab': 'From GitHub',
      'import.folder.path': 'Folder path',
      'import.folder.pick': 'Choose folder…',
      'import.folder.pickUnavailable': 'This environment cannot open the system folder picker; type the path manually.',
      'import.folder.hint': 'Two shapes: a single skill directory (containing SKILL.md), or a collection root (first-level subdirectories each with SKILL.md, or first-level *.md flat skills). Skills install into the DSH user skills root (~/.dsh/skills).',
      'import.github.url': 'GitHub repository URL',
      'import.github.hint': 'Accepts github.com/<owner>/<repo> and github.com/<owner>/<repo>/tree/<branch>/<subdir>; the repo archive is downloaded and its skills extracted.',
      'import.overwrite': 'Overwrite existing skills',
      'import.submit': 'Import',
      'import.cancel': 'Cancel',
      'import.busy': 'Importing…',
      'import.done': 'Imported {n} skill(s).',
      'import.conflict': 'These entries already exist: {names}. Enable "Overwrite existing skills" and retry.',
      'import.close': 'Close',
      'error.generic': 'Loading failed: {message}',
      'error.none': 'The skills service is unavailable.',
    }

    function translate(dict, key, params) {
      let text = Object.prototype.hasOwnProperty.call(dict, key) ? dict[key] : key
      if (params !== undefined && typeof text === 'string') {
        for (const [name, value] of Object.entries(params)) {
          text = text.replaceAll(`{${name}}`, String(value))
        }
      }
      return text
    }

    // --- style ----------------------------------------------------------------

    const CSS = [
      `.skh-page{height:100%;display:flex;flex-direction:column;overflow:hidden;background:var(--dsw-alias-bg-base,transparent);color:var(--dsw-alias-label-primary,inherit)}`,
      `.skh-head{padding:20px 24px 12px;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.2))}`,
      `.skh-head-row{display:flex;align-items:center;gap:10px}`,
      `.skh-head-row h1{margin:0;font-size:18px;font-weight:600;line-height:26px;flex:1}`,
      `.skh-github{flex:none;display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:8px;color:var(--dsw-alias-label-secondary,#5c6068)}`,
      `.skh-github:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.1));color:var(--dsw-alias-brand-primary,#247bbf)}`,
      `.skh-github svg{width:20px;height:20px;fill:currentColor}`,
      `.skh-head p{margin:4px 0 0;font-size:13px;line-height:19px;color:var(--dsw-alias-label-secondary,#5c6068)}`,
      `.skh-toolbar{display:flex;align-items:center;gap:10px;padding:12px 24px;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.2))}`,
      `.skh-search{flex:1;max-width:420px;padding:6px 12px;font-size:13px;border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.35));border-radius:8px;background:var(--dsw-alias-bg-layer-1,transparent);color:var(--dsw-alias-label-primary,inherit);outline:none}`,
      `.skh-search:focus{border-color:var(--dsw-alias-brand-primary,#247bbf)}`,
      `.skh-count{font-size:12px;color:var(--dsw-alias-label-tertiary,#8a8f98);white-space:nowrap}`,
      `.skh-refresh{flex:none;padding:6px 12px;font-size:13px;border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.35));border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary,#5c6068);cursor:pointer}`,
      `.skh-refresh:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.1))}`,
      `.skh-body{flex:1;display:flex;min-height:0}`,
      `.skh-list{width:340px;flex:none;overflow-y:auto;border-right:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.2));padding:8px}`,
      `.skh-row{width:100%;text-align:left;padding:10px 12px;border:1px solid transparent;border-radius:10px;background:transparent;cursor:pointer;display:block;color:inherit;font:inherit}`,
      `.skh-row:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.1))}`,
      `.skh-row[data-active="1"]{background:var(--dsw-alias-interactive-bg-active,rgba(36,123,191,.14));border-color:var(--dsw-alias-border-l2,rgba(127,127,127,.35))}`,
      `.skh-row-name{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary,inherit);word-break:break-all}`,
      `.skh-row-desc{margin-top:2px;font-size:12px;line-height:17px;color:var(--dsw-alias-label-secondary,#5c6068);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}`,
      `.skh-row-meta{margin-top:4px;display:flex;flex-wrap:wrap;gap:4px}`,
      `.skh-badge{display:inline-block;padding:1px 8px;border-radius:999px;font-size:11px;line-height:16px;border:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.2));color:var(--dsw-alias-label-tertiary,#8a8f98)}`,
      `.skh-badge[data-on="1"]{color:var(--dsw-alias-brand-primary,#247bbf);border-color:var(--dsw-alias-brand-primary,#247bbf)}`,
      `.skh-detail{flex:1;overflow-y:auto;padding:20px 24px;min-width:0}`,
      `.skh-detail-title{margin:0;font-size:16px;font-weight:600;word-break:break-all}`,
      `.skh-detail-headrow{display:flex;align-items:flex-start;gap:10px}`,
      `.skh-detail-headrow .skh-detail-title{flex:1}`,
      `.skh-delete-btn{flex:none;padding:5px 12px;font-size:12px;border:1px solid var(--dsw-alias-state-error-primary,#d54941);border-radius:8px;background:transparent;color:var(--dsw-alias-state-error-primary,#d54941);cursor:pointer}`,
      `.skh-delete-btn:hover{background:var(--dsw-alias-interactive-bg-hover-danger,rgba(213,73,65,.12))}`,
      `.skh-detail-sub{margin:2px 0 0;font-size:12px;color:var(--dsw-alias-label-tertiary,#8a8f98);word-break:break-all}`,
      `.skh-fields{margin:14px 0 0;display:grid;grid-template-columns:120px minmax(0,1fr);gap:6px 14px;font-size:13px;line-height:19px}`,
      `.skh-field-label{color:var(--dsw-alias-label-tertiary,#8a8f98)}`,
      `.skh-field-value{color:var(--dsw-alias-label-primary,inherit);word-break:break-all;min-width:0}`,
      `.skh-when{margin:14px 0 0;padding:10px 12px;border:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.2));border-radius:10px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary,#5c6068)}`,
      `.skh-body-text{margin:14px 0 0;padding:14px;border:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.2));border-radius:10px;background:var(--dsw-alias-bg-layer-1,rgba(127,127,127,.05));font-size:13px;line-height:1.7;color:var(--dsw-alias-label-secondary,#5c6068);max-height:60%;overflow-y:auto}`,
      `.skh-md>*:first-child{margin-top:0}`,
      `.skh-md-h1{margin:18px 0 8px;font-size:17px;font-weight:600;line-height:24px;color:var(--dsw-alias-label-primary,inherit)}`,
      `.skh-md-h2{margin:16px 0 6px;font-size:15px;font-weight:600;line-height:22px;color:var(--dsw-alias-label-primary,inherit)}`,
      `.skh-md-h3,.skh-md-h4{margin:14px 0 6px;font-size:13px;font-weight:600;line-height:20px;color:var(--dsw-alias-label-primary,inherit)}`,
      `.skh-md-h5,.skh-md-h6{margin:12px 0 4px;font-size:13px;font-weight:600;color:var(--dsw-alias-label-secondary,#5c6068)}`,
      `.skh-md-p{margin:8px 0;white-space:pre-wrap;word-break:break-word}`,
      `.skh-md-list{margin:8px 0;padding-left:22px}`,
      `.skh-md-list li{margin:3px 0;line-height:1.65}`,
      `.skh-md-quote{margin:10px 0;padding:6px 12px;border-left:3px solid var(--dsw-alias-border-l2,rgba(127,127,127,.35));color:var(--dsw-alias-label-tertiary,#8a8f98)}`,
      `.skh-md-quote p{margin:4px 0}`,
      `.skh-md-pre{margin:10px 0;padding:10px 12px;border:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.2));border-radius:8px;background:var(--dsw-alias-markdown-code-block,rgba(127,127,127,.08));font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;line-height:1.55;white-space:pre-wrap;word-break:break-word;overflow-x:auto}`,
      `.skh-md-code{padding:1px 5px;border-radius:5px;background:var(--dsw-alias-markdown-inline-code,rgba(127,127,127,.12));font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px}`,
      `.skh-md-link{color:var(--dsw-alias-brand-primary,#247bbf);text-decoration:underline;text-underline-offset:2px}`,
      `.skh-md-hr{margin:14px 0;border:0;border-top:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.2))}`,
      `.skh-note{font-size:13px;color:var(--dsw-alias-label-tertiary,#8a8f98)}`,
      `.skh-error{font-size:13px;color:var(--dsw-alias-state-error-primary,#d54941)}`,
      `.skh-import-btn{flex:none;padding:6px 14px;font-size:13px;border:1px solid var(--dsw-alias-brand-primary,#247bbf);border-radius:8px;background:transparent;color:var(--dsw-alias-brand-primary,#247bbf);cursor:pointer}`,
      `.skh-import-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(36,123,191,.1))}`,
      `.skh-mask{position:fixed;inset:0;z-index:80;background:var(--dsw-alias-bg-mask-1,rgba(0,0,0,.4));display:flex;align-items:center;justify-content:center}`,
      `.skh-modal{width:min(560px,90vw);max-height:80vh;overflow-y:auto;border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.35));border-radius:12px;background:var(--dsw-alias-bg-overlay,#fff);color:var(--dsw-alias-label-primary,inherit);padding:18px 20px;box-shadow:0 12px 40px rgba(0,0,0,.25)}`,
      `.skh-modal h2{margin:0 0 12px;font-size:16px;font-weight:600}`,
      `.skh-tabrow{display:flex;gap:6px;margin-bottom:12px}`,
      `.skh-tab{flex:none;padding:5px 14px;font-size:13px;border:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.2));border-radius:999px;background:transparent;color:var(--dsw-alias-label-secondary,#5c6068);cursor:pointer}`,
      `.skh-tab[data-on="1"]{color:var(--dsw-alias-brand-primary,#247bbf);border-color:var(--dsw-alias-brand-primary,#247bbf)}`,
      `.skh-label{display:block;margin:10px 0 4px;font-size:12px;color:var(--dsw-alias-label-tertiary,#8a8f98)}`,
      `.skh-text{width:100%;box-sizing:border-box;padding:7px 10px;font-size:13px;border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.35));border-radius:8px;background:var(--dsw-alias-bg-layer-1,transparent);color:var(--dsw-alias-label-primary,inherit);outline:none}`,
      `.skh-text:focus{border-color:var(--dsw-alias-brand-primary,#247bbf)}`,
      `.skh-hint{margin:6px 0 0;font-size:12px;line-height:17px;color:var(--dsw-alias-label-tertiary,#8a8f98)}`,
      `.skh-checkrow{display:flex;align-items:center;gap:8px;margin:12px 0;font-size:13px;color:var(--dsw-alias-label-secondary,#5c6068)}`,
      `.skh-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}`,
      `.skh-btn{padding:7px 16px;font-size:13px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.35));background:transparent;color:var(--dsw-alias-label-secondary,#5c6068);cursor:pointer}`,
      `.skh-btn[data-primary="1"]{border-color:var(--dsw-alias-brand-primary,#247bbf);color:var(--dsw-alias-bg-overlay,#fff);background:var(--dsw-alias-brand-primary,#247bbf)}`,
      `.skh-btn:disabled{opacity:.6;cursor:default}`,
      `.skh-result{margin:12px 0 0;font-size:13px;line-height:19px}`,
      `.skh-result-ok{color:var(--dsw-alias-state-success-primary,#1a7f37)}`,
      `.skh-result-item{margin:2px 0 0;font-size:12px;color:var(--dsw-alias-label-secondary,#5c6068);word-break:break-all}`,
    ].join('')

    // --- icon -----------------------------------------------------------------

    function PanelIcon(props) {
      const size = typeof props?.size === 'number' ? props.size : 20
      return h('svg', {
        viewBox: '0 0 24 24', width: size, height: size, 'aria-hidden': true,
        style: { display: 'block' },
      },
        h('path', {
          d: 'M12 2.6l1.9 4.5 4.5 1.9-4.5 1.9L12 15.4l-1.9-4.5-4.5-1.9 4.5-1.9L12 2.6z',
          fill: 'var(--dsw-alias-brand-primary, #247bbf)',
        }),
        h('path', {
          d: 'M18.4 14.2l.95 2.25 2.25.95-2.25.95-.95 2.25-.95-2.25-2.25-.95 2.25-.95.95-2.25z',
          fill: 'var(--dsw-alias-brand-primary, #247bbf)', opacity: 0.55,
        }),
        h('path', {
          d: 'M6.4 15.4l.7 1.65 1.65.7-1.65.7-.7 1.65-.7-1.65-1.65-.7 1.65-.7.7-1.65z',
          fill: 'var(--dsw-alias-brand-primary, #247bbf)', opacity: 0.35,
        }),
      )
    }

    // GitHub mark (Octicons "mark-github", MIT licensed).
    const GITHUB_PATH = 'M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z'

    function GitHubLink({ label }) {
      return h('a', {
        className: 'skh-github',
        href: 'https://github.com/amd47802574/dsh-skill-hub',
        target: '_blank', rel: 'noreferrer',
        'aria-label': label, title: label,
      }, h('svg', { viewBox: '0 0 16 16', 'aria-hidden': true }, h('path', { d: GITHUB_PATH })))
    }

    // --- data -----------------------------------------------------------------

    async function fetchJson(url, signal) {
      const response = await fetch(url, { method: 'GET', signal })
      const body = await response.json().catch(() => ({}))
      if (!response.ok || body?.ok !== true) {
        throw new Error(typeof body?.error === 'string' && body.error !== '' ? body.error : `HTTP ${response.status}`)
      }
      return body
    }

    // --- markdown ---------------------------------------------------------------

    // A small Markdown renderer producing plain React elements. No HTML
    // injection surface: every text run is a React text node, so the content
    // stays escaped by construction. Covers what skill bodies actually use:
    // headings, fenced code, quotes, nested lists, rules, emphasis, inline
    // code, links, and strikethrough.

    function mdInline(text, keyBase) {
      const nodes = []
      const pattern = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*)|(~~[^~\n]+~~)|(\[[^\]\n]+\]\(https?:\/\/[^)\s]+\))/gu
      let last = 0
      let match
      let index = 0
      while ((match = pattern.exec(text)) !== null) {
        if (match.index > last) nodes.push(text.slice(last, match.index))
        const token = match[0]
        const key = `${keyBase}-${index++}`
        if (token.startsWith('`')) {
          nodes.push(h('code', { className: 'skh-md-code', key }, token.slice(1, -1)))
        } else if (token.startsWith('**')) {
          nodes.push(h('strong', { key }, token.slice(2, -2)))
        } else if (token.startsWith('~~')) {
          nodes.push(h('del', { key }, token.slice(2, -2)))
        } else if (token.startsWith('[')) {
          const linkMatch = /^\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)$/.exec(token)
          if (linkMatch !== null) {
            nodes.push(h('a', { className: 'skh-md-link', key, href: linkMatch[2], target: '_blank', rel: 'noreferrer' }, linkMatch[1]))
          } else {
            nodes.push(token)
          }
        } else {
          nodes.push(h('em', { key }, token.slice(1, -1)))
        }
        last = match.index + token.length
      }
      if (last < text.length) nodes.push(text.slice(last))
      return nodes
    }

    function mdListItems(lines, start, indent, ordered, keyBase) {
      // Collect consecutive list items at the given indentation; deeper
      // indented markers become nested lists inside the owning item.
      const items = []
      let i = start
      const marker = ordered ? /^\s*(\d+[.)])\s+/ : /^\s*([-*+])\s+/
      while (i < lines.length) {
        const line = lines[i]
        if (line.trim() === '' || !marker.test(line)) break
        const leading = line.length - line.trimStart().length
        if (leading < indent) break
        if (leading > indent) {
          // A deeper nested marker under the previous item was consumed there.
          break
        }
        let content = line.trimStart().replace(ordered ? /^\d+[.)]\s+/ : /^[-*+]\s+/, '')
        const children = []
        i += 1
        // Consume nested list lines belonging to this item.
        while (i < lines.length && lines[i].trim() !== '') {
          const next = lines[i]
          const nextLeading = next.length - next.trimStart().length
          const nextTrim = next.trimStart()
          const isNestedMarker = nextLeading > indent && /^([-*+]|\d+[.)])\s/.test(nextTrim)
          if (isNestedMarker) {
            const isOrderedNested = /^\d+[.)]\s/.test(nextTrim)
            const [consumed, nextIndex] = mdListItems(lines, i, nextLeading, isOrderedNested, `${keyBase}-n`)
            children.push(h(isOrderedNested ? 'ol' : 'ul', { className: 'skh-md-list', key: `${keyBase}-nested-${i}` }, consumed))
            i = nextIndex
            continue
          }
          if (nextLeading > indent) {
            content += ` ${next.trim()}`
            i += 1
            continue
          }
          break
        }
        items.push(h('li', { key: `${keyBase}-${i}` }, ...mdInline(content, `${keyBase}-i`), ...(children.length > 0 ? children : [])))
      }
      return [items, i]
    }

    function renderMarkdown(src, keyBase = 'md') {
      const lines = String(src).split(/\r?\n/)
      const out = []
      let i = 0
      let index = 0
      while (i < lines.length) {
        const line = lines[i]
        const fence = /^\s*(```+|~~~+)\s*(\S*)\s*$/.exec(line)
        if (fence !== null) {
          const marker = fence[1][0].repeat(3)
          const lang = fence[2] || ''
          const body = []
          i += 1
          while (i < lines.length && !lines[i].trimStart().startsWith(marker)) {
            body.push(lines[i])
            i += 1
          }
          i += 1
          out.push(h('pre', { className: 'skh-md-pre', key: `${keyBase}-p${index++}`, 'data-lang': lang || undefined },
            h('code', null, body.join('\n'))))
          continue
        }
        const heading = /^(#{1,6})\s+(.*)$/.exec(line)
        if (heading !== null) {
          const level = Math.min(heading[1].length, 6)
          const Tag = `h${level}`
          out.push(h(Tag, { className: `skh-md-h${level}`, key: `${keyBase}-h${index++}` }, ...mdInline(heading[2], `${keyBase}-hh${index}`)))
          i += 1
          continue
        }
        if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
          out.push(h('hr', { className: 'skh-md-hr', key: `${keyBase}-r${index++}` }))
          i += 1
          continue
        }
        if (/^\s*>\s?/.test(line)) {
          const quote = []
          while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
            quote.push(lines[i].replace(/^\s*>\s?/, ''))
            i += 1
          }
          out.push(h('blockquote', { className: 'skh-md-quote', key: `${keyBase}-q${index++}` }, ...renderMarkdown(quote.join('\n'), `${keyBase}-qq`)))
          continue
        }
        if (/^\s*([-*+])\s+/.test(line)) {
          const [items, next] = mdListItems(lines, i, line.length - line.trimStart().length, false, `${keyBase}-u${index}`)
          out.push(h('ul', { className: 'skh-md-list', key: `${keyBase}-ul${index++}` }, items))
          i = next
          continue
        }
        if (/^\s*\d+[.)]\s+/.test(line)) {
          const [items, next] = mdListItems(lines, i, line.length - line.trimStart().length, true, `${keyBase}-o${index}`)
          out.push(h('ol', { className: 'skh-md-list', key: `${keyBase}-ol${index++}` }, items))
          i = next
          continue
        }
        if (line.trim() === '') {
          i += 1
          continue
        }
        const paragraph = [line]
        i += 1
        while (i < lines.length && lines[i].trim() !== ''
          && /^\s*(```|~~~|#{1,6}\s|>|[-*+]\s|\d+[.)]\s)/.test(lines[i]) === false
          && !/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(lines[i])) {
          paragraph.push(lines[i])
          i += 1
        }
        out.push(h('p', { className: 'skh-md-p', key: `${keyBase}-t${index++}` }, ...mdInline(paragraph.join('\n'), `${keyBase}-tt`)))
      }
      return out
    }

    // --- views ----------------------------------------------------------------

    function Badge({ dict, on, label }) {
      return h('span', { className: 'skh-badge', 'data-on': on ? '1' : '0' }, label)
    }

    function Field({ dict, label, value }) {
      if (value === undefined || value === null || value === '') return null
      return h(react.Fragment, null,
        h('span', { className: 'skh-field-label' }, label),
        h('span', { className: 'skh-field-value' }, String(value)),
      )
    }

    function SkillDetail({ dict, name, state, onDelete }) {
      if (name === '') {
        return h('div', { className: 'skh-detail' },
          h('h2', { className: 'skh-detail-title' }, translate(dict, 'detail.title')),
          h('p', { className: 'skh-note' }, translate(dict, 'detail.select')))
      }
      if (state.status === 'error') {
        return h('div', { className: 'skh-detail' },
          h('h2', { className: 'skh-detail-title' }, name),
          h('p', { className: 'skh-error' }, translate(dict, 'error.generic', { message: state.message })))
      }
      if (state.status === 'loading' || state.skill === null) {
        return h('div', { className: 'skh-detail' },
          h('h2', { className: 'skh-detail-title' }, name),
          h('p', { className: 'skh-note' }, translate(dict, 'detail.loading')))
      }
      const skill = state.skill
      const resources = skill.resourceBase?.kind === 'directory' ? skill.resourceBase.path
        : skill.resourceBase?.kind === 'url' ? skill.resourceBase.url
        : skill.resourceBase?.kind === 'opaque' ? skill.resourceBase.description
        : undefined
      const deletable = skill.source === 'user-dsh'
      return h('div', { className: 'skh-detail' },
        h('div', { className: 'skh-detail-headrow' },
          h('h2', { className: 'skh-detail-title' }, skill.name),
          deletable ? h('button', {
            className: 'skh-delete-btn', onClick: () => onDelete(skill),
            title: translate(dict, 'delete.title'),
          }, translate(dict, 'action.delete')) : null),
        h('p', { className: 'skh-detail-sub' }, skill.description),
        h('div', { className: 'skh-fields' },
          h(Field, { dict, label: translate(dict, 'field.source'), value: skill.source }),
          h(Field, { dict, label: translate(dict, 'field.provider'), value: skill.provider }),
          h(Field, { dict, label: translate(dict, 'field.path'), value: skill.path }),
          h(Field, { dict, label: translate(dict, 'field.invocation'), value: [
            skill.modelInvocable ? translate(dict, 'badge.model') : null,
            skill.userInvocable ? translate(dict, 'badge.user') : null,
          ].filter(Boolean).join(' · ') }),
          h(Field, { dict, label: translate(dict, 'field.resources'), value: resources }),
        ),
        skill.whenToUse ? h('div', { className: 'skh-when' },
          h('strong', null, `${translate(dict, 'field.whenToUse')}: `), skill.whenToUse) : null,
        skill.content !== '' ? h('div', { className: 'skh-body-text skh-md' }, ...renderMarkdown(skill.content, 'skh-detail')) : null,
      )
    }

    function ImportDialog({ dict, pickDirectory, onClose, onImported }) {
      const [tab, setTab] = useState('folder')
      const [folderPath, setFolderPath] = useState('')
      const [githubUrl, setGithubUrl] = useState('')
      const [overwrite, setOverwrite] = useState(false)
      const [busy, setBusy] = useState(false)
      const [result, setResult] = useState(null)
      const canPick = typeof pickDirectory === 'function'

      const pick = async () => {
        try {
          const path = await pickDirectory()
          if (typeof path === 'string' && path !== '') setFolderPath(path)
        } catch {
          // The picker is unavailable; the user keeps typing the path manually.
        }
      }

      const submit = async () => {
        setBusy(true)
        setResult(null)
        try {
          const endpoint = tab === 'folder' ? `${API}.importFolder` : `${API}.importGithub`
          const body = tab === 'folder' ? { path: folderPath.trim() } : { url: githubUrl.trim() }
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ ...body, overwrite }),
          })
          const data = await response.json().catch(() => ({}))
          if (data?.ok === true) {
            setResult({ ok: true, count: (data.imported ?? []).length, imported: data.imported ?? [] })
            onImported()
          } else {
            setResult({
              ok: false,
              code: data?.code,
              error: typeof data?.error === 'string' ? data.error : `HTTP ${response.status}`,
              conflicts: Array.isArray(data?.conflicts) ? data.conflicts : [],
            })
          }
        } catch (cause) {
          setResult({ ok: false, error: cause instanceof Error ? cause.message : String(cause) })
        } finally {
          setBusy(false)
        }
      }

      const ready = tab === 'folder' ? folderPath.trim() !== '' : githubUrl.trim() !== ''

      return h('div', { className: 'skh-mask', onClick: (event) => { if (event.target === event.currentTarget && !busy) onClose() } },
        h('div', { className: 'skh-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': translate(dict, 'import.title') },
          h('h2', null, translate(dict, 'import.title')),
          h('div', { className: 'skh-tabrow' },
            h('button', { className: 'skh-tab', 'data-on': tab === 'folder' ? '1' : '0', onClick: () => { setTab('folder'); setResult(null) } }, translate(dict, 'import.folderTab')),
            h('button', { className: 'skh-tab', 'data-on': tab === 'github' ? '1' : '0', onClick: () => { setTab('github'); setResult(null) } }, translate(dict, 'import.githubTab'))),
          tab === 'folder' ? [
            h('label', { className: 'skh-label', key: 'lp' }, translate(dict, 'import.folder.path')),
            h('div', { style: { display: 'flex', gap: 8 }, key: 'row' },
              h('input', {
                className: 'skh-text', value: folderPath, spellCheck: false,
                placeholder: 'C:\\path\\to\\skills',
                onChange: (event) => setFolderPath(event.target.value),
              }),
              canPick ? h('button', { className: 'skh-btn', onClick: pick, disabled: busy }, translate(dict, 'import.folder.pick')) : null),
            canPick ? null : h('p', { className: 'skh-hint' }, translate(dict, 'import.folder.pickUnavailable')),
            h('p', { className: 'skh-hint' }, translate(dict, 'import.folder.hint')),
          ] : [
            h('label', { className: 'skh-label', key: 'lg' }, translate(dict, 'import.github.url')),
            h('input', {
              className: 'skh-text', key: 'url', value: githubUrl, spellCheck: false,
              placeholder: 'https://github.com/<owner>/<repo>',
              onChange: (event) => setGithubUrl(event.target.value),
            }),
            h('p', { className: 'skh-hint', key: 'hint' }, translate(dict, 'import.github.hint')),
          ],
          h('label', { className: 'skh-checkrow' },
            h('input', { type: 'checkbox', checked: overwrite, onChange: (event) => setOverwrite(event.target.checked) }),
            translate(dict, 'import.overwrite')),
          result !== null && result.ok === true ? h('div', { className: 'skh-result skh-result-ok' },
            translate(dict, 'import.done', { n: result.count }),
            result.imported.map((item) => h('div', { className: 'skh-result-item', key: item.entry },
              `${item.entry}${item.name !== undefined && item.name !== item.entry ? ` → ${item.name}` : ''}`))) : null,
          result !== null && result.ok === false ? h('div', { className: 'skh-result skh-error' },
            result.code === 'conflict'
              ? translate(dict, 'import.conflict', { names: (result.conflicts ?? []).join(', ') })
              : `${translate(dict, 'error.generic', { message: result.error })}`) : null,
          h('div', { className: 'skh-actions' },
            h('button', { className: 'skh-btn', onClick: onClose, disabled: busy }, translate(dict, result?.ok === true ? 'import.close' : 'import.cancel')),
            h('button', { className: 'skh-btn', 'data-primary': '1', onClick: submit, disabled: busy || !ready },
              busy ? translate(dict, 'import.busy') : translate(dict, 'import.submit')))))
    }

    function DeleteDialog({ dict, skill, busy, error, onCancel, onConfirm }) {
      return h('div', { className: 'skh-mask', onClick: (event) => { if (event.target === event.currentTarget && !busy) onCancel() } },
        h('div', { className: 'skh-modal', role: 'alertdialog', 'aria-modal': 'true', 'aria-label': translate(dict, 'delete.title') },
          h('h2', null, translate(dict, 'delete.title')),
          h('p', { className: 'skh-hint' }, translate(dict, 'delete.body', { name: skill.name })),
          error ? h('p', { className: 'skh-error' }, translate(dict, 'error.generic', { message: error })) : null,
          h('div', { className: 'skh-actions' },
            h('button', { className: 'skh-btn', onClick: onCancel, disabled: busy }, translate(dict, 'import.cancel')),
            h('button', { className: 'skh-btn', 'data-primary': '1', onClick: onConfirm, disabled: busy },
              busy ? translate(dict, 'delete.busy') : translate(dict, 'delete.confirm')))))
    }

    function SkillHubPanel({ t, pickDirectory }) {
      const [dict, setDict] = useState(t.dictionary)
      useEffect(() => t.subscribe(setDict), [t])
      const tr = useCallback((key, params) => translate(dict, key, params), [dict])

      const [items, setItems] = useState(null)
      const [error, setError] = useState(null)
      const [refreshing, setRefreshing] = useState(false)
      const [hidden, setHidden] = useState({ count: 0, sources: [] })
      const [query, setQuery] = useState('')
      const [selected, setSelected] = useState('')
      const [detail, setDetail] = useState({ status: 'idle', skill: null })
      const [importing, setImporting] = useState(false)
      const [deleting, setDeleting] = useState(null) // { skill } while confirm dialog is open
      const [deleteBusy, setDeleteBusy] = useState(false)
      const [deleteError, setDeleteError] = useState(null)

      const load = useCallback(async (signal, fresh = false) => {
        setRefreshing(true)
        setError(null)
        try {
          const body = await fetchJson(`${API}.list${fresh ? '?fresh=1' : ''}`, signal)
          setItems(Array.isArray(body.skills) ? body.skills : [])
          setHidden({
            count: typeof body.filtered === 'number' ? body.filtered : 0,
            sources: Array.isArray(body.hiddenSources) ? body.hiddenSources : [],
          })
        } catch (cause) {
          if (!signal?.aborted) setError(cause instanceof Error ? cause.message : String(cause))
        } finally {
          if (!signal?.aborted) setRefreshing(false)
        }
      }, [])

      useEffect(() => {
        const controller = new AbortController()
        load(controller.signal)
        return () => controller.abort()
      }, [load])

      useEffect(() => {
        if (selected === '') return
        const controller = new AbortController()
        setDetail({ status: 'loading', skill: null })
        fetchJson(`${API}.detail?name=${encodeURIComponent(selected)}`, controller.signal)
          .then((body) => setDetail({ status: 'ready', skill: body.skill ?? null }))
          .catch((cause) => {
            if (!controller.signal.aborted) {
              setDetail({ status: 'error', skill: null, message: cause instanceof Error ? cause.message : String(cause) })
            }
          })
        return () => controller.abort()
      }, [selected])

      const filtered = useMemo(() => {
        if (items === null) return null
        const q = query.trim().toLowerCase()
        if (q === '') return items
        return items.filter((item) =>
          item.name.toLowerCase().includes(q)
          || (item.description ?? '').toLowerCase().includes(q)
          || (item.source ?? '').toLowerCase().includes(q))
      }, [items, query])

      const runDelete = async () => {
        if (deleting === null) return
        setDeleteBusy(true)
        setDeleteError(null)
        try {
          const response = await fetch(`${API}.delete`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ name: deleting.skill.name }),
          })
          const data = await response.json().catch(() => ({}))
          if (data?.ok !== true) {
            throw new Error(typeof data?.error === 'string' && data.error !== '' ? data.error : `HTTP ${response.status}`)
          }
          setDeleting(null)
          setSelected('')
          setDetail({ status: 'idle', skill: null })
          load(undefined, true)
        } catch (cause) {
          setDeleteError(cause instanceof Error ? cause.message : String(cause))
        } finally {
          setDeleteBusy(false)
        }
      }

      return h('div', { className: 'skh-page' },
        h('style', null, CSS),
        h('div', { className: 'skh-head' },
          h('div', { className: 'skh-head-row' },
            h('h1', null, tr('page.title')),
            h(GitHubLink, { label: tr('page.github') })),
          h('p', null, tr('page.subtitle'))),
        h('div', { className: 'skh-toolbar' },
          h('input', {
            className: 'skh-search', type: 'search', value: query,
            placeholder: tr('search.placeholder'),
            'aria-label': tr('search.placeholder'),
            onChange: (event) => setQuery(event.target.value),
          }),
          h('span', { className: 'skh-count' },
            filtered === null ? '' : tr('list.count', { n: filtered.length })),
          h('button', { className: 'skh-refresh', onClick: () => load(undefined, true), disabled: refreshing },
            refreshing ? tr('action.refreshing') : tr('action.refresh')),
          h('button', { className: 'skh-import-btn', onClick: () => setImporting(true) }, tr('action.import'))),
        h('div', { className: 'skh-body' },
          h('div', { className: 'skh-list', role: 'listbox', 'aria-label': tr('page.title') },
            error !== null ? h('p', { className: 'skh-error' }, tr('error.generic', { message: error })) : null,
            hidden.count > 0 && hidden.sources.length > 0
              ? h('p', { className: 'skh-note' }, tr('list.filtered', { n: hidden.count, sources: hidden.sources.join(', ') }))
              : null,
            error === null && filtered !== null && filtered.length === 0
              ? h('p', { className: 'skh-note' }, items.length === 0 ? tr('list.none') : tr('list.empty'))
              : null,
            (filtered ?? []).map((item) => h('button', {
              key: item.name, role: 'option', 'aria-selected': selected === item.name ? 'true' : 'false',
              className: 'skh-row', 'data-active': selected === item.name ? '1' : '0',
              onClick: () => setSelected(item.name),
            },
              h('span', { className: 'skh-row-name' }, item.name),
              h('span', { className: 'skh-row-desc' }, item.description),
              h('span', { className: 'skh-row-meta' },
                h(Badge, { dict, on: item.modelInvocable, label: tr('badge.model') }),
                h(Badge, { dict, on: item.userInvocable, label: tr('badge.user') }),
                item.source !== '' ? h(Badge, { dict, on: false, label: item.source }) : null,
              )))),
          h(SkillDetail, {
            dict, name: selected, state: detail,
            onDelete: (skill) => { setDeleteError(null); setDeleting({ skill }) },
          }),
          importing ? h(ImportDialog, {
            dict, pickDirectory, onClose: () => setImporting(false),
            onImported: () => load(undefined, true),
          }) : null,
          deleting !== null ? h(DeleteDialog, {
            dict, skill: deleting.skill, busy: deleteBusy, error: deleteError,
            onCancel: () => { if (!deleteBusy) setDeleting(null) },
            onConfirm: runDelete,
          }) : null))
    }

    // --- apply ----------------------------------------------------------------

    function apply(ctx) {
      const locale = ctx.get('locale')
      if (locale === undefined) return

      // A tiny reactive translate handle: re-renders when the locale changes.
      let current = locale.getLocale?.().id === 'en' ? en : zh
      const dictionary = { get: () => current }
      const subscribers = new Set()
      const unsubscribe = locale.subscribe?.(() => {
        current = locale.getLocale?.().id === 'en' ? en : zh
        for (const notify of subscribers) notify()
      })
      if (typeof unsubscribe === 'function') ctx.effect(() => unsubscribe, `${NS}: locale`)
      const t = {
        get dictionary() { return current },
        subscribe(notify) { subscribers.add(notify); return () => subscribers.delete(notify) },
      }

      if (typeof locale.register === 'function') {
        const dispose = locale.register(NS, { zh, en })
        if (typeof dispose === 'function') ctx.effect(() => dispose, `${NS}: locale dictionary`)
      }

      ctx.effect(() => ctx.slots.inject('main', () => ctx.slots.register({
        name: 'main', key: PANEL_ID, locale: NS,
      }, (props) => h(SkillHubPanel, { t, pickDirectory: () => ctx.get('uiWorkspace')?.pickDirectory?.() ?? null }))), `${NS}: main panel`)

      ctx.effect(() => ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
        name: 'sidebar.panellist', id: PANEL_ID, order: 80,
        label: () => translate(current, 'panel.label'),
        locale: NS,
      }, (props) => h(PanelIcon, props))), `${NS}: sidebar entry`)
    }

    exports.apply = apply
    exports.inject = ['slots', 'locale']
    exports.renderMarkdown = renderMarkdown
    return module.exports
  },
})
