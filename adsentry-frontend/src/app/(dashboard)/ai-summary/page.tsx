'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuditStore } from '@/store/useAuditStore';
import { api } from '@/lib/api';
import Button from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import ErrorBanner from '@/components/ui/ErrorBanner';
import {
  AlertTriangle, 
  Sparkles, 
  Send, 
  Bot, 
  UserCircle, 
  RefreshCw, 
  HelpCircle,
  Copy,
  Check,
  Zap
} from 'lucide-react';

interface ChatMessage {
  sender: 'ai' | 'user';
  text: string;
  timestamp: Date;
}

const SUGGESTED_QUESTIONS = [
  'What is the biggest discrepancy?',
  'Which channel is worst?',
  'Draft a dispute email.',
];

export default function AiSummaryPage() {
  const router = useRouter();
  const { activeContract, userProfile } = useAuditStore();

  const [loading, setLoading] = useState(true);
  const [streaming, setStreaming] = useState(false);
  const [summary, setSummary] = useState('');
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  /** AI Summary Performance (5.2): generation time from streaming */
  const [generationTimeMs, setGenerationTimeMs] = useState<number | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);

  const fetchSummary = async () => {
    if (!activeContract) return;
    setLoading(true);
    setStreaming(true);
    setError('');
    setSummary('');
    setGenerationTimeMs(null);

    try {
      // 4.6 PRD: "Response is streamed into the summary panel"
      await api.streamAiSummary(
        activeContract.id,
        // onChunk: update displayed text as chunks arrive (typewriter effect)
        (_chunk, fullSoFar) => {
          setLoading(false);
          setSummary(fullSoFar);
        },
        // onDone: show generation time badge, initialize chat
        (fullText, timeMs) => {
          setStreaming(false);
          setGenerationTimeMs(timeMs);
          setSummary(fullText);
          const displayName = userProfile?.full_name || 'there';
          setChatHistory([
            {
              sender: 'ai',
              text: `Hello, ${displayName}. I have completed the media compliance audit for **${activeContract.campaign_name}**. How can I assist you with contract reconciliations or broadcaster claims today?`,
              timestamp: new Date(),
            }
          ]);
        },
      );
    } catch (err: any) {
      setError(err.message || 'Failed to generate AI summary narrative.');
      setStreaming(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();
  }, [activeContract]);

  // Scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, asking]);

  const handleAsk = async (textToSend: string) => {
    if (!activeContract || !textToSend.trim() || asking) return;
    
    const userMsg: ChatMessage = {
      sender: 'user',
      text: textToSend,
      timestamp: new Date(),
    };
    
    setChatHistory(prev => [...prev, userMsg]);
    setQuestion('');
    setAsking(true);

    try {
      const res = await api.askAiQuestion(activeContract.id, textToSend);
      const aiMsg: ChatMessage = {
        sender: 'ai',
        text: res.answer,
        timestamp: new Date(),
      };
      setChatHistory(prev => [...prev, aiMsg]);
    } catch (err) {
      console.error('Failed to ask AI question', err);
    } finally {
      setAsking(false);
    }
  };

  const handleCopyText = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!activeContract) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
        <AlertTriangle className="h-10 w-10 text-yellow-500" />
        <p className="font-medium text-sm">No contract is currently loaded. Please upload a contract first.</p>
        <Button onClick={() => router.push('/upload')} className="mt-2 px-4 py-2 text-xs">
          Go to Upload
        </Button>
      </div>
    );
  }

  if (loading && !summary) {
    return (
      <div className="space-y-8 max-w-5xl mx-auto">
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-[480px] rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-extrabold text-white tracking-tight flex items-center gap-2">
          <Sparkles className="h-7 w-7 text-teal-accent" />
          AI Audit Summary
        </h1>
        <p className="text-slate-400 mt-1">Generate natural language dispute reports and ask custom compliance questions.</p>
      </div>

      <ErrorBanner>{error}</ErrorBanner>

      {/* Headline AI Summary Card */}
      <Card className="p-6 space-y-4 bg-gradient-to-br from-teal-500/5 to-transparent relative overflow-hidden">
        <div className="flex justify-between items-start">
          <h3 className="text-md font-bold text-white flex items-center gap-2">
            <Bot className="h-5 w-5 text-teal-accent" />
            Executive Narrative Summary
            {/* 4.6: Streaming indicator */}
            {streaming && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-accent/10 border border-teal-500/20 text-teal-400 font-semibold animate-pulse">
                ● Streaming...
              </span>
            )}
          </h3>
          <div className="flex items-center gap-2">
            {/* AI Summary Performance (5.2): generation time badge */}
            {generationTimeMs !== null && !streaming && (
              <span className="text-[10px] px-2 py-1 rounded-full bg-teal-accent/10 border border-teal-500/20 text-teal-400 font-bold flex items-center gap-1">
                <Zap className="h-3 w-3" />
                {generationTimeMs < 1000 ? `${generationTimeMs}ms` : `${(generationTimeMs / 1000).toFixed(1)}s`}
              </span>
            )}
            <Button
              variant="ghost"
              onClick={() => handleCopyText(summary)}
              className="p-1.5 rounded-lg border border-slate-800"
              title="Copy Summary"
            >
              {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* Streaming text with blinking cursor */}
        <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-line select-text">
          {summary}
          {streaming && (
            <span className="inline-block w-[2px] h-[14px] bg-teal-accent ml-0.5 align-middle animate-[blink_1s_step-end_infinite]" />
          )}
        </p>

        {!streaming && (
          <Button
            variant="ghost"
            onClick={fetchSummary}
            className="px-0 py-0 gap-1.5 text-xs text-slate-500 hover:bg-transparent hover:text-teal-accent"
          >
            <RefreshCw className="h-3 w-3" /> Regenerate
          </Button>
        )}
      </Card>

      {/* Interactive Q&A chat panel */}
      <Card className="flex flex-col h-[480px] overflow-hidden">
        {/* Chat Title */}
        <div className="p-4 border-b border-slate-850 bg-slate-900/40 flex items-center gap-2">
          <HelpCircle className="h-4.5 w-4.5 text-teal-accent" />
          <span className="text-xs font-bold text-white uppercase tracking-wider">AdSentry Audit Agent Follow-up</span>
        </div>

        {/* Message Log */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth">
          {chatHistory.map((msg, idx) => (
            <div 
              key={idx} 
              className={`flex gap-3 max-w-[85%] ${msg.sender === 'user' ? 'ml-auto flex-row-reverse' : ''}`}
            >
              <div className={`p-2 rounded-xl shrink-0 h-10 w-10 flex items-center justify-center border
                ${msg.sender === 'ai' 
                  ? 'bg-teal-accent/10 border-teal-500/20 text-teal-accent' 
                  : 'bg-slate-800 border-slate-700 text-white'
                }
              `}>
                {msg.sender === 'ai' ? <Bot className="h-5 w-5" /> : <UserCircle className="h-5 w-5" />}
              </div>
              <div className={`p-4 rounded-2xl text-sm leading-relaxed border select-text
                ${msg.sender === 'ai'
                  ? 'bg-slate-900/50 border-slate-850 text-slate-300'
                  : 'bg-teal-accent/10 border-teal-500/20 text-white'
                }
              `}>
                <p className="whitespace-pre-line">{msg.text}</p>
                <span className="text-[9px] text-slate-500 block text-right mt-1.5 font-semibold">
                  {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
          ))}

          {asking && (
            <div className="flex gap-3 max-w-[85%]">
              <div className="p-2 rounded-xl bg-teal-accent/10 border border-teal-500/20 text-teal-accent shrink-0 h-10 w-10 flex items-center justify-center">
                <Bot className="h-5 w-5" />
              </div>
              <div className="p-4 bg-slate-900/50 border border-slate-850 text-slate-400 rounded-2xl text-sm flex items-center gap-2">
                <span className="h-2 w-2 animate-bounce rounded-full bg-slate-500"></span>
                <span className="h-2 w-2 animate-bounce rounded-full bg-slate-500 [animation-delay:0.2s]"></span>
                <span className="h-2 w-2 animate-bounce rounded-full bg-slate-500 [animation-delay:0.4s]"></span>
                <span className="text-xs font-medium ml-1">Analyzing log parameters...</span>
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Suggested Queries */}
        <div className="px-4 py-3 bg-slate-900/35 border-t border-slate-850 flex flex-wrap gap-2">
          {SUGGESTED_QUESTIONS.map((q) => (
            <Button
              key={q}
              variant="ghost"
              onClick={() => handleAsk(q)}
              disabled={asking || streaming}
              className="px-3 py-1.5 rounded-lg border border-slate-800 hover:border-teal-500/30 bg-slate-900 hover:bg-slate-800/80 text-[11px]"
            >
              {q}
            </Button>
          ))}
        </div>

        {/* Input Bar */}
        <div className="p-4 border-t border-slate-850 bg-slate-900/40 flex gap-3">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAsk(question);
            }}
            disabled={asking || streaming}
            placeholder="Ask AI about this audit... (e.g. 'draft a dispute email')"
            className="flex-1 px-4 py-3 bg-slate-950 border border-slate-850 focus:border-teal-accent/50 focus:ring-1 focus:ring-teal-accent/50 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none transition-all disabled:opacity-50"
          />
          <Button
            variant="primary"
            onClick={() => handleAsk(question)}
            disabled={!question.trim() || streaming}
            loading={asking}
            className="px-5"
          >
            {!asking && <Send className="h-4 w-4" />}
          </Button>
        </div>
      </Card>
    </div>
  );
}
