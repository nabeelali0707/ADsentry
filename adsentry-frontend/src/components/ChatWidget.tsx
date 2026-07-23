'use client';

import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Sparkles, X, Send, Trash2, Bot } from 'lucide-react';
import { useChatStore } from '@/store/useChatStore';
import { useAuditStore } from '@/store/useAuditStore';
import Button from '@/components/ui/Button';
import { cn } from '@/lib/cn';

const SUGGESTED_QUESTIONS = [
  'Which channel underperformed most?',
  "What's the biggest discrepancy?",
  'Draft a dispute email.',
  'Summarize compliance in one line.',
];

export default function ChatWidget() {
  const { isOpen, messages, isLoading, toggleOpen, sendMessage, clearMessages } = useChatStore();
  const { activeContractId, activeContract } = useAuditStore();

  const [input, setInput] = useState('');
  const listEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const prefersReducedMotion = useReducedMotion();

  // Auto-scroll to the latest message/typing indicator.
  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth' });
  }, [messages, isLoading, prefersReducedMotion]);

  // Escape closes the panel; focus the input when it opens.
  useEffect(() => {
    if (!isOpen) return;
    inputRef.current?.focus();
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') toggleOpen();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, toggleOpen]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;
    setInput('');
    sendMessage(trimmed);
  };

  const handleChipClick = (question: string) => {
    if (isLoading) return;
    sendMessage(question);
  };

  return (
    <>
      {/* Floating trigger button — persists across every dashboard route */}
      <motion.button
        type="button"
        onClick={toggleOpen}
        aria-label={isOpen ? 'Close AdSentry AI chat' : 'Open AdSentry AI chat'}
        aria-expanded={isOpen}
        initial={prefersReducedMotion ? false : { scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 20 }}
        whileTap={prefersReducedMotion ? undefined : { scale: 0.92 }}
        whileHover={prefersReducedMotion ? undefined : { scale: 1.05 }}
        className={cn(
          'fixed bottom-6 right-6 z-[70] h-14 w-14 rounded-full flex items-center justify-center',
          'bg-gradient-to-br from-teal-accent to-emerald-accent text-navy-950 shadow-lg shadow-teal-500/20',
          'border border-teal-400/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-accent focus-visible:ring-offset-2 focus-visible:ring-offset-navy-950',
          !isOpen && !prefersReducedMotion && 'animate-pulse-glow'
        )}
      >
        <AnimatePresence mode="wait" initial={false}>
          {isOpen ? (
            <motion.span
              key="close"
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 90, opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <X className="h-6 w-6" />
            </motion.span>
          ) : (
            <motion.span
              key="sparkles"
              initial={{ rotate: 90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: -90, opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <Sparkles className="h-6 w-6" />
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>

      {/* Chat panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            role="dialog"
            aria-modal="false"
            aria-label="Ask AdSentry AI"
            initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.92, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.92, y: 16 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            className={cn(
              'fixed z-[70] flex flex-col overflow-hidden',
              'glass-panel rounded-2xl border border-slate-800 shadow-2xl shadow-black/40',
              // Mobile: near-fullscreen, anchored above the trigger button
              'inset-x-4 bottom-24 top-auto h-[75vh]',
              // Desktop: fixed 380x520 card in the bottom-right corner
              'sm:inset-x-auto sm:left-auto sm:right-6 sm:bottom-24 sm:w-[380px] sm:h-[520px] sm:max-h-[calc(100vh-7rem)]'
            )}
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-3 px-4 py-3.5 border-b border-slate-800/80 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="h-8 w-8 rounded-lg bg-teal-accent/15 text-teal-accent flex items-center justify-center shrink-0">
                  <Sparkles className="h-4.5 w-4.5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-white leading-tight">Ask AdSentry AI</p>
                  {activeContract && (
                    <p className="text-[11px] text-slate-400 truncate leading-tight mt-0.5">
                      {activeContract.campaign_name || activeContract.brand_name}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={clearMessages}
                  title="Clear conversation"
                  aria-label="Clear conversation"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-teal-accent"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={toggleOpen}
                  title="Close"
                  aria-label="Close chat"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-teal-accent"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {!activeContractId ? (
              // Empty state: no audit has been run yet — panel still opens/closes normally.
              <div className="flex-1 flex flex-col items-center justify-center text-center px-6 gap-2">
                <div className="h-11 w-11 rounded-xl bg-slate-800/60 text-slate-500 flex items-center justify-center">
                  <Bot className="h-5.5 w-5.5" />
                </div>
                <p className="text-sm font-semibold text-slate-300">No active audit yet</p>
                <p className="text-xs text-slate-500 max-w-[240px]">
                  Run an audit first, then ask me anything about the results.
                </p>
              </div>
            ) : (
              <>
                {/* Message list */}
                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                  {messages.length === 0 && !isLoading && (
                    <div className="space-y-3 pt-2">
                      <p className="text-xs text-slate-500 text-center">Try asking:</p>
                      <div className="flex flex-wrap gap-2 justify-center">
                        {SUGGESTED_QUESTIONS.map((q) => (
                          <button
                            key={q}
                            type="button"
                            onClick={() => handleChipClick(q)}
                            className="px-3 py-1.5 rounded-full border border-slate-800 bg-slate-900/60 text-[11px] text-slate-300 hover:border-teal-500/40 hover:text-teal-accent transition-colors"
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {messages.map((msg) => (
                    <div key={msg.id} className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                      {msg.role === 'assistant' ? (
                        <div className="glass-panel max-w-[85%] rounded-2xl rounded-bl-sm border border-slate-800 px-3.5 py-2.5">
                          <p className="text-xs text-slate-200 leading-relaxed whitespace-pre-line">{msg.content}</p>
                        </div>
                      ) : (
                        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-teal-accent/15 border border-teal-500/20 px-3.5 py-2.5">
                          <p className="text-xs text-white leading-relaxed whitespace-pre-line">{msg.content}</p>
                        </div>
                      )}
                    </div>
                  ))}

                  {isLoading && (
                    <div className="flex justify-start">
                      <div className="glass-panel rounded-2xl rounded-bl-sm border border-slate-800 px-4 py-3 flex items-center gap-1.5">
                        {[0, 1, 2].map((i) => (
                          <motion.span
                            key={i}
                            className="h-1.5 w-1.5 rounded-full bg-teal-accent/70"
                            animate={
                              prefersReducedMotion ? { opacity: 0.7 } : { opacity: [0.3, 1, 0.3], scale: [0.85, 1, 0.85] }
                            }
                            transition={{ duration: 1, repeat: Infinity, delay: i * 0.15, ease: 'easeInOut' }}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  <div ref={listEndRef} />
                </div>

                {/* Input row */}
                <div className="p-3 border-t border-slate-800/80 flex items-center gap-2 shrink-0">
                  <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    disabled={isLoading}
                    placeholder="Ask about this audit..."
                    aria-label="Ask AdSentry AI a question"
                    className="flex-1 px-3.5 py-2.5 bg-slate-950 border border-slate-800 focus:border-teal-accent/50 focus:ring-1 focus:ring-teal-accent/50 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none transition-all disabled:opacity-50"
                  />
                  <Button
                    type="button"
                    variant="primary"
                    onClick={handleSend}
                    disabled={!input.trim() || isLoading}
                    className="px-3.5 py-2.5 shrink-0"
                    aria-label="Send message"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
