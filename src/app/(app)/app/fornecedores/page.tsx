import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentCompany } from "@/lib/companies/queries";
import { listSuppliers, getSupplierStats } from "@/lib/suppliers/queries";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Fornecedores" };

export default async function SuppliersPage({ searchParams }: { searchParams?: { q?: string } }) {
  const current = (await getCurrentCompany())!;
  const [stats, suppliers] = await Promise.all([getSupplierStats(current.company.id), listSuppliers(current.company.id, searchParams?.q)]);
  return (
    <div className="prime-module-page prime-module-page--fornecedores flex flex-col gap-6 px-4 py-6 sm:px-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div><h1 className="text-2xl font-semibold tracking-tight">Fornecedores</h1><p className="text-sm text-muted-foreground">Cadastre parceiros, custos e vínculos que alimentarão Compras e Estoque.</p></div>
        <Link href="/app/fornecedores/novo" className={cn(buttonVariants())}>+ Novo fornecedor</Link>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[["Total",stats.total],["Ativos",stats.active],["Inativos",stats.inactive]].map(([label,value]) => <div key={label as string} className="prime-kpi-card rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></div>)}
      </div>
      <form className="flex gap-2"><InputSearch name="q" defaultValue={searchParams?.q ?? ""} /><button className={cn(buttonVariants({variant:"outline"}))}>Buscar</button></form>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm"><thead><tr className="border-b text-left text-muted-foreground"><th className="p-3">Fornecedor</th><th className="p-3">Documento</th><th className="p-3">Contato</th><th className="p-3">Status</th></tr></thead>
        <tbody>{suppliers.map(s => <tr key={s.id} className="border-b last:border-0 hover:bg-muted/40"><td className="p-3"><Link className="font-medium hover:underline" href={`/app/fornecedores/${s.id}`}>{s.name}</Link>{s.legal_name && <div className="text-xs text-muted-foreground">{s.legal_name}</div>}</td><td className="p-3">{s.document || "—"}</td><td className="p-3">{s.phone || s.email || "—"}</td><td className="p-3">{s.status === "active" ? "Ativo" : "Inativo"}</td></tr>)}</tbody></table>
        {suppliers.length === 0 && <div className="p-10 text-center text-sm text-muted-foreground">Nenhum fornecedor encontrado.</div>}
      </div>
    </div>
  );
}

function InputSearch({ name, defaultValue }: { name: string; defaultValue: string }) {
  return <input name={name} defaultValue={defaultValue} placeholder="Buscar fornecedor..." className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:max-w-sm" />;
}