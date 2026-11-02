import { ListLoading } from "@/components/app/list-loading";

export default function CustomersLoading() {
  return <ListLoading label="Carregando clientes" stats={3} />;
}
