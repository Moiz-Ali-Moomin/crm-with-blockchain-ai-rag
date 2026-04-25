'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { CopilotPanel } from './copilot-panel';
import { CopilotButton } from './copilot-button';
import { useCopilotStore } from '@/store/copilot.store';

const PAGE_MAP: Record<string, string> = {
  deals:     'deals',
  contacts:  'contacts',
  leads:     'leads',
  tickets:   'tickets',
  tasks:     'tasks',
  dashboard: 'dashboard',
};

function inferContext(pathname: string): { page?: string; entityId?: string } {
  const segments = pathname.split('/').filter(Boolean);
  const page = segments.find((s) => PAGE_MAP[s]);
  if (!page) return {};
  const pageIdx = segments.indexOf(page);
  const entityId = segments[pageIdx + 1] ?? undefined;
  return { page, entityId };
}

export function CopilotWidget() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const setContext = useCopilotStore((s) => s.setContext);

  useEffect(() => {
    setContext(inferContext(pathname));
  }, [pathname, setContext]);

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0, transition: { duration: 0.2 } }}
            exit={{ opacity: 0, scale: 0.95, y: 8, transition: { duration: 0.15 } }}
            className="w-80 h-[500px] shadow-2xl rounded-xl overflow-hidden border border-ui-border"
          >
            <CopilotPanel compact onOpenFull={() => setOpen(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      <CopilotButton open={open} onClick={() => setOpen((o) => !o)} />
    </div>
  );
}
