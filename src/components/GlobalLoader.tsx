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
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/80 dark:bg-background/80 backdrop-blur-md"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            className="bg-card/90 backdrop-blur-xl border border-border rounded-2xl p-8 flex flex-col items-center gap-6 shadow-[0_8px_30px_rgb(0,0,0,0.12)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.4)] min-w-[280px] max-w-[80vw] relative overflow-hidden"
          >
            {/* Ambient background glow */}
            <div className="absolute -top-24 -right-24 w-48 h-48 bg-red-500/10 blur-[50px] rounded-full pointer-events-none" />
            <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-blue-500/10 blur-[50px] rounded-full pointer-events-none" />

            <div className="relative">
              <div className="absolute inset-0 rounded-full blur-md bg-red-500/20 animate-pulse" />
              <div className="w-14 h-14 bg-background border border-border rounded-2xl flex items-center justify-center shadow-inner relative z-10">
                <Loader2 className="w-7 h-7 text-red-500 animate-spin" />
              </div>
            </div>

            <div className="flex flex-col items-center gap-2 z-10 w-full">
              <p className="text-foreground text-xs sm:text-sm font-bold tracking-widest uppercase text-center">
                {loadingState.message || 'Loading...'}
              </p>
              <div className="w-3/4 h-1 bg-muted dark:bg-muted/50 rounded-full overflow-hidden mt-2 relative">
                  <motion.div 
                      className="absolute top-0 bottom-0 left-0 bg-red-500 rounded-full w-1/2"
                      initial={{ x: "-100%" }}
                      animate={{ x: "200%" }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                  />
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
