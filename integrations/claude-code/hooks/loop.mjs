import { appendFileSync, copyFileSync, constants, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { createHash, randomUUID } from 'node:crypto'
import { join, resolve } from 'node:path'

export function loopStatePath(event, stateRoot) {
  const projectRoot = resolve(event.cwd || process.cwd())
  const project = createHash('sha256').update(projectRoot).digest('hex').slice(0, 16)
  const session = createHash('sha256').update(String(event.session_id || 'unknown')).digest('hex').slice(0, 16)
  return join(stateRoot || join(projectRoot, '.fd-plan', 'hooks'), project, `${session}.json`)
}

export function processEvent(event, stateRoot) {
  const isTestFailure = event.hook_event_name === 'PostToolUseFailure' && event.tool_name === 'Bash' && /\b(test|spec|check|lint)\b/i.test(event.tool_input?.command || '')
  const isFileEdit = event.hook_event_name === 'PostToolUse' && ['Write', 'Edit', 'MultiEdit'].includes(event.tool_name)
  if (!isTestFailure && !isFileEdit) return { repeatCount: 0, warning: '' }

  const path = loopStatePath(event, stateRoot)
  mkdirSync(join(path, '..'), { recursive: true })
  if (!stateRoot) {
    const project = createHash('sha256').update(resolve(event.cwd || process.cwd())).digest('hex').slice(0, 16)
    const session = createHash('sha256').update(String(event.session_id || 'unknown')).digest('hex').slice(0, 16)
    const legacy = join(process.env.HOME || homedir(), '.fd-plan', 'hooks', project, `${session}.json`)
    if (existsSync(legacy) && !existsSync(path)) {
      try { copyFileSync(legacy, path, constants.COPYFILE_EXCL) }
      catch (error) { if (error.code !== 'EEXIST') throw error }
    }
    const gitignore = join(resolve(event.cwd || process.cwd()), '.gitignore')
    const rules = existsSync(gitignore) ? readFileSync(gitignore, 'utf8') : ''
    if (!rules.split(/\r?\n/).some(line => line.trim() === '/.fd-plan/')) appendFileSync(gitignore, `${rules && !rules.endsWith('\n') ? '\n' : ''}/.fd-plan/\n`)
  }
  let state = { command: '', failure: '', count: 0 }
  try { if (existsSync(path)) state = JSON.parse(readFileSync(path, 'utf8')) } catch {}
  let warning = ''
  if (isTestFailure) {
    const command = event.tool_input.command
    const failure = String(event.error || event.tool_response?.content || '').slice(0, 2000)
    state = { command, failure: createHash('sha256').update(failure).digest('hex'), count: state.command === command && state.failure === createHash('sha256').update(failure).digest('hex') ? state.count + 1 : 1 }
    if (state.count >= 2) warning = 'FlowDeck: repeated identical test failure; inspect the cause or change source before retrying.'
  } else if (isFileEdit) {
    const file = resolve(event.cwd || process.cwd(), event.tool_input?.file_path || '')
    const rel = file.slice(resolve(event.cwd || process.cwd()).length).replace(/^[/\\]/, '')
    if (rel && !/^(?:\.fd-plan|.*(?:^|[/\\])(?:STATE\.md|checkpoint\.json|[^/]*\.log)$)/i.test(rel)) state = { command: '', failure: '', count: 0 }
  }
  const temp = `${path}.${randomUUID()}.tmp`
  writeFileSync(temp, JSON.stringify(state), { mode: 0o600 })
  renameSync(temp, path)
  return { repeatCount: state.count, warning }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  let input = ''
  for await (const chunk of process.stdin) input += chunk
  try {
    const result = processEvent(JSON.parse(input))
    if (result.warning) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: result.warning } }) + '\n')
  } catch (error) { process.stderr.write(`FlowDeck loop guard: ${error.message}\n`) }
}
