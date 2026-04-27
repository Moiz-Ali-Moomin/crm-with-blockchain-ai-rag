import { Injectable, Logger, Inject } from '@nestjs/common';
import { LLM_PROVIDER, LLMProvider } from '../ai/providers/llm.interface';
import { ToolRegistryService } from './tool-registry.service';
import { AgentPlan, StepResult } from './interfaces/plan.interface';

@Injectable()
export class PlannerService {
  private readonly logger = new Logger(PlannerService.name);

  constructor(
    @Inject(LLM_PROVIDER) private readonly llm: LLMProvider,
    private readonly toolRegistry: ToolRegistryService,
  ) {}

  /**
   * MUST be called exclusively through AiExecutorService.execute() — never
   * call plan() directly. The executor provides the global semaphore, sequential
   * queue, 429 retry, and abort handling that wrap this call.
   */
  async plan(query: string, priorResults: StepResult[], signal?: AbortSignal): Promise<AgentPlan> {
    const tools = this.toolRegistry.getAll();

    const toolList = tools
      .map((t) => `- ${t.name}: ${t.description}\n  Parameters: ${JSON.stringify(t.parameters)}`)
      .join('\n');

    const toolNames = tools.map((t) => t.name).join(', ');

    const priorContext =
      priorResults.length > 0
        ? `\nCompleted steps so far:\n${priorResults
            .map(
              (r) =>
                `[Step ${r.stepId}] ${r.description}` +
                (r.success
                  ? `\n  Result: ${JSON.stringify(r.data)}`
                  : `\n  Error: ${r.error}`),
            )
            .join('\n\n')}`
        : '';

    const prompt = `You are a planning agent for a CRM assistant. Break the user's query into discrete, executable steps using the available tools.

Available tools:
${toolList}
${priorContext}

User query: "${query}"

Respond with ONLY valid JSON — no markdown, no text outside the JSON object:
{
  "thinking": "<your reasoning about how to answer the query>",
  "steps": [
    {
      "id": "<short_unique_id>",
      "description": "<what this step accomplishes>",
      "tool": "<tool_name or null>",
      "toolInput": {},
      "dependsOn": []
    }
  ],
  "done": false,
  "finalAnswer": null
}

Rules:
- "tool" must be one of [${toolNames}] or null (null = reasoning step, no API call)
- "dependsOn" is an array of step IDs whose results are needed as input for this step
- If you already have enough information to answer (check completed steps above), set "done": true, "steps": [], and write the final answer in "finalAnswer"
- Keep steps minimal — only what is strictly necessary`;

    // Signal check before the actual API call — abort propagation from executor.
    if (signal?.aborted) {
      throw Object.assign(new Error('Request aborted before planner LLM call'), { name: 'AbortError' });
    }
    const raw = await this.llm.generate({ prompt, signal });
    return this.parsePlan(raw);
  }

  private parsePlan(raw: string): AgentPlan {
    try {
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('No JSON object in planner output');

      const plan = JSON.parse(match[0]) as Partial<AgentPlan>;

      return {
        thinking: typeof plan.thinking === 'string' ? plan.thinking : '',
        steps: Array.isArray(plan.steps)
          ? plan.steps.map((s) => ({
              id: String(s.id ?? Math.random()),
              description: String(s.description ?? ''),
              tool: s.tool ?? null,
              toolInput:
                s.toolInput && typeof s.toolInput === 'object'
                  ? (s.toolInput as Record<string, unknown>)
                  : {},
              dependsOn: Array.isArray(s.dependsOn) ? s.dependsOn.map(String) : [],
            }))
          : [],
        done: plan.done === true,
        finalAnswer: typeof plan.finalAnswer === 'string' ? plan.finalAnswer : null,
      };
    } catch (err) {
      this.logger.warn(
        `Planner JSON parse failed — treating raw text as final answer. Error: ${err instanceof Error ? err.message : String(err)}`,
      );
      // Fallback: surface raw LLM text as the answer
      return { thinking: '', steps: [], done: true, finalAnswer: raw };
    }
  }
}
