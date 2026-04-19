import { cn } from '@/lib/utils';

interface ScoreBadgeProps {
  score: number;
}

export function ScoreBadge({ score }: ScoreBadgeProps) {
  const color =
    score <= 40
      ? 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400'
      : score <= 70
        ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400'
        : 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400';

  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs font-semibold',
        color
      )}
    >
      {score}
    </span>
  );
}
