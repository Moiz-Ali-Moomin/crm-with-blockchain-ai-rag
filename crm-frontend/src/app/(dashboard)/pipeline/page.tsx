'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { pipelinesApi } from '@/lib/api/pipelines.api';
import { queryKeys } from '@/lib/query/query-keys';
import { KanbanBoard } from '@/components/crm/kanban/kanban-board';
import { cn } from '@/lib/utils';

export default function PipelinePage() {
  const { data: pipelines, isLoading } = useQuery({
    queryKey: queryKeys.pipelines.all,
    queryFn: pipelinesApi.getAll,
  });

  const [activePipelineId, setActivePipelineId] = useState<string | null>(null);

  const selectedId = activePipelineId ?? pipelines?.find((p) => p.isDefault)?.id ?? pipelines?.[0]?.id ?? '';

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-10 w-64 bg-gray-100 rounded animate-pulse" />
        <div className="flex gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="w-72 h-64 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!pipelines?.length) {
    return <p className="text-sm text-gray-400">No pipelines found. Create one in Settings.</p>;
  }

  return (
    <div className="space-y-4">
      {/* Pipeline selector tabs */}
      <div className="flex items-center gap-1 border-b border-gray-200">
        {pipelines.map((pipeline) => (
          <button
            key={pipeline.id}
            onClick={() => setActivePipelineId(pipeline.id)}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
              selectedId === pipeline.id
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-400 hover:text-gray-700'
            )}
          >
            {pipeline.name}
            {pipeline.isDefault && (
              <span className="ml-1 text-xs text-gray-400">(default)</span>
            )}
          </button>
        ))}
      </div>

      {selectedId && <KanbanBoard pipelineId={selectedId} />}
    </div>
  );
}
