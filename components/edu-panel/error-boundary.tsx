"use client"

import { Component, type ReactNode } from "react"
import { AlertTriangle, RefreshCw } from "lucide-react"

interface Props {
  children: ReactNode
  sectionName?: string
}

interface State {
  hasError: boolean
  message: string
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: "" }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[ErrorBoundary:${this.props.sectionName ?? "app"}]`, error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-1 items-center justify-center p-8">
          <div className="w-full max-w-sm rounded-[14px] border border-red-200 bg-red-50 p-8 text-center dark:border-red-900 dark:bg-red-950">
            <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-red-500" />
            <p className="mb-1 text-[14px] font-extrabold text-foreground">
              Algo salió mal{this.props.sectionName ? ` en ${this.props.sectionName}` : ""}
            </p>
            <p className="mb-5 text-[12px] text-muted-foreground">{this.state.message}</p>
            <button
              onClick={() => this.setState({ hasError: false, message: "" })}
              className="flex items-center gap-2 mx-auto rounded-[10px] bg-primary px-4 py-2 text-[13px] font-bold text-white shadow-sm transition-opacity hover:opacity-90"
            >
              <RefreshCw className="h-4 w-4" /> Reintentar
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
