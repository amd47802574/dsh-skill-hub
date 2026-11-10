// dsh-skill-hub - host half.
//
// Authenticated JSON routes served through the connection service's fetch
// registry, so they inherit authentication and the host/origin fence for free
// (the dsh-chat-export shape):
//
//   GET  /api/dsh-skill-hub.list            -> { ok, complete, skills: Summary[] }
//   GET  /api/dsh-skill-hub.detail?name=x   -> { ok, skill: Definition } | 404
//   POST /api/dsh-skill-hub.importFolder    -> install skills from a local folder
//   POST /api/dsh-skill-hub.importGithub    -> install skills from a GitHub repo
//
// Skill data comes from the host `skills` service (`ctx.get('skills')`) at
// call time; imports write into the DSH user skills root (`$DSH_HOME/skills`,
// the `user-dsh` source) where the filesystem provider's watcher discovers
// them automatically. Services are resolved lazily so the plugin loads on any
// profile and reports a clear JSON failure instead of breaking the boot when
// one is absent.
import { cp, mkdir, mkdtemp, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { basename, dirname, join, normalize, resolve, sep } from 'node:path'
import { gunzipSync } from 'node:zlib'

/** Parse one skill markdown file: frontmatter fields (lowercased keys) + body. */
async function parseSkillMarkdown(path) {
  let raw
  try {
    raw = await readFile(path, { encoding: 'utf8' })
  } catch {
    return undefined
  }
  const head = raw.slice(0, FRONTMATTER_SCAN_BYTES)
  if (!head.startsWith('---')) return { fields: {}, body: raw }
  const closing = head.indexOf('\n---', 3)
  if (closing < 0) return { fields: {}, body: raw }
  const block = head.slice(3, closing)
  const lines = block.split(/\r?\n/)
  const fields = {}
  for (let i = 0; i < lines.length; i++) {
    const match = /^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/.exec(lines[i])
    if (match === null) continue
    const scalar = /^([>|])(?:([1-9])[-+]?|[-+]([1-9])?)?\s*$/.exec(match[2])
    if (scalar !== null) {
      // Folded/literal block scalar: gather the more-indented continuation lines.
      const content = []
      while (i + 1 < lines.length && (/^\s/.test(lines[i + 1]) || lines[i + 1] === '')) {
        i += 1
        content.push(lines[i])
      }
      const indent = content.filter((line) => line.trim() !== '').reduce(
        (min, line) => Math.min(min, (/^\s*/.exec(line) ?? [''])[0].length),
        Number.POSITIVE_INFINITY,
      )
      const normalized = content.map((line) => (Number.isFinite(indent) ? line.slice(Math.min(indent, line.length)) : line))
      fields[match[1].toLowerCase()] = (scalar[1] === '>' ? normalized.join(' ') : normalized.join('\n')).trim()
      continue
    }
    const value = match[2].trim().replace(/^["']|["']$/g, '')
    if (value !== '') fields[match[1].toLowerCase()] = value
  }
  const bodyStart = head.indexOf('\n', closing + 1)
  return { fields, body: bodyStart < 0 ? '' : raw.slice(bodyStart + 1) }
}

function frontmatterBool(value) {
  if (value === undefined) return undefined
  const v = String(value).toLowerCase()
  if (v === 'true' || v === '1' || v === 'yes' || v === 'on') return true
  if (v === 'false' || v === '0' || v === 'no' || v === 'off') return false
  return undefined
}

function toKebabName(s) {
  let t = String(s ?? '').trim()
  if (t === '' || /[^\x00-\x7F]/.test(t)) return ''
  t = t.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
      .replace(/[\s_.]+/g, '-').replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-').replace(/^-+|-+$/g, '')
  return t
}

/**
 * Read the skills-manager policy (read-only, defensive): which sources are
 * enabled and which entry names are explicitly disabled. Absent or malformed
 * state means everything is allowed.
 */
async function readManagerPolicy() {
  const statePath = join(dirname(dshSkillsRoot()), 'skills-manager', 'state.json')
  let raw
  try {
    raw = await readFile(statePath, { encoding: 'utf8' })
  } catch {
    return { sourceEnabled: true, disabled: new Set() }
  }
  try {
    const parsed = JSON.parse(raw)
    const sourceEnabled = parsed?.sources?.dsh !== false
    const list = Array.isArray(parsed?.disabledSkills?.dsh) ? parsed.disabledSkills.dsh : []
    return { sourceEnabled, disabled: new Set(list.filter((n) => typeof n === 'string')) }
  } catch {
    return { sourceEnabled: true, disabled: new Set() }
  }
}

const KEBAB_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u

/**
 * Direct scan of the DSH user skills root. Third-party skill providers may
 * skip plain, policy-free entries in the mutable dsh root (they assume another
 * provider serves them), so the hub treats the disk as the fallback source of
 * truth: registry results win, disk fills every gap.
 */
async function scanUserSkillsRoot() {
  const root = dshSkillsRoot()
  const policy = await readManagerPolicy()
  const out = new Map()
  if (!policy.sourceEnabled) return out
  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const isDir = entry.isDirectory()
    const isFlatMd = entry.isFile() && entry.name.toLowerCase().endsWith('.md') && entry.name.toLowerCase() !== SKILL_ENTRY.toLowerCase()
    if (!isDir && !isFlatMd) continue
    const docPath = isDir ? join(root, entry.name, SKILL_ENTRY) : join(root, entry.name)
    const parsed = await parseSkillMarkdown(docPath)
    if (parsed === undefined) continue
    const description = typeof parsed.fields.description === 'string' ? parsed.fields.description : ''
    if (description === '') continue
    const declared = typeof parsed.fields.name === 'string' ? parsed.fields.name.trim() : ''
    const name = KEBAB_NAME.test(declared) ? declared
      : declared !== '' && toKebabName(declared) !== '' ? toKebabName(declared)
      : KEBAB_NAME.test(entry.name) ? entry.name
      : undefined
    if (name === undefined) continue
    // Respect the manager's explicit disables (by entry or declared name).
    if (policy.disabled.has(entry.name) || policy.disabled.has(declared)) continue
    const modelValue = frontmatterBool(parsed.fields['disable-model-invocation'])
    const userValue = frontmatterBool(parsed.fields['user-invocable'])
    out.set(name, {
      item: {
        name,
        description,
        whenToUse: typeof parsed.fields.whentouse === 'string' && parsed.fields.whentouse !== '' ? parsed.fields.whentouse : undefined,
        source: 'user-dsh',
        provider: 'skill-hub-direct',
        path: docPath,
        modelInvocable: modelValue !== true,
        userInvocable: userValue !== false,
        resourceBase: { kind: 'directory', path: isDir ? join(root, entry.name) : root },
      },
      body: parsed.body,
    })
  }
  return out
}


const SKILL_ENTRY = 'SKILL.md'
const MAX_TARBALL_BYTES = 50 * 1024 * 1024
const MAX_EXTRACT_BYTES = 100 * 1024 * 1024
const MAX_EXTRACT_FILES = 5000
const MAX_EXTRACT_FILE_BYTES = 20 * 1024 * 1024
const FRONTMATTER_SCAN_BYTES = 8192

class RouteError extends Error {
  constructor(status, code, message) {
    super(message)
    this.name = 'RouteError'
    this.status = status
    this.code = code
  }
}

function json(body, status = 200) {
  return new Response(`${JSON.stringify(body, null, 2)}\n`, {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

function fail(status, code, message) {
  return json({ ok: false, code, error: message }, status)
}

function errorResponse(error) {
  if (error instanceof RouteError) return fail(error.status, error.code, error.message)
  return fail(500, 'internal', error instanceof Error ? error.message : String(error))
}

async function readJsonBody(request) {
  const text = await request.text()
  if (text.trim() === '') return {}
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new RouteError(400, 'invalid', 'the request body is not valid JSON')
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new RouteError(400, 'invalid', 'the request body must be a JSON object')
  }
  return parsed
}

/** Project one skill summary to plain JSON the browser can render defensively. */
function summaryOf(skill) {
  if (skill === null || typeof skill !== 'object') return null
  const invocation = skill.invocation ?? {}
  const resourceBase = skill.resourceBase ?? undefined
  return {
    name: typeof skill.name === 'string' ? skill.name : '',
    description: typeof skill.description === 'string' ? skill.description : '',
    whenToUse: typeof skill.whenToUse === 'string' ? skill.whenToUse : undefined,
    source: typeof skill.source === 'string' ? skill.source : '',
    provider: typeof skill.provider === 'string' ? skill.provider : '',
    path: typeof skill.path === 'string' ? skill.path : undefined,
    modelInvocable: invocation.modelInvocable === true,
    userInvocable: invocation.userInvocable === true,
    resourceBase:
      resourceBase !== null && typeof resourceBase === 'object' && typeof resourceBase.kind === 'string'
        ? { kind: resourceBase.kind, path: resourceBase.path, url: resourceBase.url, description: resourceBase.description }
        : undefined,
  }
}

/** Resolve the host skills service, or throw a shaped failure. */
function requireSkills(ctx) {
  const skills = ctx.get('skills')
  if (skills === undefined || typeof skills.list !== 'function' || typeof skills.get !== 'function') {
    throw new RouteError(503, 'no-skills-service', 'the host skills service is not available in this profile')
  }
  return skills
}

/**
 * Force the skills registry to drop its discovery cache. Writing skill files
 * does not invalidate providers without their own watchers, so installs and
 * explicit refreshes register+dispose a one-shot empty provider: both the
 * registration and its teardown trip the registry's layer-change hook, which
 * clears the discovery cache. Uses only the public provider API.
 */
function touchRegistry(skills) {
  if (typeof skills.registerProvider !== 'function') return
  try {
    const dispose = skills.registerProvider(() => ({
      name: 'skill-hub-invalidate',
      list: () => [],
      get: async () => undefined,
    }))
    try {
      dispose?.()
    } catch {}
  } catch {}
}

const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u

/** Install the plugin. Loader waits for these services before activating the fiber. */
export const inject = ['connection']

/** Install the plugin. */
export function apply(ctx, config = {}) {
  const warn = ctx.logger?.warn?.bind(ctx.logger) ?? ((message) => console.warn(`[dsh-skill-hub] ${message}`))

  // Whitelist mode (default): only skills whose source belongs to the user's
  // own DSH skill spaces. Hidden by default: every other agent ecology
  // (agent-agents, agent-ccswitch, agent-workbuddy, user-agents,
  // project-agents) AND DSH's own bundled skills, which are read-only parts
  // of the product. `showAllSources: true` disables filtering;
  // `extraSources` opts more labels back in.
  const DSH_SOURCES = new Set(['user-dsh', 'project-dsh', 'custom', 'runtime'])
  const extraSources = new Set(
    Array.isArray(config.extraSources) && config.extraSources.every((s) => typeof s === 'string')
      ? config.extraSources
      : [],
  )
  const showAll = config.showAllSources === true
  const isDshSkill = (item) => showAll || DSH_SOURCES.has(item.source) || extraSources.has(item.source)

  const registerAll = (conn) => {
    conn.fetch.register({
    path: '/api/dsh-skill-hub.list',
    methods: ['GET', 'HEAD'],
    requestBody: 'buffered',
    fetch: async (request) => {
      try {
        const url = new URL(request.url)
        const skills = requireSkills(ctx)
        // An explicit refresh drops the registry's discovery cache first, so
        // skills written without a provider-side watcher become visible.
        if (url.searchParams.get('fresh') === '1') touchRegistry(skills)
        const snapshot = await skills.snapshot({ signal: request.signal })
        const list = Array.isArray(snapshot?.skills) ? snapshot.skills : []
        const items = []
        const seen = new Set()
        const hiddenSources = new Set()
        let filtered = 0
        for (const skill of list) {
          const item = summaryOf(skill)
          if (item === null || item.name === '') continue
          seen.add(item.name)
          if (!isDshSkill(item)) {
            filtered += 1
            if (item.source !== '') hiddenSources.add(item.source)
            continue
          }
          items.push(item)
        }
        // Disk fallback: the registry may silently skip plain, policy-free
        // entries in the mutable dsh root when a third-party provider owns
        // discovery, so the disk is the source of truth for user-dsh gaps.
        const direct = await scanUserSkillsRoot()
        for (const [name, { item }] of direct) {
          if (seen.has(name)) continue
          items.push(item)
        }
        items.sort((a, b) => a.name.localeCompare(b.name))
        return json({
          ok: true,
          complete: snapshot?.complete === true,
          skills: items,
          filtered,
          hiddenSources: [...hiddenSources].sort(),
        })
      } catch (error) {
        return errorResponse(error)
      }
    },
  })

  conn.fetch.register({
    path: '/api/dsh-skill-hub.detail',
    methods: ['GET', 'HEAD'],
    requestBody: 'buffered',
    fetch: async (request) => {
      try {
        const url = new URL(request.url)
        const name = url.searchParams.get('name') ?? ''
        if (!SKILL_NAME.test(name)) throw new RouteError(400, 'invalid', 'the name query must be a kebab-case skill name')
        const skills = requireSkills(ctx)
        const definition = await skills.get(name, { signal: request.signal }).catch(() => undefined)
        if (definition !== undefined) {
          const item = summaryOf(definition)
          if (item !== null && !isDshSkill(item)) {
            throw new RouteError(404, 'filtered', `skill "${name}" comes from the "${item.source}" source, which this hub hides`)
          }
          return json({
            ok: true,
            skill: { ...item, content: typeof definition.content === 'string' ? definition.content : '' },
          })
        }
        // Registry miss: fall back to the direct user-dsh disk scan.
        const direct = await scanUserSkillsRoot()
        const hit = direct.get(name)
        if (hit === undefined) throw new RouteError(404, 'not-found', `no skill named "${name}" is registered`)
        return json({ ok: true, skill: { ...hit.item, content: hit.body.trim() } })
      } catch (error) {
        return errorResponse(error)
      }
    },
  })

  conn.fetch.register({
    path: '/api/dsh-skill-hub.delete',
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: async (request) => {
      try {
        const body = await readJsonBody(request)
        return json(await deleteSkill(body, ctx))
      } catch (error) {
        return errorResponse(error)
      }
    },
  })

  conn.fetch.register({
    path: '/api/dsh-skill-hub.deleteMany',
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: async (request) => {
      try {
        const body = await readJsonBody(request)
        return json(await deleteManySkills(body, ctx))
      } catch (error) {
        return errorResponse(error)
      }
    },
  })

  conn.fetch.register({
    path: '/api/dsh-skill-hub.importFolder',
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: async (request) => {
      try {
        const body = await readJsonBody(request)
        const result = await importFromFolder(body, request.signal)
        if (result?.ok === true) touchRegistry(requireSkills(ctx))
        return json(result)
      } catch (error) {
        return errorResponse(error)
      }
    },
  })

  conn.fetch.register({
    path: '/api/dsh-skill-hub.importGithub',
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: async (request) => {
      let workdir
      try {
        const body = await readJsonBody(request)
        const { owner, repo, ref, subpath } = parseGithubUrl(body.url)
        const gz = await fetchTarball(owner, repo, ref, request.signal)
        workdir = await mkdtemp(join(tmpdir(), 'dsh-skill-hub-'))
        const extracted = await extractTarGz(gz, workdir)
        const sourceDir = subpath === '' ? extracted.root : join(extracted.root, ...subpath.split('/'))
        if (!sourceDir.startsWith(extracted.root + sep) && sourceDir !== extracted.root) {
          throw new RouteError(400, 'invalid', 'the subpath escapes the repository root')
        }
        if (!existsSync(sourceDir)) {
          throw new RouteError(400, 'not-found', `the repository has no "${subpath}" directory`)
        }
        const result = await importFromFolder({ ...body, path: sourceDir }, request.signal)
        if (result?.ok === true) touchRegistry(requireSkills(ctx))
        return json(result)
      } catch (error) {
        return errorResponse(error)
      } finally {
        if (workdir !== undefined) await rm(workdir, { recursive: true, force: true }).catch(() => {})
      }
    },
  })
  }

  // apply must never throw: a thrown fiber shows up as "Failed to load
  // plugins". The connection service may exist at activation time while its
  // fetch registry is not attached yet (the `inject` contract only waits for
  // the service key), so when registration cannot proceed immediately, poll
  // on a timer until it can — and keep watching for the connection instance
  // being replaced, which would drop previously registered routes.
  let registered = false
  let lastConnection
  const install = () => {
    if (registered) return true
    const connection = ctx.get('connection')
    if (connection === undefined || typeof connection.fetch?.register !== 'function') return false
    registerAll(connection)
    lastConnection = connection
    registered = true
    return true
  }
  const tick = () => {
    try {
      if (registered) {
        const current = ctx.get('connection')
        if (current !== lastConnection) {
          registered = false
          if (install()) warn('connection instance was replaced; skill hub routes re-registered')
        }
        return
      }
      if (install()) warn('connection.fetch registry became ready; skill hub routes registered')
    } catch (error) {
      warn(`deferred registration attempt failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  if (!install()) {
    warn('connection.fetch registry not ready at activation; deferring route registration')
  }
  // Keep watching either way: a replaced connection instance drops the
  // previously registered routes, and the tick re-asserts them.
  const timer = ctx.get('timer')
  const ownsEffect = typeof ctx.effect === 'function'
  if (typeof timer?.interval === 'function') {
    const dispose = timer.interval(tick, 5000)
    if (ownsEffect) ctx.effect(() => dispose, 'dsh-skill-hub: deferred registration')
    return
  }
  const handle = setInterval(tick, 5000)
  handle.unref?.()
  if (ownsEffect) ctx.effect(() => () => clearInterval(handle), 'dsh-skill-hub: deferred registration')
}

// --- delete ------------------------------------------------------------------

/**
 * Remove one skill from the user skills root by moving it into the root's
 * `.trash/` (recoverable; both skill providers ignore dot directories, so the
 * trash never shows up as skills). Only entries inside `~/.dsh/skills` are
 * deletable: the name is matched against entry names and declared names.
 */
async function deleteSkill(body, ctx) {
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!KEBAB_NAME.test(name)) throw new RouteError(400, 'invalid', 'the name field must be a kebab-case skill name')

  const root = dshSkillsRoot()
  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch {
    throw new RouteError(404, 'not-found', `no skill named "${name}" is installed in the user skills root`)
  }

  let victim
  for (const entry of entries) {
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const isDir = entry.isDirectory()
    const isFlatMd = entry.isFile() && entry.name.toLowerCase().endsWith('.md') && entry.name.toLowerCase() !== SKILL_ENTRY.toLowerCase()
    if (!isDir && !isFlatMd) continue
    if (entry.name === name) {
      victim = entry
      break
    }
    const docPath = isDir ? join(root, entry.name, SKILL_ENTRY) : join(root, entry.name)
    const parsed = await parseSkillMarkdown(docPath)
    const declared = typeof parsed?.fields?.name === 'string' ? parsed.fields.name.trim() : ''
    if (declared !== '' && (declared === name || toKebabName(declared) === name)) {
      victim = entry
      break
    }
  }
  if (victim === undefined) {
    throw new RouteError(404, 'not-found', `no skill named "${name}" is installed in the user skills root; only skills in ~/.dsh/skills can be deleted`)
  }

  const trash = join(root, '.trash')
  await mkdir(trash, { recursive: true })
  const destination = join(trash, `${Date.now()}-${victim.name}`)
  await rename(join(root, victim.name), destination)
  touchRegistry(requireSkills(ctx))
  return { ok: true, removed: victim.name, trashedTo: destination }
}

const MAX_BATCH_DELETE = 50

/**
 * Move many user-root skills to the trash in one request. Each name is
 * processed independently: one failure never blocks the rest, and every
 * outcome is reported to the caller.
 */
async function deleteManySkills(body, ctx) {
  const names = Array.isArray(body.names) ? body.names.filter((n) => typeof n === 'string') : []
  if (names.length === 0) throw new RouteError(400, 'invalid', 'the names field must be a non-empty array of kebab-case skill names')
  if (names.length > MAX_BATCH_DELETE) {
    throw new RouteError(400, 'too-many', `at most ${MAX_BATCH_DELETE} skills can be deleted per request`)
  }
  const results = []
  for (const raw of names) {
    const name = raw.trim()
    try {
      const removed = await deleteSkill({ name }, ctx)
      results.push({ name, ok: true, removed: removed.removed })
    } catch (error) {
      results.push({
        name,
        ok: false,
        code: error instanceof RouteError ? error.code : 'internal',
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  const trashed = results.filter((r) => r.ok).length
  touchRegistry(requireSkills(ctx))
  return { ok: true, trashed, failed: results.length - trashed, results }
}

export default { apply }

// --- import engine ----------------------------------------------------------

/** Resolve the DSH user skills root, creating it when missing. */
function dshSkillsRoot() {
  const home = typeof process.env.DSH_HOME === 'string' && process.env.DSH_HOME !== ''
    ? process.env.DSH_HOME
    : join(homedir(), '.dsh')
  return join(home, 'skills')
}

/** A safe entry name: no separators, no dot-dot, no hidden traversal. */
function safeEntryName(name) {
  if (typeof name !== 'string' || name === '' || name === '.' || name === '..') return undefined
  if (name.includes('/') || name.includes('\\') || name.includes(sep)) return undefined
  return name
}

/** Read one skill markdown file's frontmatter name/description (light parser). */
async function readFrontmatter(path) {
  let raw
  try {
    const handle = await readFile(path, { encoding: 'utf8' })
    raw = handle.slice(0, FRONTMATTER_SCAN_BYTES)
  } catch {
    return {}
  }
  if (!raw.startsWith('---')) return {}
  const closing = raw.indexOf('\n---', 3)
  if (closing < 0) return {}
  const block = raw.slice(3, closing)
  const fields = {}
  for (const line of block.split(/\r?\n/)) {
    const match = /^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/.exec(line)
    if (match === null) continue
    const value = match[2].trim().replace(/^["']|["']$/g, '')
    if (value !== '') fields[match[1].toLowerCase()] = value
  }
  return fields
}

/**
 * Discover installable skills under one directory:
 * a single skill when the directory itself holds SKILL.md, otherwise the
 * first level: each subdirectory with SKILL.md, each flat `*.md` file.
 */
async function discoverSkills(dir) {
  const single = join(dir, SKILL_ENTRY)
  if (existsSync(single)) {
    const meta = await readFrontmatter(single)
    return [{ kind: 'directory', src: dir, entry: basename(dir), name: typeof meta.name === 'string' ? meta.name : undefined, description: typeof meta.description === 'string' ? meta.description : undefined }]
  }
  const entries = await readdir(dir, { withFileTypes: true })
  const found = []
  for (const entry of entries) {
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      const skill = join(full, SKILL_ENTRY)
      if (!existsSync(skill)) continue
      const meta = await readFrontmatter(skill)
      found.push({ kind: 'directory', src: full, entry: entry.name, name: meta.name, description: meta.description })
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      const meta = await readFrontmatter(full)
      found.push({ kind: 'file', src: full, entry: entry.name, name: meta.name, description: meta.description })
    }
  }
  return found
}

/** Copy the discovered skills into the user skills root. */
async function importFromFolder(body, signal) {
  void signal
  if (typeof body.path !== 'string' || body.path.trim() === '') {
    throw new RouteError(400, 'invalid', 'the path field is required')
  }
  const source = resolve(body.path.trim())
  let info
  try {
    info = await stat(source)
  } catch {
    throw new RouteError(400, 'not-found', `the folder does not exist: ${source}`)
  }
  if (!info.isDirectory()) throw new RouteError(400, 'invalid', 'the path is not a folder')

  const overwrite = body.overwrite === true
  const found = await discoverSkills(source)
  if (found.length === 0) {
    throw new RouteError(400, 'no-skills', `no skills found in "${source}": a skill is a folder containing ${SKILL_ENTRY}, or a flat *.md file`)
  }

  const root = dshSkillsRoot()
  await mkdir(root, { recursive: true })
  const plan = found.map((item) => ({ ...item, dest: join(root, item.kind === 'file' ? item.entry : item.entry) }))
  const conflicts = []
  for (const item of plan) {
    if (existsSync(item.dest)) conflicts.push(item.entry)
  }
  if (conflicts.length > 0 && !overwrite) {
    return { ok: false, code: 'conflict', error: `these entries already exist: ${conflicts.join(', ')}`, conflicts }
  }

  const imported = []
  const filter = (p) => !/(^|[\\/])(\.git|node_modules)([\\/]|$)/.test(p)
  for (const item of plan) {
    await rm(item.dest, { recursive: true, force: true })
    await cp(item.src, item.dest, { recursive: true, filter })
    imported.push({ entry: item.entry, name: item.name ?? undefined, description: item.description ?? undefined })
  }
  return { ok: true, imported, root }
}

// --- github import ----------------------------------------------------------

/** Parse a github.com repo URL into { owner, repo, ref?, subpath }. */
function parseGithubUrl(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') throw new RouteError(400, 'invalid', 'the url field is required')
  let url
  try {
    url = new URL(raw.trim())
  } catch {
    throw new RouteError(400, 'invalid', 'the url is not a valid URL')
  }
  const host = url.hostname.toLowerCase()
  if (host !== 'github.com' && host !== 'www.github.com') {
    throw new RouteError(400, 'invalid', 'only github.com repository URLs are supported')
  }
  const parts = url.pathname.split('/').filter(Boolean)
  if (parts.length < 2) throw new RouteError(400, 'invalid', 'the URL must name a repository: github.com/<owner>/<repo>')
  const owner = decodeURIComponent(parts[0])
  const repo = decodeURIComponent(parts[1]).replace(/\.git$/u, '')
  if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) {
    throw new RouteError(400, 'invalid', 'owner and repo contain unsupported characters')
  }
  let ref
  let subpath = ''
  if (parts.length >= 3) {
    if (parts[2] !== 'tree' && parts[2] !== 'blob') {
      throw new RouteError(400, 'invalid', 'unsupported URL shape; use github.com/<owner>/<repo> or github.com/<owner>/<repo>/tree/<ref>/<subdir>')
    }
    if (parts.length < 4) throw new RouteError(400, 'invalid', 'the tree URL needs a branch or tag: /tree/<ref>[/<subdir>]')
    ref = decodeURIComponent(parts[3])
    subpath = parts.slice(4).map(decodeURIComponent).join('/')
  }
  return { owner, repo, ref: ref === '' ? undefined : ref, subpath }
}

/** Download one repository tarball from codeload; ref defaults to the repo's default branch. */
async function fetchTarball(owner, repo, ref, signal) {
  const download = async (branch) => {
    const response = await fetch(`https://codeload.github.com/${owner}/${repo}/tar.gz/${encodeURIComponent(branch)}`, {
      signal,
      headers: { 'user-agent': 'dsh-skill-hub' },
      redirect: 'follow',
    })
    if (!response.ok) throw new RouteError(502, 'download', `GitHub returned HTTP ${response.status} for ${owner}/${repo}@${branch}`)
    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.length > MAX_TARBALL_BYTES) {
      throw new RouteError(413, 'too-large', `the repository archive exceeds ${MAX_TARBALL_BYTES / 1024 / 1024} MB`)
    }
    return buffer
  }
  if (ref !== undefined) return await download(ref)
  try {
    const meta = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      signal,
      headers: { 'user-agent': 'dsh-skill-hub', accept: 'application/vnd.github+json' },
    })
    if (meta.ok) {
      const branch = (await meta.json())?.default_branch
      if (typeof branch === 'string' && branch !== '') return await download(branch)
    }
  } catch (error) {
    if (signal?.aborted) throw error
  }
  return await download('HEAD')
}

/** Parse one tar archive buffer into entries ({ path, type, start, size }). */
function parseTar(buffer) {
  const entries = []
  let offset = 0
  let pendingPath
  while (offset + 512 <= buffer.length) {
    const header = buffer.subarray(offset, offset + 512)
    if (header[0] === 0) break
    offset += 512
    const sizeField = header.subarray(124, 136).toString('ascii').replace(/[\0 ]+$/u, '').trim()
    const size = parseInt(sizeField, 8) || 0
    const type = String.fromCharCode(header[156] === 0 ? 48 : header[156])
    const name = header.subarray(0, 100).toString('utf8').replace(/\0+$/u, '')
    const prefix = header.subarray(345, 500).toString('utf8').replace(/\0+$/u, '')
    const dataStart = offset
    const dataEnd = offset + size
    offset = dataEnd + ((512 - (size % 512)) % 512)
    if (offset > buffer.length) break
    if (type === 'x') {
      // pax extended header describing the next entry
      const text = buffer.subarray(dataStart, dataEnd).toString('utf8')
      const match = /(?:^|\n)\d+ path=([^\n]*)/.exec(text)
      pendingPath = match === null ? undefined : match[1]
      continue
    }
    if (type === 'L') {
      pendingPath = buffer.subarray(dataStart, dataEnd).toString('utf8').replace(/\0+$/u, '')
      continue
    }
    let path = (prefix !== '' ? `${prefix}/` : '') + name
    if (pendingPath !== undefined) {
      path = pendingPath
      pendingPath = undefined
    }
    entries.push({ path: normalize(path).replaceAll('\\', '/'), type, start: dataStart, size })
  }
  return entries
}

/** Extract one tar.gz buffer into `workdir`; returns the stripped repo root. */
async function extractTarGz(gz, workdir) {
  let tar
  try {
    tar = gunzipSync(gz)
  } catch {
    throw new RouteError(400, 'invalid', 'the downloaded archive is not a valid gzip tarball')
  }
  const entries = parseTar(tar)
  const files = entries.filter((e) => (e.type === '0' || e.type === '\0') && e.size > 0)
  const dirs = new Set(entries.filter((e) => e.type === '5').map((e) => e.path))
  const first = files[0]?.path ?? dirs.values().next().value
  if (typeof first !== 'string' || first === '') throw new RouteError(400, 'invalid', 'the archive is empty')
  const top = first.split('/')[0]
  if (top === undefined || top === '') throw new RouteError(400, 'invalid', 'the archive has no top-level directory')

  let total = 0
  let count = 0
  const root = join(workdir, 'repo')
  for (const entry of files) {
    const relative = entry.path.slice(top.length + 1)
    if (relative === '' || relative.startsWith('../') || relative.includes('/../') || normalize(relative).includes('..')) continue
    const target = join(root, ...relative.split('/'))
    if (!target.startsWith(root + sep)) continue
    if (entry.size > MAX_EXTRACT_FILE_BYTES) continue
    total += entry.size
    count += 1
    if (total > MAX_EXTRACT_BYTES || count > MAX_EXTRACT_FILES) {
      throw new RouteError(413, 'too-large', 'the repository archive expands beyond the import limits')
    }
    await mkdir(join(target, '..'), { recursive: true })
    await writeFile(target, tar.subarray(entry.start, entry.start + entry.size))
  }
  if (count === 0) throw new RouteError(400, 'invalid', 'the archive contains no readable files')
  return { root }
}
