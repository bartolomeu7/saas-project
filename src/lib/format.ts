// Fuso horário fixo (America/Sao_Paulo), nunca o do processo Node que
// executa o servidor (em produção/Vercel isso é UTC por padrão). Sem isso,
// "hoje"/datas exibidas podem ficar deslocadas em até 3h do horário real
// do usuário brasileiro.
const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "America/Sao_Paulo",
});

export function formatDate(isoDate: string): string {
  return dateFormatter.format(new Date(isoDate));
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}
