/** Contadores da agenda sobre a lista recebida (a mesma que a tela mostra). */
export function countByStatus(rows: ReadonlyArray<{ status: string }>) {
  const count = (status: string) => rows.filter((row) => row.status === status).length;
  return { total: rows.length, scheduled: count("scheduled"), confirmed: count("confirmed"), completed: count("completed") };
}
