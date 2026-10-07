"use client";

import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/**
 * Sem sistema de notificações real ainda — o botão é funcional (abre/
 * fecha) mas honesto sobre não ter nada para mostrar, em vez de simular
 * notificações falsas.
 */
export function NotificationButton() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-full text-muted-foreground hover:text-foreground"
          aria-label="Notificações"
        >
          <Bell className="!size-[18px]" strokeWidth={1.75} />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64">
        <p className="text-sm font-medium text-foreground">Notificações</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Nenhuma notificação por enquanto.
        </p>
      </PopoverContent>
    </Popover>
  );
}
