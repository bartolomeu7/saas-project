"use client";

import { useRouter } from "next/navigation";
import { useClerk } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";

/** Encerra a sessão do Clerk e volta ao login (mesmo fluxo do menu do usuário). */
export function SignOutButton() {
  const { signOut } = useClerk();
  const router = useRouter();

  return (
    <Button variant="outline" onClick={() => void signOut(() => router.push("/login"))}>
      Sair
    </Button>
  );
}
