"use client"

import { useState } from "react"
import { HardDrive } from "lucide-react"
import { DriveExplorer } from "./drive-explorer"
import type { DriveItem, DriveResourceContext } from "@/lib/google-drive"
import { cn } from "@/lib/utils"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

interface DriveSheetProps {
  context?: DriveResourceContext
  title?: string
  description?: string
  label?: string
  className?: string
  buttonClassName?: string
  onSelectFile?: (item: DriveItem) => void | Promise<void>
  selectLabel?: string
}

export function DriveSheet({
  context,
  title = "Google Drive personal",
  description = "Tus carpetas y archivos personales, dentro de EduPanel.",
  label = "Drive",
  className,
  buttonClassName,
  onSelectFile,
  selectLabel,
}: DriveSheetProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-[10px] border border-border bg-card px-3 py-2 text-[12px] font-bold text-muted-foreground transition-colors hover:border-primary hover:text-primary",
          buttonClassName,
        )}
      >
        <HardDrive className="h-4 w-4" />
        {label}
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className={cn("w-[96vw] gap-0 p-0 sm:max-w-none lg:w-[1120px]", className)}>
          <SheetHeader className="sr-only">
            <SheetTitle>{title}</SheetTitle>
            <SheetDescription>{description}</SheetDescription>
          </SheetHeader>
          <div className="h-full p-3 sm:p-4">
            <DriveExplorer
              context={context}
              title={title}
              description={description}
              className="h-full"
              onSelectFile={onSelectFile}
              selectLabel={selectLabel}
            />
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
