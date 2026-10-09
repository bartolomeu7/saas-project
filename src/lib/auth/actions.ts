/**
 * Resultado padrão das Server Actions de formulário do app. A autenticação
 * (login, cadastro, recuperação de senha, logout) é do Clerk — não existem
 * mais Server Actions de auth neste projeto; este módulo só mantém o tipo
 * compartilhado pelas actions de negócio.
 */
export interface ActionResult {
  error?: string;
  success?: string;
  /** Código opcional para a UI reagir a um caso específico. */
  code?: string;
  /**
   * Opcional: `name` do campo a que o `error` se refere. A UI mostra a mensagem
   * junto do campo (aria-invalid/aria-describedby) em vez de um alerta geral.
   */
  field?: string;
}
