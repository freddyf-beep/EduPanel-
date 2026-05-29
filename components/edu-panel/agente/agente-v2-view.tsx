"use client"

import { useState, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Sparkles, Send, Mic, Paperclip, ChevronLeft, Bot, User,
  MoreVertical, Settings, History, Plus, FileText, CheckCircle2,
  Cpu, Zap
} from "lucide-react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { buildUrl, withAsignatura } from "@/lib/shared"
import { useActiveSubject } from "@/hooks/use-active-subject"

type Message = {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: Date
  isTyping?: boolean
  suggestions?: string[]
}

const INITIAL_SUGGESTIONS = [
  "Crea una guía sobre fracciones para 5° Básico",
  "Adapta esta evaluación para un alumno PIE (TDAH)",
  "Sugiéreme 3 actividades lúdicas para el inicio de clase",
  "Genera una rúbrica para disertación de historia"
]

export function AgenteV2View() {
  const { asignatura: ASIGNATURA } = useActiveSubject()
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      role: "assistant",
      content: "¡Hola, Profe! Soy tu Asistente Educativo impulsado por Gemini 1.5 Pro. Estoy aquí para ayudarte a planificar, crear recursos y adaptar el aprendizaje para tus estudiantes. ¿En qué te puedo ayudar hoy?",
      timestamp: new Date(),
      suggestions: INITIAL_SUGGESTIONS
    }
  ])
  const [inputValue, setInputValue] = useState("")
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSend = (text: string = inputValue) => {
    if (!text.trim()) return

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: text,
      timestamp: new Date()
    }

    setMessages(prev => [...prev, userMsg])
    setInputValue("")

    // Simulated AI response
    setTimeout(() => {
      const aiThinking: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "",
        timestamp: new Date(),
        isTyping: true
      }
      setMessages(prev => [...prev, aiThinking])

      setTimeout(() => {
        setMessages(prev => prev.map(msg => 
          msg.id === aiThinking.id 
            ? {
                ...msg,
                isTyping: false,
                content: "Entendido. Estoy procesando tu solicitud utilizando los últimos lineamientos del currículum nacional. ¡En un momento tendré una propuesta lista para ti!"
              }
            : msg
        ))
      }, 2000)
    }, 500)
  }

  return (
    <div className="flex h-[calc(100vh-64px)] w-full overflow-hidden bg-background">
      
      {/* Sidebar - Historial */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 280, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            className="border-r border-border bg-card/50 backdrop-blur-xl flex flex-col hidden md:flex flex-shrink-0"
          >
            <div className="p-4 flex items-center justify-between border-b border-border/50">
              <button className="flex flex-1 items-center gap-2 bg-primary/10 hover:bg-primary/20 text-primary font-semibold px-4 py-2.5 rounded-xl transition-colors">
                <Plus className="w-4 h-4" />
                <span className="text-[13px]">Nuevo Chat</span>
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-3 space-y-6">
              <div>
                <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2 px-2">Hoy</h3>
                <div className="space-y-1">
                  <button className="w-full text-left px-3 py-2 rounded-lg text-[13px] hover:bg-secondary transition-colors text-foreground/80 truncate">
                    Planificación mensual Matemáticas
                  </button>
                  <button className="w-full text-left px-3 py-2 rounded-lg text-[13px] hover:bg-secondary transition-colors text-foreground/80 truncate">
                    Ideas para proyecto de ciencias
                  </button>
                </div>
              </div>
              
              <div>
                <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2 px-2">Ayer</h3>
                <div className="space-y-1">
                  <button className="w-full text-left px-3 py-2 rounded-lg text-[13px] hover:bg-secondary transition-colors text-foreground/80 truncate">
                    Rúbrica de evaluación oral
                  </button>
                </div>
              </div>
            </div>
            
            <div className="p-4 border-t border-border/50 bg-secondary/30">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-violet-500 to-fuchsia-500 grid place-items-center">
                  <Cpu className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="text-[12px] font-bold">Motor IA</p>
                  <p className="text-[11px] text-muted-foreground">Gemini 1.5 Pro</p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col relative bg-gradient-to-b from-background to-secondary/20">
        
        {/* Topbar */}
        <header className="h-14 flex items-center justify-between px-4 sm:px-6 border-b border-border/50 bg-background/80 backdrop-blur-md z-10">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hidden md:block transition-colors"
            >
              <History className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <div className="bg-primary/10 p-1.5 rounded-lg">
                <Sparkles className="w-4 h-4 text-primary" />
              </div>
              <div>
                <h1 className="text-[14px] font-extrabold leading-none">Mi Agente Educativo</h1>
                <span className="text-[11px] text-green-500 font-medium flex items-center gap-1 mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                  En línea
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="p-2 rounded-lg hover:bg-secondary text-muted-foreground transition-colors">
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-8">
          <div className="max-w-3xl mx-auto space-y-6 pb-4">
            {messages.map((msg) => (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                key={msg.id}
                className={cn(
                  "flex gap-4",
                  msg.role === "user" ? "flex-row-reverse" : "flex-row"
                )}
              >
                <div className={cn(
                  "w-8 h-8 rounded-full flex-shrink-0 grid place-items-center mt-1",
                  msg.role === "user" 
                    ? "bg-primary text-primary-foreground" 
                    : "bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-md shadow-fuchsia-500/20"
                )}>
                  {msg.role === "user" ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                </div>
                
                <div className={cn(
                  "flex flex-col gap-2 max-w-[85%]",
                  msg.role === "user" ? "items-end" : "items-start"
                )}>
                  <div className={cn(
                    "px-4 py-3 rounded-[20px] text-[14px] leading-relaxed shadow-sm",
                    msg.role === "user" 
                      ? "bg-primary text-primary-foreground rounded-tr-sm" 
                      : "bg-card border border-border/50 rounded-tl-sm text-foreground"
                  )}>
                    {msg.isTyping ? (
                      <div className="flex items-center gap-1 h-5">
                        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "0ms" }}></span>
                        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "150ms" }}></span>
                        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "300ms" }}></span>
                      </div>
                    ) : (
                      msg.content
                    )}
                  </div>
                  
                  {/* Suggestions Bubbles */}
                  {msg.suggestions && msg.suggestions.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {msg.suggestions.map((suggestion, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleSend(suggestion)}
                          className="px-3 py-1.5 bg-background border border-border rounded-full text-[12px] font-medium text-muted-foreground hover:text-primary hover:border-primary hover:bg-primary/5 transition-all"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input Area */}
        <div className="p-4 sm:p-6 bg-gradient-to-t from-background via-background to-transparent pt-10 relative z-20">
          <div className="max-w-3xl mx-auto">
            <div className="relative flex items-end gap-2 bg-card border border-border/60 shadow-xl shadow-black/5 rounded-[24px] p-2 focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/50 transition-all">
              <button className="p-3 text-muted-foreground hover:text-primary transition-colors flex-shrink-0">
                <Paperclip className="w-5 h-5" />
              </button>
              
              <textarea
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSend()
                  }
                }}
                placeholder="Pregúntale a tu asistente lo que necesites..."
                className="flex-1 max-h-32 min-h-[44px] bg-transparent resize-none outline-none text-[14px] py-3 text-foreground placeholder:text-muted-foreground"
                rows={1}
              />
              
              <div className="flex items-center gap-1 flex-shrink-0">
                <button className="p-3 text-muted-foreground hover:text-primary transition-colors hidden sm:block">
                  <Mic className="w-5 h-5" />
                </button>
                <button 
                  onClick={() => handleSend()}
                  disabled={!inputValue.trim()}
                  className="bg-primary text-primary-foreground p-3 rounded-full hover:bg-pink-dark transition-all disabled:opacity-50 disabled:hover:bg-primary"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </div>
            <p className="text-center text-[10px] text-muted-foreground mt-3 font-medium">
              La IA puede cometer errores. Considera verificar la información.
            </p>
          </div>
        </div>
        
      </div>
    </div>
  )
}
