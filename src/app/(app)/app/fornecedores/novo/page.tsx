import type { Metadata } from "next";
import Link from "next/link";
import { createSupplierAction } from "@/lib/suppliers/actions";
import { SupplierForm } from "@/components/app/supplier-form";

export const metadata: Metadata = { title: "Novo fornecedor" };

export default function NewSupplierPage() {
  return <div className="flex flex-col gap-6 px-4 py-6 sm:px-6"><div><Link href="/app/fornecedores" className="text-sm text-muted-foreground underline-offset-4 hover:underline">← Voltar para Fornecedores</Link><h1 className="mt-2 text-2xl font-semibold tracking-tight">Novo fornecedor</h1><p className="text-sm text-muted-foreground">Cadastre os dados básicos do parceiro.</p></div><div className="max-w-4xl"><SupplierForm action={createSupplierAction} submitLabel="Salvar fornecedor" /></div></div>;
}