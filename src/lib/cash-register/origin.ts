/**
 * De onde veio a movimentação do caixa. O banco só distingue "pagamento de venda" do resto, então o que vem de outro
 * módulo é reconhecido pelo começo da descrição que o próprio banco grava.
 * shortcut: uma descrição digitada à mão com o mesmo começo ganha o mesmo rótulo; se isso incomodar, gravar a origem no banco.
 */
export type CashOrigin = "Pagamento de venda" | "Estorno de venda" | "Estorno" | "Compras" | "RH" | "Lançamento manual";

export function cashMovementOrigin(movement: { source: string; description: string }): CashOrigin {
  if (movement.source === "sale_payment") return "Pagamento de venda";
  const text = movement.description;
  if (/^Estorno de (pagamento de )?venda/.test(text)) return "Estorno de venda";
  if (text.startsWith("Estorno: ")) return "Estorno";
  if (text.startsWith("Pagamento de fornecedor — ")) return "Compras";
  if (/^(Vale — |Pagamento RH — |Férias — |13º salário )/.test(text)) return "RH";
  return "Lançamento manual";
}
