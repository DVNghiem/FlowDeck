import { accessSync, constants, existsSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync, unlinkSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'

const [, , action, ...args] = process.argv
const field = (content, key) => content.match(new RegExp(`^${key}:\\s*(.*)$`, 'm'))?.[1]?.replace(/^['"]|['"]$/g, '') ?? ''
const canonicalRoot = (() => { try { return realpathSync(process.cwd()) } catch { return resolve(process.cwd()) } })()
const projectSlug = basename(canonicalRoot).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'project'
const hash = createHash('sha256').update(canonicalRoot).digest('hex').slice(0, 12)
const canonicalPlanningRoot = join(homedir(), '.fd-plan', `${projectSlug}-${hash}`)
const legacyRoot = join(homedir(), '.fd-plan', basename(canonicalRoot))
const legacyOwned = () => {
  const path = join(legacyRoot, 'STATE.md')
  if (!existsSync(path)) return false
  try {
    const content = readFileSync(path, 'utf8')
    const owner = field(content, 'project_root')
    const configPath = join(legacyRoot, 'config.json')
    const config = existsSync(configPath) ? JSON.parse(readFileSync(configPath, 'utf8')) : {}
    if (owner && resolve(owner) === canonicalRoot) return true
    if (typeof config.project_root === 'string' && resolve(config.project_root) === canonicalRoot) return true
    const plan = field(content, 'plan_file')
    if (!isAbsolute(plan) || !existsSync(plan)) return false
    const offset = relative(canonicalRoot, realpathSync(plan))
    return offset !== '' && offset !== '..' && !offset.startsWith(`..${sep}`) && !isAbsolute(offset)
  } catch { return false }
}
const root = existsSync(canonicalPlanningRoot) ? canonicalPlanningRoot : legacyOwned() ? legacyRoot : canonicalPlanningRoot
const stateFile = join(root, 'STATE.md')
const checkpointFile = join(root, 'checkpoint.json')
const allowedStatus = new Set(['planned', 'in_progress', 'complete', 'blocked'])
const allowedVerification = new Set(['verified', 'not_verified'])
const slug = value => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64)
const atomicWrite = (path, content) => {
  const temp = `${path}.${randomUUID()}.tmp`
  writeFileSync(temp, content, { mode: 0o600 })
  try { renameSync(temp, path) } catch (error) { unlinkSync(temp); throw error }
}
const upsert = (content, key, value) => {
  const line = `${key}: ${value}`
  const regex = new RegExp(`^${key}:.*$`, 'm')
  return regex.test(content) ? content.replace(regex, line) : `${content.trimEnd()}\n${line}\n`
}
const load = () => {
  if (!existsSync(stateFile)) {
    if (root === canonicalPlanningRoot && existsSync(join(legacyRoot, 'STATE.md'))) throw new Error(`Legacy state exists at ${legacyRoot} but has no project ownership marker; leave it untouched and migrate it manually before resuming`)
    throw new Error('No planning workspace. Run /flowdeck:fd-task first.')
  }
  const content = readFileSync(stateFile, 'utf8')
  const topic = slug(field(content, 'topic'))
  const rawStatus = field(content, 'status')
  return { content, topic, status: rawStatus === 'verified' ? 'in_progress' : rawStatus === 'ready' ? 'planned' : rawStatus, verification: field(content, 'verification') || (rawStatus === 'verified' ? 'verified' : 'not_verified') }
}
const readCheckpoint = () => {
  if (!existsSync(checkpointFile)) return null
  try { return JSON.parse(readFileSync(checkpointFile, 'utf8')) } catch { return { unreadable: true } }
}
const result = value => process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
try {
  if (action === 'init') {
    const topic = slug(args.join(' '))
    if (!topic) throw new Error('A nonempty task description is required')
    mkdirSync(join(root, topic), { recursive: true })
    const base = existsSync(stateFile) ? readFileSync(stateFile, 'utf8') : `---\nphase: 1\nstatus: planned\nplan_confirmed: false\nsteps_complete: []\nsteps_pending: []\n---\n\n# Planning State\n`
    let next = upsert(base, 'topic', `"${topic}"`)
    next = upsert(next, 'status', 'planned')
    next = upsert(next, 'verification', 'not_verified')
    next = upsert(next, 'schema_version', '2')
    next = upsert(next, 'project_root', JSON.stringify(canonicalRoot))
    next = upsert(next, 'last_updated', new Date().toISOString())
    atomicWrite(stateFile, next)
    result({ topic, root, task: join(root, topic, 'task.md') })
  } else if (action === 'status') {
    const state = load()
    const topic = slug(args[0] ?? state.topic)
    if (!topic) throw new Error('No active topic. Run /flowdeck:fd-task first.')
    const dir = join(root, topic)
    if (!existsSync(dir)) throw new Error(`Topic '${topic}' not found`)
    const artifacts = Object.fromEntries(['task.md', 'architecture.md', 'affect.md', 'plan.md'].map(name => [name, existsSync(join(dir, name))]))
    const check = readCheckpoint()
    const fdxPath = process.env.FLOWDECK_FDX_PATH || 'fdx'
    const fdx = spawnSync(fdxPath, ['--version'], { encoding: 'utf8', timeout: 3000 })
    const claude = spawnSync('claude', ['--version'], { encoding: 'utf8', timeout: 3000 })
    const guard = join(import.meta.dirname, '..', 'hooks', 'guard.sh')
    let executable = false
    try { accessSync(guard, constants.X_OK); executable = true } catch { /* reported below */ }
    result({ root, topic, status: state.status, verification: state.verification, workflowClass: field(state.content, 'workflowClass') || 'FULL', artifacts, checkpoint: check, legacyAmbiguity: root === canonicalPlanningRoot && existsSync(join(legacyRoot, 'STATE.md')) && !legacyOwned() ? `Unattributed legacy state at ${legacyRoot} was left untouched` : null, fdx: fdx.status === 0 ? { available: true, version: fdx.stdout.trim() } : { available: false, reason: fdx.error?.message || fdx.stderr?.trim() || 'fdx unavailable' }, node: process.execPath, claude: claude.status === 0 ? claude.stdout.trim() : 'unavailable', guard: { present: existsSync(guard), executable, loaded: 'unknown' }, protection: 'Hook file presence does not prove host loading or enforceability; use host permissions and sandbox for stronger control' })
  } else if (action === 'checkpoint') {
    const state = load()
    const existing = readCheckpoint()
    if (existing?.unreadable) throw new Error('checkpoint.json is unreadable; repair it before saving')
    const next = { ...existing, version: '2', project: basename(resolve(process.cwd())), topic: state.topic, saved_at: new Date().toISOString(), current_command: args[0] ?? existing.current_command ?? 'fd-task', current_stage: args[1] ?? existing.current_stage ?? 'in_progress', status: state.status, verification: state.verification }
    atomicWrite(checkpointFile, JSON.stringify(next, null, 2) + '\n')
    result(next)
  } else if (action === 'read') {
    const state = load()
    result({ root, topic: state.topic, status: state.status, verification: state.verification, checkpoint: readCheckpoint() })
  } else if (action === 'set') {
    const [key, value] = args
    if (!['status', 'verification', 'workflowClass', 'plan_confirmed', 'last_action', 'next_action'].includes(key)) throw new Error('Unsupported field')
    if (key === 'status' && !allowedStatus.has(value)) throw new Error('Invalid status')
    if (key === 'verification' && !allowedVerification.has(value)) throw new Error('Invalid verification')
    if (key === 'workflowClass' && !['FAST', 'STANDARD', 'FULL'].includes(value)) throw new Error('Invalid workflow class')
    if (key === 'plan_confirmed' && !['true', 'false'].includes(value)) throw new Error('Invalid plan confirmation')
    const state = load()
    let next = upsert(state.content, key, key === 'plan_confirmed' ? value : JSON.stringify(value))
    next = upsert(next, 'last_updated', new Date().toISOString())
    atomicWrite(stateFile, next)
    result({ key, value })
  } else throw new Error('Usage: state.mjs init <topic> | status [topic] | checkpoint [command] [stage] | read | set <field> <value>')
} catch (error) {
  process.stderr.write(`FlowDeck: ${error.message}\n`)
  process.exitCode = 1
}
