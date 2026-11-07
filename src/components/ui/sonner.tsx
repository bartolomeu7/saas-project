"use client"

import {
  CircleCheck,
  Info,
  LoaderCircle,
  OctagonX,
  TriangleAlert,
} from "lucide-react"
import { Toaster as Sonner } from "sonner"

import { useAppliedTheme } from "@/lib/settings/theme-client"

type ToasterProps = React.ComponentProps<typeof Sonner>

/**
 * Toaster global do Prime Ges. O padrão é a identidade escura (ver src/app/layout.tsx); na área logada a pessoa pode
 * escolher o tema claro em Configurações → Aparência, e o Sonner acompanha a classe aplicada no <html> — sem next-themes.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const theme = useAppliedTheme()
  return (
    <Sonner
      theme={theme}
      className="toaster group"
      position="bottom-right"
      closeButton
      icons={{
        success: <CircleCheck className="h-4 w-4 text-success" />,
        info: <Info className="h-4 w-4 text-primary" />,
        warning: <TriangleAlert className="h-4 w-4 text-warning" />,
        error: <OctagonX className="h-4 w-4 text-destructive" />,
        loading: <LoaderCircle className="h-4 w-4 animate-spin" />,
      }}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-card group-[.toaster]:text-card-foreground group-[.toaster]:border-border group-[.toaster]:shadow-card",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
