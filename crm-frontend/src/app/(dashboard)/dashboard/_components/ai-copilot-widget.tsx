'use client';

/**
 * Re-exports the shared CopilotWidget as FloatingAiCopilot so the dashboard
 * page import stays unchanged while the implementation lives in components/ai/.
 */
export { CopilotWidget as FloatingAiCopilot } from '@/components/ai/copilot-widget';

/**
 * Legacy panel export kept for any direct usages elsewhere in the dashboard.
 * New code should import CopilotPanel from @/components/ai/copilot-panel directly.
 */
export { CopilotPanel as AiCopilotWidget } from '@/components/ai/copilot-panel';
