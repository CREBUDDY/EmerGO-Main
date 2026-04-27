import React from 'react';
import { useLoading } from '../contexts/LoadingContext';
import { motion, AnimatePresence } from 'motion/react';
import { Loader2 } from 'lucide-react';

export const GlobalLoader: React.FC = () => {
  const { loadingState } = useLoading();

  return (
    <AnimatePresence>
      {loadingState.isLoading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-card/90 dark:bg-black/60 backdrop-blur-sm"
        >
          <div className="bg-[#111214] border border-border rounded-xl p-6 flex flex-col items-center gap-4 shadow-2xl min-w-[200px]">
            <Loader2 className="w-8 h-8 text-red-500 animate-spin" />
            <p className="text-foreground/90 text-sm font-medium tracking-wide text-center">
              {loadingState.message || 'Loading...'}
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
