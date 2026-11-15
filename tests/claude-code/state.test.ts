import { describe, expect, it } from 'bun:test'
import { mkdtempSync, mkdirSync, readFileSync, existsSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const script = resolve('integrations/claude-code/scripts/state.mjs')

function fixture() {
  const home = mkdtempSync(join(tmpdir(), 'flowdeck-claude-'))
  const cwd = join(home, 'repo')
  mkdirSync(cwd)
  const run = (...args: string[]) => spawnSync(process.execPath, [script, ...args], { cwd, env: { ...process.env, HOME: home, FLOWDECK_FDX_PATH: '/nonexistent/fdx' }, encoding: 'utf8' })
  return { home, cwd, run }
}

describe('Claude plugin state roundtrip', () => {
  it('initializes canonical state and reads it without touching Claude settings', () => {
    const { home, run } = fixture()
    const init = run('init', 'Add payment checks')
    expect(init.status).toBe(0)
    const statePath = join(JSON.parse(init.stdout).root, 'STATE.md')
    expect(readFileSync(statePath, 'utf8')).toContain('topic: "add-payment-checks"')
    const status = JSON.parse(run('status').stdout)
    expect(status.topic).toBe('add-payment-checks')
    expect(status.fdx.available).toBe(false)
    expect(existsSync(join(home, '.claude', 'settings.json'))).toBe(false)
  })

  it('persists verification independently and checkpoints atomically', () => {
    const { home, run } = fixture()
    const root = JSON.parse(run('init', 'Fix parser').stdout).root
    expect(run('set', 'verification', 'verified').status).toBe(0)
    expect(run('set', 'status', 'verified').status).toBe(1)
    expect(run('checkpoint', 'fd-verify', 'complete').status).toBe(0)
    const checkpoint = JSON.parse(readFileSync(join(root, 'checkpoint.json'), 'utf8'))
    expect(checkpoint.verification).toBe('verified')
    expect(checkpoint.status).toBe('planned')
    expect(checkpoint.current_stage).toBe('complete')
  })

  it('migrates an owned legacy task and reads its four artifacts', () => {
    const { home, cwd, run } = fixture()
    const root = join(home, '.fd-plan', 'repo')
    const topic = join(root, 'legacy-task')
    mkdirSync(topic, { recursive: true })
    writeFileSync(join(root, 'STATE.md'), `---\nproject_root: "${cwd}"\ntopic: legacy-task\nplan_file: "${join(topic, 'plan.md')}"\nstatus: verified\n---\n`)
    for (const name of ['task.md', 'architecture.md', 'affect.md', 'plan.md']) writeFileSync(join(topic, name), '# Existing\n')
    const status = JSON.parse(run('status').stdout)
    expect(status.root).toBe(join(cwd, '.fd-plan'))
    expect(status.status).toBe('in_progress')
    expect(status.verification).toBe('verified')
    expect(Object.values(status.artifacts)).toEqual([true, true, true, true])
    expect(readFileSync(join(status.root, 'STATE.md'), 'utf8')).toContain(`plan_file: "${join(status.root, 'legacy-task', 'plan.md')}"`)
  })

  it('stores plan confirmation as a boolean scalar compatible with OpenCode', () => {
    const { run } = fixture()
    const root = JSON.parse(run('init', 'Feature').stdout).root
    expect(run('set', 'plan_confirmed', 'true').status).toBe(0)
    expect(readFileSync(join(root, 'STATE.md'), 'utf8')).toContain('plan_confirmed: true')
  })

  it('does not reuse an unattributed legacy basename state', () => {
    const { home, run } = fixture()
    const legacy = join(home, '.fd-plan', 'repo')
    mkdirSync(legacy, { recursive: true })
    writeFileSync(join(legacy, 'STATE.md'), '---\ntopic: someone-else\n---\n')
    const init = JSON.parse(run('init', 'Own task').stdout)
    expect(init.root).not.toBe(legacy)
    expect(readFileSync(join(legacy, 'STATE.md'), 'utf8')).toContain('someone-else')
    expect(JSON.parse(run('status').stdout).legacyAmbiguity).toContain('Unattributed legacy state')
  })

  it('migrates legacy state with an owning config marker without deleting the source', () => {
    const { home, cwd, run } = fixture()
    const legacy = join(home, '.fd-plan', 'repo')
    mkdirSync(join(legacy, 'old-task'), { recursive: true })
    writeFileSync(join(legacy, 'STATE.md'), '---\ntopic: old-task\nstatus: planned\n---\n')
    writeFileSync(join(legacy, 'config.json'), JSON.stringify({ project_root: cwd }))
    const status = JSON.parse(run('status').stdout)
    expect(status.root).toBe(join(cwd, '.fd-plan'))
    expect(existsSync(join(status.root, 'old-task', 'STATE.md'))).toBe(false)
    expect(readFileSync(join(status.root, 'STATE.md'), 'utf8')).toContain('old-task')
    expect(readFileSync(join(legacy, 'STATE.md'), 'utf8')).toContain('old-task')
  })

  it('keeps existing project-local files when migrating legacy state', () => {
    const { home, cwd, run } = fixture()
    const legacy = join(home, '.fd-plan', 'repo')
    const local = join(cwd, '.fd-plan')
    mkdirSync(legacy, { recursive: true })
    mkdirSync(local, { recursive: true })
    writeFileSync(join(legacy, 'STATE.md'), 'legacy state')
    writeFileSync(join(legacy, 'config.json'), JSON.stringify({ project_root: cwd }))
    writeFileSync(join(local, 'STATE.md'), 'local state')
    writeFileSync(join(legacy, 'extra.md'), 'legacy artifact')
    writeFileSync(join(cwd, '.gitignore'), 'node_modules/\n')
    run('status')
    expect(readFileSync(join(local, 'STATE.md'), 'utf8')).toBe('local state')
    expect(readFileSync(join(local, 'extra.md'), 'utf8')).toBe('legacy artifact')
    expect(readFileSync(join(cwd, '.gitignore'), 'utf8')).toContain('/.fd-plan/')
    expect(readFileSync(join(cwd, '.gitignore'), 'utf8')).toContain('node_modules/')
  })
})
