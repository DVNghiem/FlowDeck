import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { FlowDeckConfig } from './schema';

const CONFIG_FILENAME = 'flowdeck.json';

function getGlobalConfigDir(): string {
  return (
    process.env.OPENCODE_CONFIG_DIR ||
    (process.env.XDG_CONFIG_HOME
      ? join(process.env.XDG_CONFIG_HOME, 'opencode')
      : join(homedir(), '.config', 'opencode'))
  );
}

/**
 * Load flowdeck.json config. Project-level config takes precedence over global.
 * Returns an empty config if no file is found.
 */
export function loadFlowDeckConfig(directory?: string): FlowDeckConfig {
  const candidates: string[] = [];

  if (directory) {
    candidates.push(join(directory, '.opencode', CONFIG_FILENAME));
  }
  candidates.push(join(getGlobalConfigDir(), CONFIG_FILENAME));

  for (const configPath of candidates) {
    if (existsSync(configPath)) {
      try {
        const content = readFileSync(configPath, 'utf-8');
        return JSON.parse(content) as FlowDeckConfig;
      } catch {
        console.warn(`[flowdeck] Failed to load config from ${configPath}`);
      }
    }
  }

  return {};
}
