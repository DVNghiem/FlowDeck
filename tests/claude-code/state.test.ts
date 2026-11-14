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

  it('reads an existing four-artifact task and legacy verified status', () => {
    const { home, cwd, run } = fixture()
    const root = join(home, '.fd-plan', 'repo')
    const topic = join(root, 'legacy-task')
    mkdirSync(topic, { recursive: true })
    writeFileSync(join(root, 'STATE.md'), `---\nproject_root: "${cwd}"\ntopic: legacy-task\nstatus: verified\n---\n`)
    for (const name of ['task.md', 'architecture.md', 'affect.md', 'plan.md']) writeFileSync(join(topic, name), '# Existing\n')
    const status = JSON.parse(run('status').stdout)
    expect(status.status).toBe('in_progress')
    expect(status.verification).toBe('verified')
    expect(Object.values(status.artifacts)).toEqual([true, true, true, true])
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

  it('reuses legacy state with an owning config marker', () => {
    const { home, cwd, run } = fixture()
    const legacy = join(home, '.fd-plan', 'repo')
    mkdirSync(join(legacy, 'old-task'), { recursive: true })
    writeFileSync(join(legacy, 'STATE.md'), '---\ntopic: old-task\nstatus: planned\n---\n')
    writeFileSync(join(legacy, 'config.json'), JSON.stringify({ project_root: cwd }))
    expect(JSON.parse(run('status').stdout).root).toBe(legacy)
  })
})
