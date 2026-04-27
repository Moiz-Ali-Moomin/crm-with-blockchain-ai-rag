import { Module, forwardRef } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
// AiExecutorService is exported from AiModule and injected into AgentService.
import { DealsModule } from '../deals/deals.module';
import { TasksModule } from '../tasks/tasks.module';
import { ToolRegistryService } from './tool-registry.service';
import { ToolPermissionService } from './tool-permission.service';
import { ToolExecutorService } from './tool-executor.service';
import { AgentService } from './agent.service';
import { McpMetricsService } from './mcp-metrics.service';
import { ConversationMemoryService } from './conversation-memory.service';
import { PlannerService } from './planner.service';

@Module({
  imports: [forwardRef(() => AiModule), DealsModule, TasksModule],
  providers: [ToolRegistryService, ToolPermissionService, ToolExecutorService, AgentService, McpMetricsService, ConversationMemoryService, PlannerService],
  exports: [ToolRegistryService, ToolPermissionService, ToolExecutorService, AgentService, McpMetricsService, ConversationMemoryService, PlannerService],
})
export class McpModule {}

