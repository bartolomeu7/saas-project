"use client";

import { ModuleError } from "@/components/app/module-error";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ModuleError error={error} reset={reset} moduleName="os Fornecedores" moduleHref="/app/fornecedores" />;
}
