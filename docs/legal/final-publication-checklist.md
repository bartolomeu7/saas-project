# Checklist de publicação final dos documentos legais

Estado: **BLOCKED — informação empresarial ou jurídica necessária.** Os documentos vigentes são `1.0.0-rc.2` (Termos de Uso e Política de Privacidade) e **continuam rc.2**. Nenhum texto foi promovido a versão final nesta missão, e nenhum dado empresarial foi inventado.

Hashes publicados (SHA-256 do conteúdo), conferidos contra o repositório:

- `TERMS_OF_USE` 1.0.0-rc.2: `62ade40650d70b490835e8eebc94917eca7554b733cf91d2e9096400cba9cb69`
- `PRIVACY_POLICY` 1.0.0-rc.2: `d43afbdf5a04c5f3258ad394b6a6824758f6f00860d0729cfbd67a756ced3bc9`

## 1. Dados empresariais que faltam (preencher com dado real, nunca estimado)

| # | Campo | Onde aparece | Situação |
|---|---|---|---|
| 1 | Razão social | Termos (identificação do prestador); Política (quem somos) | BLOCKED — dado necessário |
| 2 | CNPJ | idem | BLOCKED — dado necessário |
| 3 | Endereço | idem | BLOCKED — dado necessário |
| 4 | E-mail de contato (Termos) | Termos, identificação | BLOCKED — dado necessário |
| 5 | Canal oficial de suporte | Termos, "Suporte e comunicações" | BLOCKED. Candidato encontrado no código: `suporte@primeges.com.br` (mailto do plano sob medida em `src/components/app/plan-card.tsx`). **Não confirmado como oficial; não foi copiado para os documentos.** |
| 6 | Contato de privacidade / dados pessoais | Política, "quem somos" | BLOCKED — dado necessário |
| 7 | Encarregado (DPO), quando houver | Política | BLOCKED — dizer se existe |
| 8 | Canal para exercício de direitos do titular | Política, "direitos" | BLOCKED — dado necessário |
| 9 | Foro competente | Termos, "lei aplicável" | BLOCKED — dado necessário + revisão |
| 10 | Prazos de retenção e eliminação (conta encerrada, financeiro, auditoria) | Termos e Política | BLOCKED — decisão de negócio + jurídica |

Total no texto: 10 marcadores de dado e 16 de revisão jurídica (6 + 8 nos Termos; 4 + 8 na Política, contagem do script `legal-markers`).

Quem fornece cada dado: itens 1–4, 6–8 e 10 → sócio/administrador da empresa (documentos societários); item 5 → o canal que a empresa realmente monitora; item 9 → decisão do jurídico. Reinventário de 2026-10-09 (Missão 07.1): o repositório não contém nenhum desses dados além do candidato do item 5.

## 2. Perguntas para a revisão jurídica

**Papéis e bases legais**
1. Controlador × operador: a Prime Ges é controladora dos dados de conta e operadora dos dados dos clientes finais que o lojista cadastra? Isso muda quem responde ao titular.
2. As bases legais propostas para cada finalidade estão corretas (execução de contrato, legítimo interesse, obrigação legal)?
3. O aceite eletrônico (checkbox + registro de versão, hash, data, contexto) é suficiente como evidência?

**Dados de pagamento**
4. O payload do evento de pagamento (`payment_events.payload`) guarda dados do pagador devolvidos pelo provedor. A Política diz que "ficam registrados". É necessário reduzir/pseudonimizar o que guardamos, e por quanto tempo? (Decisão técnica depende da resposta; hoje não há expurgo do payload financeiro, só das entregas de webhook em 60 dias.)
5. Prazo mínimo de guarda de registros financeiros e fiscais aplicável.

**Transferência internacional e terceiros**
6. O banco está em região dos EUA (`us-east-1`); autenticação (Clerk) e hospedagem (Vercel) também podem processar fora do Brasil. Que fundamento do art. 33 da LGPD usar e que cláusulas contratuais exigir dos prestadores?
7. A lista de operadores/terceiros na Política está completa?

**Cookies**
8. O cookie técnico `pg_legal_intent` (httpOnly, 1 h, assinado) **não está citado na seção de cookies**. Citar na versão final (ver §3). Há outros cookies de terceiros (Clerk) que precisam constar?
9. É necessário banner de cookies enquanto só existem cookies estritamente necessários?

**Direitos do titular e encerramento**
10. Hoje não há exclusão/exportação de conta por autoatendimento; o atendimento é manual. O prazo de resposta anunciado é adequado?
11. O que acontece com os dados da empresa e do lojista depois do encerramento e em quanto tempo?

**Comercial**
12. Política de cancelamento antecipado, reembolso e direito de arrependimento (CDC, art. 49) para assinatura Pix pré-paga. Hoje o texto diz que a decisão está pendente.
13. Limitação de responsabilidade e a cláusula de "sem SLA" são aceitáveis para a base de clientes pretendida?
14. Capacidade: "maior de 18 anos e com poderes para contratar em nome da empresa" é suficiente?
15. Foro/eleição de foro em contrato de adesão com consumidor-empresa.
16. Tratamento de crianças e adolescentes: o texto "destinado a maiores de 18" basta?

## 3. Mudanças técnicas esperadas na versão final (só depois das respostas)

- Preencher os 10 marcadores de dado com os dados reais e remover os 16 marcadores de revisão após a aprovação.
- Acrescentar o cookie técnico `pg_legal_intent` à seção de cookies da Política.
- Ajustar a frase sobre dados do pagador conforme a resposta da pergunta 4.
- Subir `version` para `1.0.0` (e `effectiveAt` para a data real) em `src/content/legal/*.ts`.

## 4. Procedimento de publicação (exige autorização explícita e revisão jurídica concluída)

1. Editar os textos e a versão em `src/content/legal/*.ts`.
2. Calcular o hash com `hashLegalDocument` (como em `tests/unit/legal.test.mjs`).
3. Criar migration nova inserindo a nova linha em `legal_document_versions` (e aposentando a `rc.2`). **Nunca** editar linha publicada.
4. `LEGAL_REQUIRE_PUBLISHABLE=1 npm run test:unit` precisa passar: ele falha enquanto houver marcador.
5. Aplicar em TEST e rodar `tests/sql/legal_consent.sql`.
6. Aplicar a migration em Production **antes** do deploy do código (a verificação de integridade bloqueia aceites se texto e banco divergirem).
7. Deploy do código, smoke de `/termos-de-uso` e `/politica-de-privacidade`.
8. Teste manual T10 por uma pessoa real (aceite, reaceite, histórico). Até lá, T10 permanece **NOT VERIFIED**.
9. Configurar no Clerk (dashboard) as URLs `https://primeges.com.br/termos-de-uso` e `https://primeges.com.br/politica-de-privacidade` (hoje `terms_url`/`privacy_url` estão vazias). **Não ligar** a opção nativa "Require express consent": ela guarda só um carimbo, sem versão, e duplicaria o fluxo próprio.

## 5. O que NÃO foi feito (e não deve ser feito sem os itens acima)

- Promover rc.2 a 1.0.0.
- Preencher marcadores com valores presumidos.
- Alterar o Clerk ou o banco de Production.
