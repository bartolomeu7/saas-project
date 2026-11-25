# Registro das operações de tratamento de dados pessoais

Art. 37 da LGPD. Operação: Nexora Group. Canal: suporte@primeges.com.br.
Atualizado em 25/11/2026. Revisar a cada módulo ou prestador novo. Ainda sem revisão jurídica.

## Como controlador

| Operação | Dados | Base legal | Onde / quem recebe | Prazo |
|---|---|---|---|---|
| Conta e login | nome, e-mail, foto do login social, identificadores | contrato (art. 7º, V) | servidor próprio (BR); Clerk (EUA); Google/Microsoft/Discord se escolhidos | enquanto a conta existir |
| Assinatura e pagamento | plano, valor, status; nome e CPF/CNPJ do pagador (SyncPay: e-mail e telefone) | contrato e obrigação legal | servidor; MisticPay, SyncPay e instituição liquidante | 5 anos |
| Chamados de suporte | mensagem, e-mail, ordem de pagamento | contrato | servidor; provedor de e-mail | enquanto a conta existir |
| Segurança e auditoria | presença, sessão, registros de ações, dados técnicos de acesso | legítimo interesse (art. 7º, IX) | servidor; Cloudflare | auditoria: vida do ambiente; técnicos: prazo da infraestrutura |
| Antifraude do teste grátis | resumo irreversível do IP | legítimo interesse | servidor | 30 dias |
| Medição do site | acessos e desempenho agregados | legítimo interesse | Cloudflare Web Analytics | prazo do fornecedor |
| Aceite dos documentos | pessoa, versão, hash, data | exercício de direitos e obrigação legal | servidor | relação + 5 anos |

## Como operador (a empresa usuária é a controladora)

| Operação | Dados | Prazo |
|---|---|---|
| Clientes e fidelidade | nome, documento, contatos, endereço, nascimento, anotações, anexos, pontos, sorteios | vida do ambiente ou até a empresa apagar |
| Vendas, agenda, orçamentos | cliente, itens, valores, horários, profissional | idem |
| Fornecedores | nome, documento, contatos, endereço | idem |
| Equipe e RH | nome, telefone, nascimento, função, chave Pix, remuneração, presença, vales, pagamentos, férias, nº de dependentes, vale-transporte | idem |
| Assistente de agenda | texto digitado ou ditado, rascunhos, resultado | 90 dias (limpeza automática) |

Não há tratamento intencional de dado sensível (art. 5º, II) nem de dados de crianças. Campos livres de anotação podem receber qualquer texto: orientar as empresas a não registrar dados de saúde ou semelhantes.

## Medidas de segurança e pendências

Em uso: separação por empresa no banco (RLS), funções de acesso, HTTPS, autenticação especializada, cópia diária com uma versão criptografada.
Pendentes: ver o levantamento de segurança de 25/11/2026 (documento interno, fora do repositório).
