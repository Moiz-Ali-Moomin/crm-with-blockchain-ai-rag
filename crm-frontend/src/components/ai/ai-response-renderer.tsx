'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';

/**
 * Renders AI-generated Markdown content safely, with full GFM support
 * (tables, task lists, strikethrough). No dangerouslySetInnerHTML.
 *
 * variant="default"  — full-page AI tab, larger type scale
 * variant="compact"  — floating copilot widget, tighter sizing
 */

interface AIResponseRendererProps {
  content: string;
  variant?: 'default' | 'compact';
  className?: string;
}

export function AIResponseRenderer({
  content,
  variant = 'default',
  className,
}: AIResponseRendererProps) {
  const compact = variant === 'compact';

  return (
    <div className={cn('min-w-0', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // ── Headings ──────────────────────────────────────────────────────
          h1: ({ children }) => (
            <h1
              className={cn(
                'font-semibold text-fg mb-1 first:mt-0',
                compact ? 'text-sm mt-2' : 'text-base mt-3',
              )}
            >
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2
              className={cn(
                'font-semibold text-fg mb-1 first:mt-0',
                compact ? 'text-sm mt-2' : 'text-sm mt-3',
              )}
            >
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3
              className={cn(
                'font-medium text-fg first:mt-0',
                compact ? 'text-xs mt-1.5 mb-0.5' : 'text-sm mt-2 mb-0.5',
              )}
            >
              {children}
            </h3>
          ),

          // ── Paragraph ─────────────────────────────────────────────────────
          p: ({ children }) => (
            <p
              className={cn(
                'last:mb-0 leading-relaxed',
                compact ? 'mb-1 text-sm' : 'mb-2',
              )}
            >
              {children}
            </p>
          ),

          // ── Lists ─────────────────────────────────────────────────────────
          ul: ({ children }) => (
            <ul
              className={cn(
                'pl-4 list-disc',
                compact ? 'mb-1 space-y-0.5' : 'mb-2 space-y-0.5',
              )}
            >
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol
              className={cn(
                'pl-4 list-decimal',
                compact ? 'mb-1 space-y-0.5' : 'mb-2 space-y-0.5',
              )}
            >
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className={cn('leading-relaxed', compact && 'text-sm')}>
              {children}
            </li>
          ),

          // ── Inline emphasis ───────────────────────────────────────────────
          strong: ({ children }) => (
            <strong className="font-semibold text-fg">{children}</strong>
          ),
          em: ({ children }) => (
            <em className="italic text-fg-secondary">{children}</em>
          ),
          del: ({ children }) => (
            <del className="line-through text-fg-muted">{children}</del>
          ),

          // ── Code ──────────────────────────────────────────────────────────
          // Block code: className is "language-xxx"
          // Inline code: no className
          code: ({ className: codeClass, children }) => {
            const isBlock = !!codeClass?.startsWith('language-');
            if (isBlock) {
              return (
                <code className="text-xs font-mono text-blue-300">{children}</code>
              );
            }
            return (
              <code className="rounded bg-canvas-subtle px-1 py-0.5 font-mono text-xs text-indigo-600">
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre
              className={cn(
                'overflow-x-auto rounded-lg bg-slate-900 font-mono text-xs',
                compact ? 'mb-1 p-2' : 'mb-2 p-3',
              )}
            >
              {children}
            </pre>
          ),

          // ── Block elements ────────────────────────────────────────────────
          blockquote: ({ children }) => (
            <blockquote
              className={cn(
                'border-l-2 border-indigo-400 italic text-fg-secondary',
                compact ? 'mb-1 pl-2' : 'mb-2 pl-3',
              )}
            >
              {children}
            </blockquote>
          ),
          hr: () => <hr className="my-3 border-ui-border" />,

          // ── Tables (requires remark-gfm) ──────────────────────────────────
          table: ({ children }) => (
            <div
              className={cn(
                'overflow-x-auto rounded-lg border border-ui-border',
                compact ? 'mb-1' : 'mb-3',
              )}
            >
              <table className="w-full border-collapse text-xs">{children}</table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-canvas-subtle border-b border-ui-border">
              {children}
            </thead>
          ),
          tbody: ({ children }) => (
            <tbody className="divide-y divide-ui-border">{children}</tbody>
          ),
          tr: ({ children }) => (
            <tr className="hover:bg-canvas-subtle transition-colors duration-100">
              {children}
            </tr>
          ),
          th: ({ children }) => (
            <th className="px-3 py-2 text-left font-semibold text-fg-secondary whitespace-nowrap">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-3 py-2 text-fg-secondary">{children}</td>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
