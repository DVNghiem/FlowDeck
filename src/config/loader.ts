export { loadFlowDeckConfig, resolveAgentModels, parseModelSpec, DEFAULT_CONFIG } from './agent-models';
export type { FlowDeckConfig, AgentModelConfig } from './agent-models';

import type { FlowDeckConfig } from './agent-models';

export interface ResolvedDesignFirstConfig {
  enabled: boolean;
  enforcement: "strict" | "advisory";
  requireApprovalBeforeImplementation: boolean;
  modelOverrides: Record<string, string>;
  defaultSkillsByTaskType: Record<string, string[]>;
}

export function resolveDesignFirstConfig(config: FlowDeckConfig): ResolvedDesignFirstConfig {
  return {
    enabled: config.designFirst?.enabled ?? true,
    enforcement: config.designFirst?.enforcement ?? "strict",
    requireApprovalBeforeImplementation: config.designFirst?.requireApprovalBeforeImplementation ?? true,
    modelOverrides: config.designFirst?.modelOverrides ?? {},
    defaultSkillsByTaskType: config.designFirst?.defaultSkillsByTaskType ?? {
      "landing-page": ["landing-page-design", "wireframe-planning", "design-system-definition", "frontend-handoff"],
      "dashboard": ["dashboard-design", "ui-ux-planning", "wireframe-planning", "responsive-review"],
      "admin-panel": ["ui-ux-planning", "wireframe-planning", "design-system-definition", "frontend-handoff"],
      "app-screen": ["app-shell-design", "ui-ux-planning", "wireframe-planning", "responsive-review"],
      "general-ui": ["ui-ux-planning", "wireframe-planning", "design-system-definition", "frontend-handoff"],
    },
  };
}
