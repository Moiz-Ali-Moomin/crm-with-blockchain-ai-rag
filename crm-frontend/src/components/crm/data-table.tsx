import { cn } from '@/lib/utils';

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  className?: string;
}

interface DataTableProps<T extends { id: string }> {
  columns: Column<T>[];
  data: T[];
  isLoading?: boolean;
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
}

export function DataTable<T extends { id: string }>({
  columns,
  data,
  isLoading,
  emptyMessage = 'No records found.',
  onRowClick,
}: DataTableProps<T>) {
  return (
    <div className="bg-canvas border border-ui-border rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-ui-border bg-canvas-subtle">
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  'px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-subtle',
                  col.className,
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-ui-border-subtle">
          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <tr key={i} className="animate-pulse" style={{ animationDelay: `${i * 0.05}s` }}>
                {columns.map((col) => (
                  <td key={col.key} className="px-5 py-3">
                    <div className="h-4 bg-shimmer rounded-md" />
                  </td>
                ))}
              </tr>
            ))
          ) : data.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-5 py-16 text-center text-sm text-fg-subtle"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((row) => (
              <tr
                key={row.id}
                onClick={() => onRowClick?.(row)}
                className={cn(
                  'transition-colors duration-150',
                  onRowClick && 'cursor-pointer hover:bg-canvas-subtle',
                )}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn('px-5 py-3 text-[13px] text-fg-secondary', col.className)}
                  >
                    {col.render
                      ? col.render(row)
                      : String((row as any)[col.key] ?? '')}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
