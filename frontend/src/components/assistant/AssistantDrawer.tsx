import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { sendAssistantMessage, type AssistantMessage } from '@/api/assistant'
import { getApiErrorMessage } from '@/lib/apiError'
import { findLocalHelpAnswer } from '@/lib/helpContent'
import { renderMarkdownLite } from '@/lib/markdown'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/cn'

interface AssistantDrawerProps {
  open: boolean
  onClose: () => void
}

const GREETING: AssistantMessage = {
  role: 'assistant',
  content:
    "Hi! I'm the JDK Assistant. Ask me about orders, stock, production, or how to do something in this system.",
}

export function AssistantDrawer({ open, onClose }: AssistantDrawerProps) {
  const { user } = useAuth()
  const [messages, setMessages] = useState<AssistantMessage[]>([GREETING])
  const [input, setInput] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!open) return
    function onKeydown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeydown)
    const raf = requestAnimationFrame(() => inputRef.current?.focus())
    return () => {
      document.removeEventListener('keydown', onKeydown)
      cancelAnimationFrame(raf)
    }
  }, [open, onClose])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages, isSending])

  async function handleSend() {
    const message = input.trim()
    if (!message || isSending) return

    setInput('')
    setError(null)
    const history = messages
    const next = [...history, { role: 'user', content: message } satisfies AssistantMessage]
    setMessages(next)

    // Deal with it locally first: a confident match against this role's
    // Help Guide answers instantly, no API call needed (and works even
    // if no AI provider is configured). Only reaches the AI -- which is
    // itself grounded in this same Help data server-side -- when nothing
    // local matches well enough.
    const localAnswer = user ? findLocalHelpAnswer(user.role, message) : null
    if (localAnswer) {
      setMessages([...next, { role: 'assistant', content: localAnswer }])
      return
    }

    setIsSending(true)

    try {
      const reply = await sendAssistantMessage(message, history)
      setMessages([...next, { role: 'assistant', content: reply }])
    } catch (err) {
      setError(getApiErrorMessage(err))
      setMessages(next)
    } finally {
      setIsSending(false)
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-50 bg-ink-950/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onMouseDown={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="JDK Assistant"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="glass-panel-strong fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col rounded-l-3xl p-5 sm:p-6"
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="font-display text-lg font-medium text-white">JDK Assistant</h2>
                <p className="text-xs text-white/40">Ask about orders, stock, production, or how to use it</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="text-white/40 transition-colors hover:text-white"
              >
                ✕
              </button>
            </div>

            <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto pr-1">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}
                >
                  <div
                    className={cn(
                      'max-w-[85%] rounded-2xl px-4 py-2.5 text-sm',
                      m.role === 'user'
                        ? 'bg-gold-500/15 text-gold-100'
                        : 'glass-inset text-white/80',
                    )}
                  >
                    {renderMarkdownLite(m.content)}
                  </div>
                </div>
              ))}
              {isSending && (
                <div className="flex justify-start">
                  <div className="glass-inset rounded-2xl px-4 py-2.5 text-sm text-white/40">
                    Thinking…
                  </div>
                </div>
              )}
            </div>

            {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

            <div className="mt-4 flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSend()
                  }
                }}
                rows={1}
                placeholder="Ask a question…"
                className="max-h-28 flex-1 resize-none rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 focus:border-gold-400/50 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={isSending || !input.trim()}
                aria-label="Send"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gold-500/20 text-gold-200 transition-colors hover:bg-gold-500/30 disabled:opacity-40"
              >
                <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
                  <path d="M16 2L2 8l5 3 3 5 6-14z" fill="currentColor" />
                </svg>
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
