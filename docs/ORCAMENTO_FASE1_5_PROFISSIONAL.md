# Orçamento — Fase 1.5 (apresentação profissional)

Data: 21/11/2026. Base: `docs/ORCAMENTO_FASE1.md` (MVP) e a análise de apresentação feita com o dono.

## O que muda no PDF

- **Dois modelos** à escolha da empresa: **Moderno** (faixa colorida no topo com o logo em cartão branco, cartões, linhas alternadas e total arredondado) e **Clássico** (o layout sóbrio de antes, agora com a cor da marca). Padrão para empresas que ainda não escolheram: Moderno com a cor neutra de antes.
- **Cor da marca** por empresa. O texto sobre a cor (branco ou quase preto) e o tom da cor usada como texto sobre branco são calculados para manter o contraste (WCAG ≥ 4,5); cor clara (amarelo) é escurecida quando vira texto.
- **Fonte Inter** (arquivos em `public/fonts`, licença OFL em `Inter-LICENSE.txt`), com Helvetica de reserva se o arquivo faltar. Sem hifenização no meio de nomes.
- **Logo WEBP** agora aparece: é convertido para PNG na hora (sharp); se a imagem estiver corrompida, o PDF sai só com o nome da empresa.
- **Texto de apresentação** no começo ("Olá, {cliente}! ..."), editável; `{cliente}` vira o primeiro nome. Em branco = sem texto.
- **Pix com QR Code** (ver abaixo).
- **Bloco de aceite**: texto "Declaro que li e aceito...", linhas para assinatura do cliente e da empresa e data do aceite. Pode ser desligado.
- **Marca d'água "RASCUNHO"** em todas as páginas de orçamento ainda em rascunho.
- Título "PROPOSTA COMERCIAL", selo "Válido até dd/mm/aaaa" e blocos que não se partem entre páginas.

## Assinatura Prime Ges no rodapé

Em todas as páginas do PDF, na parte de baixo: logo pequeno do Prime Ges + "Orçamento emitido com **Prime Ges** | Gestão simples para o seu negócio crescer. | primeges.com.br". Texto e frase ficam em `src/lib/quotes/brand.ts` (trocar a frase é mudar uma linha); o logo é `public/brand/primeges-logo-pdf.png` (160 px, ~10 KB). Aparece nos dois modelos e na cor da marca da empresa.

### Correção junto: rodapé e "Página X de Y" não saíam
O texto de rodapé da empresa ("Obrigado pela preferência!") e a numeração de páginas já estavam sumindo dos PDFs desde a Fase 1. Causa (reproduzida em teste isolado): `lineHeight` no estilo da `Page` faz o react-pdf descartar o texto dinâmico e a linha inteira que o contém. Agora `fontSize`/`lineHeight` ficam num bloco que envolve só o corpo, e o "Página X de Y" fica fora dele. Há teste que trava isso (`orcamento-profissional.test.mjs`).

## Onde configurar

Configurações → Empresa → **Aparência do orçamento** (só proprietário e administrador): modelo, cor, texto de apresentação, chave Pix, nome do recebedor e aceite. O link **"Ver PDF de exemplo"** abre um PDF fictício com o que está salvo (`/api/orcamentos/exemplo/pdf`, não grava nada).

Guardado em `company_settings.operational_preferences.quote_style` (chave própria; os padrões de validade/condições/rodapé continuam em `quote`). Função `update_company_quote_style` (SECURITY DEFINER, `_company_editor()`, auditoria sem a chave Pix).

## Pix com QR Code — como funciona

É o **Pix estático** (BR Code do Banco Central), o mesmo QR que as lojas imprimem, só que com o valor já dentro:

1. A empresa cadastra **uma vez** a chave Pix (CPF, CNPJ, celular, e-mail ou aleatória). O sistema reconhece o tipo, confere os dígitos verificadores e salva em formato padrão.
2. A cada orçamento, o sistema **monta sozinho** o código Pix com: a chave, o **valor total do orçamento**, o nome do recebedor, a cidade da empresa e o **número do orçamento** como identificador (aparece no extrato para conciliar).
3. O PDF mostra o **QR Code** e o texto **"Pix copia e cola"** (para quem abre o PDF no próprio celular e não consegue escanear a tela).
4. O cliente abre o app do banco, escaneia (ou cola), vê o valor e o nome do recebedor já preenchidos e confirma.

Limites e cuidados:
- **Não confirma pagamento.** Nenhum banco avisa o Prime Ges; a empresa confere no extrato (o número do orçamento ajuda). Confirmação automática exige integração com um banco/PSP (cobrança Pix dinâmica) — possível numa fase futura.
- O valor vem do total do orçamento **no momento em que o PDF é gerado**. Se o orçamento mudar, o PDF novo traz o QR novo; PDFs antigos continuam com o valor antigo.
- Só aparece com chave válida e total maior que zero. Chave errada = dinheiro na conta errada, por isso o formulário valida e a tela pede conferência.
- Sem nenhuma chave cadastrada, o bloco Pix simplesmente não aparece.

## Segurança

- Escrita só pela função do banco; papel conferido no banco (dono/admin); cor, modelo, tamanho de texto e formato da chave validados no app e no banco (última barreira).
- A chave Pix não vai para o log de auditoria; o PDF de exemplo e o PDF real usam sempre a empresa da sessão.
- O caminho da fonte é fixo (`public/fonts`), sem dado do usuário.

## Testes

| Camada | Arquivo | Resultado |
|---|---|---|
| Banco (transação revertida) | `tests/sql/quote_style.sql` | 30/30 |
| Pix (CRC do manual do BCB, chaves, payload), estilo, cores, formulário, modelo e PDF real dos dois modelos | `tests/unit/orcamento-profissional.test.mjs` | 23 |
| Suíte inteira | `npm run test:unit` | 1.157 testes, 0 falhas |
| Tipos / lint / build | `tsc`, `eslint`, `npm run build` | sem erros |

## Publicação e reversão

1. Mesclar o PR e rodar `E:\primeges-local\scripts\publicar.ps1` (aplica `20261121210000_quote_style.sql`, troca a imagem).
2. Reverter: `supabase/rollback/20261121210000_quote_style.down.sql` (apaga só o estilo salvo) e voltar a imagem anterior.

## Fica para a Fase 2

Link público para o cliente ver/aprovar/recusar, WhatsApp e e-mail, converter em venda, mais modelos, vencimento automático, foto por item, valor por extenso e parcelamento, Pix dinâmico com confirmação.
