import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * <select> nativo com o visual dos campos do shadcn/ui (mesma altura, borda,
 * foco e estados do Input). Mantido nativo de propósito: o seletor do sistema
 * é melhor no mobile, aceita `value=""` (opções "sem ..."), funciona com
 * formulários/Server Actions sem estado extra e preserva a validação `required`.
 */
const NativeSelect = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      "h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground [color-scheme:dark] ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none",
      className
    )}
    {...props}
  />
))
NativeSelect.displayName = "NativeSelect"

export { NativeSelect }
