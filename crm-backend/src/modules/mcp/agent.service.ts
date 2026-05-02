import { Injectable, Logger, Inject } from '@nestjs/common';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import {
  LLM_PROVIDER,
  AgentCapableLLMProvider,
  AgentAssistantMessage,
  AgentConversationMessage,
  AgentUserMessage,
  AgentToolDefinition,
} from '../ai/providers/llm.interface';
import { ToolRegistryService } from './tool-registry.service';
import { ToolExecutorService, ToolExecutionContext } from './tool-executor.service';
import { McpMetricsService } from './mcp-metrics.service';
import { Tool } from './interfaces/tool.interface';
import { ConversationMemoryService } from './conversation-memory.service';
import { PlannerService } from './planner.service';
import { AiExecutorService, uniqueCallKey } from '../ai/ai-executor.service';
import { StepResult } from './interfaces/plan.interface';

const MAX_ITERATIONS = 3;
const MAX_PLAN_ITERATIONS = 3;

const DEFAULT_SYSTEM = `You are a helpful CRM assistant with access to tools that query live CRM data. \
Use tools when you need specific data. Once you have enough information, respond concisely and directly. \
Do not call the same tool twice with identical arguments.`;

export interface AgentRunInput {
  query: string;
  tenantId: string;
  userId: string;
  userRole: string;
  /** Override the default system prompt */
  system?: string;
  /** Client-generated session ID for multi-turn memory (UUID recommended) */
  sessionId?: string;
  /**
   * Execution mode.
   * - 'reactive' (default): LLM calls tools inline via tool_use stop reason.
   * - 'planner': Dedicated planner LLM creates a step list; executor runs each step; loop repeats.
   */
  mode?: 'reactive' | 'planner';
  /** Propagated from the HTTP request — aborts queued + in-flight LLM calls when client disconnects */
  signal?: AbortSignal;
}

export interface AgentRunResult {
  answer: string;
  iterations: number;
  toolCallsMade: number;
  stoppedDueToMaxIterations: boolean;
}

const tracer = trace.getTracer('crm-mcp');

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);

  constructor(
    @Inject(LLM_PROVIDER) private readonly llm: AgentCapableLLMProvider,
    private readonly toolRegistry: ToolRegistryService,
    private readonly toolExecutor: ToolExecutorService,
    private readonly mcpMetrics: McpMetricsService,
    private readonly memory: ConversationMemoryService,
    private readonly planner: PlannerService,
    private readonly executor: AiExecutorService,
  ) {}

  async run(input: AgentRunInput): Promise<AgentRunResult> {
    const start = Date.now();
    const span = tracer.startSpan('mcp.agent.run', {
      attributes: {
        'crm.tenant_id': input.tenantId,
        'crm.user_id': input.userId,
        'crm.user_role': input.userRole,
        'mcp.query_length': input.query.length,
        'mcp.mode': input.mode ?? 'reactive',
      },
    });

    let result: AgentRunResult | undefined;

    try {
      result =
        input.mode === 'planner'
          ? await this.runWithPlanner(input)
          : await this.runReactive(input);

      span.setAttributes({
        'mcp.iterations': result.iterations,
        'mcp.tool_calls_made': result.toolCallsMade,
        'mcp.stopped_early': result.stoppedDueToMaxIterations,
      });
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      span.recordException(err instanceof Error ? err : new Error(String(err)));
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw err;
    } finally {
      const latencyMs = Date.now() - start;
      span.setAttribute('mcp.agent_latency_ms', latencyMs);
      span.end();

      if (result !== undefined) {
        this.mcpMetrics.recordAgentRun({
          tenantId: input.tenantId,
          latencyMs,
          iterations: result.iterations,
          stoppedEarly: result.stoppedDueToMaxIterations,
        });
      }
    }
  }

  // ── Reactive mode (original) ────────────────────────────────────────────────

  private async runReactive(input: AgentRunInput): Promise<AgentRunResult> {
    if (typeof this.llm.generateWithTools !== 'function') {
      this.logger.error('[Agent] LLM provider does not support tool calling — check ANTHROPIC_API_KEY');
      return {
        answer: 'AI provider is not configured. Set ANTHROPIC_API_KEY to enable agent features.',
        iterations: 0,
        toolCallsMade: 0,
        stoppedDueToMaxIterations: false,
      };
    }

    const execContext: ToolExecutionContext = {
      tenantId: input.tenantId,
      userId: input.userId,
      userRole: input.userRole,
    };

    const agentTools: AgentToolDefinition[] = this.toolRegistry.getAll().map(toolToDefinition);

    const priorTurns = input.sessionId
      ? await this.memory.load(input.tenantId, input.userId, input.sessionId)
      : [];

    const messages: AgentConversationMessage[] = [
      ...priorTurns.map((t): AgentConversationMessage =>
        t.role === 'user'
          ? ({ role: 'user', content: t.content } satisfies AgentUserMessage)
          : ({ role: 'assistant', content: [{ type: 'text', text: t.content }] } satisfies AgentAssistantMessage),
      ),
      { role: 'user', content: input.query },
    ];
    let toolCallsMade = 0;

    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      // Bail immediately if the HTTP client disconnected — no point calling the LLM.
      if (input.signal?.aborted) {
        throw Object.assign(new Error('Request aborted by client'), { name: 'AbortError' });
      }

      this.logger.debug(`[Reactive] Iteration ${iteration + 1}/${MAX_ITERATIONS}`);

      const iterSpan = tracer.startSpan('mcp.agent.iteration', {
        attributes: { 'mcp.iteration': iteration + 1, 'crm.tenant_id': input.tenantId },
      });

      let response: Awaited<ReturnType<AgentCapableLLMProvider['generateWithTools']>>;
      try {
        // Route through AiExecutorService: global semaphore, sequential queue,
        // 300 ms gap, 429 retry (max 2), abort propagation.
        // uniqueCallKey() — every iteration is unique; no dedup across turns.
        response = await this.executor.execute({
          key: uniqueCallKey(),
          fn: () => this.llm.generateWithTools({
            system: input.system ?? DEFAULT_SYSTEM,
            messages,
            tools: agentTools,
            maxTokens: 2048,
            signal: input.signal,
          }),
          signal: input.signal,
        });
        iterSpan.setAttribute('mcp.stop_reason', response.stopReason);
        iterSpan.setStatus({ code: SpanStatusCode.OK });
      } catch (err) {
        iterSpan.recordException(err instanceof Error ? err : new Error(String(err)));
        iterSpan.setStatus({ code: SpanStatusCode.ERROR });
        throw err;
      } finally {
        iterSpan.end();
      }

      messages.push({ role: 'assistant', content: response.content });

      if (response.stopReason === 'end_turn' || response.stopReason === 'max_tokens') {
        const textBlock = response.content.find((b) => b.type === 'text');
        const answer = textBlock?.type === 'text' ? textBlock.text : '';
        if (input.sessionId && answer) {
          await this.memory.append(input.tenantId, input.userId, input.sessionId, input.query, answer);
        }
        return { answer, iterations: iteration + 1, toolCallsMade, stoppedDueToMaxIterations: false };
      }

      if (response.stopReason === 'tool_use') {
        const toolUseBlocks = response.content.filter((b) => b.type === 'tool_use');
        toolCallsMade += toolUseBlocks.length;

        const toolResults = await Promise.all(
          toolUseBlocks.map(async (block) => {
            if (block.type !== 'tool_use') return null;
            this.logger.debug(`[Reactive] → tool "${block.name}" id=${block.id}`);
            const result = await this.toolExecutor.execute(block.name, block.input, execContext);
            const content = result.success ? JSON.stringify(result.data) : `Error: ${result.error}`;
            return { type: 'tool_result' as const, tool_use_id: block.id, content };
          }),
        );

        const validResults = toolResults.filter(
          (r): r is { type: 'tool_result'; tool_use_id: string; content: string } => r !== null,
        );
        messages.push({ role: 'user', content: validResults });
      }
    }

    this.logger.warn(`[Reactive] Max iterations (${MAX_ITERATIONS}) reached — query: "${input.query.slice(0, 80)}"`);

    const lastAssistant = [...messages]
      .reverse()
      .find((m): m is AgentAssistantMessage => m.role === 'assistant');
    const lastText = lastAssistant?.content.find((b) => b.type === 'text');
    const answer =
      lastText?.type === 'text'
        ? lastText.text
        : 'Unable to complete the request within the iteration limit.';

    if (input.sessionId && answer) {
      await this.memory.append(input.tenantId, input.userId, input.sessionId, input.query, answer);
    }

    return { answer, iterations: MAX_ITERATIONS, toolCallsMade, stoppedDueToMaxIterations: true };
  }

  // ── Planner-executor mode ───────────────────────────────────────────────────

  private async runWithPlanner(input: AgentRunInput): Promise<AgentRunResult> {
    const execContext: ToolExecutionContext = {
      tenantId: input.tenantId,
      userId: input.userId,
      userRole: input.userRole,
    };

    const allStepResults: StepResult[] = [];
    let toolCallsMade = 0;

    for (let iteration = 0; iteration < MAX_PLAN_ITERATIONS; iteration++) {
      if (input.signal?.aborted) {
        throw Object.assign(new Error('Request aborted by client'), { name: 'AbortError' });
      }

      this.logger.debug(`[Planner] Iteration ${iteration + 1}/${MAX_PLAN_ITERATIONS}`);

      const planSpan = tracer.startSpan('mcp.planner.plan', {
        attributes: {
          'mcp.plan_iteration': iteration + 1,
          'crm.tenant_id': input.tenantId,
          'mcp.prior_steps': allStepResults.length,
        },
      });

      let plan: Awaited<ReturnType<PlannerService['plan']>>;
      try {
        // Planner LLM call goes through the executor — global semaphore,
        // sequential queue, 300 ms gap, 429 retry (max 2), abort propagation.
        // planner.plan() calls llm.generate() internally; that inner call runs
        // within the executor slot so it is still fully serialized.
        plan = await this.executor.execute({
          key: uniqueCallKey(),
          fn: () => this.planner.plan(input.query, allStepResults, input.signal),
          signal: input.signal,
        });
        planSpan.setAttributes({
          'mcp.plan_steps': plan.steps.length,
          'mcp.plan_done': plan.done,
        });
        planSpan.setStatus({ code: SpanStatusCode.OK });
      } catch (err) {
        planSpan.recordException(err instanceof Error ? err : new Error(String(err)));
        planSpan.setStatus({ code: SpanStatusCode.ERROR });
        throw err;
      } finally {
        planSpan.end();
      }

      this.logger.debug(
        `[Planner] thinking="${plan.thinking.slice(0, 80)}" steps=${plan.steps.length} done=${plan.done}`,
      );

      // Planner signals completion
      if (plan.done) {
        const answer = plan.finalAnswer ?? 'Task completed.';
        if (input.sessionId && answer) {
          await this.memory.append(input.tenantId, input.userId, input.sessionId, input.query, answer);
        }
        return { answer, iterations: iteration + 1, toolCallsMade, stoppedDueToMaxIterations: false };
      }

      // Safety: planner returned no steps but not done
      if (plan.steps.length === 0) {
        this.logger.warn('[Planner] No steps returned and not done — breaking loop');
        break;
      }

      // Execute each step in plan order, respecting dependsOn
      const stepResultMap = new Map<string, StepResult>(allStepResults.map((r) => [r.stepId, r]));

      for (const step of plan.steps) {
        const depsFailed = step.dependsOn.some((depId) => stepResultMap.get(depId)?.success === false);

        if (depsFailed) {
          const skipped: StepResult = {
            stepId: step.id,
            tool: step.tool,
            description: step.description,
            success: false,
            data: null,
            error: 'Skipped — dependency step failed',
          };
          stepResultMap.set(step.id, skipped);
          allStepResults.push(skipped);
          continue;
        }

        if (step.tool) {
          toolCallsMade++;
          this.logger.debug(`[Planner] → step "${step.id}" tool="${step.tool}"`);

          let execResult: Awaited<ReturnType<ToolExecutorService['execute']>>;
          try {
            execResult = await this.toolExecutor.execute(step.tool, step.toolInput, execContext);
          } catch (err) {
            // HTTP exceptions (403, 422) from tool executor — record as failed step
            const message = err instanceof Error ? err.message : String(err);
            execResult = { success: false, error: message };
          }

          const stepResult: StepResult = {
            stepId: step.id,
            tool: step.tool,
            description: step.description,
            success: execResult.success,
            data: execResult.data,
            error: execResult.error,
          };
          stepResultMap.set(step.id, stepResult);
          allStepResults.push(stepResult);
        } else {
          // Synthesis step — no tool call
          const stepResult: StepResult = {
            stepId: step.id,
            tool: null,
            description: step.description,
            success: true,
            data: null,
          };
          stepResultMap.set(step.id, stepResult);
          allStepResults.push(stepResult);
        }
      }
    }

    // Max iterations reached
    this.logger.warn(
      `[Planner] Max iterations (${MAX_PLAN_ITERATIONS}) reached — query: "${input.query.slice(0, 80)}"`,
    );

    const collectedData = allStepResults
      .filter((r) => r.success && r.data != null)
      .map((r) => JSON.stringify(r.data))
      .join('\n');

    const answer =
      collectedData.trim() || 'Unable to complete the request within the iteration limit.';

    if (input.sessionId && answer) {
      await this.memory.append(input.tenantId, input.userId, input.sessionId, input.query, answer);
    }

    return { answer, iterations: MAX_PLAN_ITERATIONS, toolCallsMade, stoppedDueToMaxIterations: true };
  }
}

function toolToDefinition(tool: Tool): AgentToolDefinition {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: {
      type: 'object',
      properties: tool.parameters.properties as Record<string, unknown>,
      ...(tool.parameters.required ? { required: tool.parameters.required } : {}),
    },
  };
}
