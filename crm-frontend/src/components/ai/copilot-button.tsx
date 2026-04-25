'use client';

import { Brain, X } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface CopilotButtonProps {
  open: boolean;
  onClick: () => void;
}

export function CopilotButton({ open, onClick }: CopilotButtonProps) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      className={cn(
        'w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-colors duration-200',
        open
          ? 'bg-gray-700 hover:bg-gray-600 text-white'
          : 'bg-blue-600 hover:bg-blue-500 text-white',
      )}
      aria-label={open ? 'Close AI Copilot' : 'Open AI Copilot'}
    >
      {open ? <X size={18} /> : <Brain size={18} />}
    </motion.button>
  );
}
