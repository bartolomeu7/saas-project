import { MetricCard } from "@/components/app/metric-card";
import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentCompany } from "@/lib/companies/queries";
import { listSuppliers, getSupplierStats } from "@/lib/suppliers/queries";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

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
        {[["Total",stats.total],["Ativos",stats.active],["Inativos",stats.inactive]].map(([label,value]) => <MetricCard key={label as string} label={label as string} value={value} />)}
      </div>
      <form className="flex gap-2"><InputSearch name="q" defaultValue={searchParams?.q ?? ""} /><button className={cn(buttonVariants({variant:"outline"}))}>Buscar</button></form>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table className="w-full text-sm"><TableHeader><TableRow className="border-b text-left text-muted-foreground"><TableHead className="p-3">Fornecedor</TableHead><TableHead className="p-3">Documento</TableHead><TableHead className="p-3">Contato</TableHead><TableHead className="p-3">Status</TableHead></TableRow></TableHeader>
        <TableBody>{suppliers.map(s => <TableRow key={s.id} className="border-b last:border-0 hover:bg-muted/40"><TableCell className="p-3"><Link className="font-medium hover:underline" href={`/app/fornecedores/${s.id}`}>{s.name}</Link>{s.legal_name && <div className="text-xs text-muted-foreground">{s.legal_name}</div>}</TableCell><TableCell className="p-3">{s.document || "—"}</TableCell><TableCell className="p-3">{s.phone || s.email || "—"}</TableCell><TableCell className="p-3">{s.status === "active" ? "Ativo" : "Inativo"}</TableCell></TableRow>)}</TableBody></Table>
        {suppliers.length === 0 && <div className="p-10 text-center text-sm text-muted-foreground">Nenhum fornecedor encontrado.</div>}
      </div>
    </div>
  );
}

function InputSearch({ name, defaultValue }: { name: string; defaultValue: string }) {
  return <input name={name} defaultValue={defaultValue} placeholder="Buscar fornecedor..." className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:max-w-sm" />;
}