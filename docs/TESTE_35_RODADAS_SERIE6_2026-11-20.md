# Sexta série de testes reais (20/11/2026) — Financeiro, Relatórios, Equipe, Assinatura e Configurações

**Configurações** entrou agora (nunca tinha sido testada). Financeiro, Relatórios, Equipe e Assinatura já tinham 25–65 rodadas na série anterior; aqui
foram feitas rodadas novas, em ângulos diferentes, e a conferência ao vivo das correções da série anterior (PR #123, já no ar).
Tudo no site real (primeges.com.br, conta `teste1`, tema escuro restaurado no fim), com conferência no banco.

| Módulo | Rodadas | O que entrou |
|---|---|---|
| Configurações | 23 de Empresa + 11 de Perfil + 4 de tema + 6 de navegação + 5 do aplicativo + 3 de Segurança + 13 telas no tema claro + 16 telas no celular | nome e segmento da empresa (os 10 segmentos), nome da conta, tema, instalação do app, segurança, contraste e layout |
| Financeiro | 24 (categorias e centros de custo) + ajustes da série anterior | nomes válidos, vazios, repetidos, numéricos, longos, invisíveis, tipo receita/despesa |
| Relatórios | 5 períodos × 4 conferências na tela + soma dos dias + soma das formas de pagamento | tela × banco × CSV |
| Equipe | 9 (ficha do profissional, ao vivo, depois das correções) | nome, telefone, especialidade, observações |
| Assinatura | conferência do que já foi testado (13 chamadas à API de cobrança, telas e acesso sem login, da série anterior) | sem cobrança real |

## Achados e correções (neste PR)

**Configurações**
- **Empresa**: o nome aceitava "12345", caracteres de inversão/invisíveis (U+202E, U+200B), espaços repetidos ("Salão    Beleza     Pura") e `<img onerror>`; tudo aparecia no menu e
  nas telas. Agora o nome precisa ter letras (2 a 160), sem invisíveis e com espaços juntados (vale também para o cadastro da empresa no primeiro acesso).
- **Perfil (nome e sobrenome)**: "12345", 81 caracteres, espaços repetidos e caracteres de inversão passavam direto para a conta e para o menu. Agora o nome precisa ter letras,
  é limpo antes de salvar no Clerk e a cópia para o perfil interno também é limpa (o Clerk já recusava HTML).
- **Tema claro**: texto verde-600 (3,8:1) em "+1" do Estoque, "(sobra)" do Caixa, receitas do Financeiro e movimentos do caixa, e o aviso âmbar "Esse horário já passou" da Agenda (3,1:1)
  ficavam abaixo do mínimo de 4,5:1; passaram para o tom 700 (5,5:1 e 5,0:1). As outras telas conferidas no claro (Compras, Fornecedores, Relatórios, Equipe, Assinatura, Clientes, Vendas, Perfil) não tiveram texto abaixo do mínimo; o Dashboard teve só um caso limítrofe (4,46:1).

**Financeiro (Estrutura)**
- Categoria e centro de custo com o mesmo nome (mesmo trocando maiúscula/minúscula) eram aceitos; o repetido exato era **ignorado em silêncio e a tela dizia "Categoria salva"**.
  Agora avisa "Já existe uma categoria de despesa/receita com esse nome" (a mesma palavra pode existir em receita e despesa).
- Nomes só com números ("12345", "98765") e com espaços repetidos eram aceitos; agora exigem letras e juntam os espaços.

## Conferido e OK
- **Empresa**: os 10 segmentos gravam e voltam certos; 1 caractere e vazio recusados; 160 caracteres aceitos e 161 recusados; acentos, emoji, aspas e `<img>` ficam como texto; cada mudança gera auditoria (`company.updated`, 19 no teste).
- **Perfil**: nome em branco recusado; HTML recusado pelo Clerk; nome restaurado para `teste1` e perfil interno sincronizado.
- **Aparência**: claro, escuro e automático gravam em `prime-theme`; **Aplicativo**: manifest válido (3 ícones respondem 200 como imagem), instalação disponível; **Visão geral**: os 6 atalhos respondem 200.
- **Celular (375 px)**: nenhuma das 16 telas (Configurações, Financeiro e suas 4 abas, Relatórios, Equipe, ficha do profissional, Assinatura, planos e histórico) tem rolagem horizontal.
- **Relatórios**: nos 5 períodos o faturamento do cartão = soma dos dias do gráfico (R$ 1.603,70 / 3.202,30); as formas de pagamento somam o faturamento menos o a receber (R$ 2.723,40 = 3.202,30 − 478,90).
- **Equipe**: nome "12345" e de 121 letras, telefone "abc123" e de 60 dígitos, especialidade de 121 e observações de 1.001 caracteres recusados com mensagem clara (correções do PR #123 confirmadas ao vivo); caracteres de inversão limpos.

## Pendências e observações (não alteradas aqui)
- **Verificação em duas etapas indisponível em produção**: a variável `TWO_FACTOR_ENCRYPTION_KEY` não existe no servidor local, então a tela mostra "ainda está sendo liberado" e ninguém consegue ativar. O nível
  de segurança continua oferecendo "Ative com o Google Authenticator" (40 dos 100 pontos). Decisão do dono: gerar a chave (32 bytes), **guardar uma cópia fora do PC** e colocar no `site.env`; depois de usada, **nunca trocar**.
- A tela **Empresa** só tem nome e segmento (sem CNPJ, telefone, endereço, logo), e a tabela `company_settings` (fuso, primeiro dia da semana, notificações) existe no banco sem nenhuma tela. Melhoria de produto.
- **Categorias e centros de custo** só podem ser criados: não há renomear nem desativar (a coluna `active` existe). Melhoria de produto (exige migration).
- Nível de segurança mostra "Bom" com 40/100 pontos (só e-mail e senha); "Básico" seria mais honesto até haver segunda etapa.
- Contraste limítrofe no claro: eyebrow "Visão operacional" do Dashboard (4,46:1) e "Hoje" de 10 px na Agenda (4,0:1).

## Dados de teste
Categorias e centros T6 apagados; empresa restaurada para "teste1 / Prestador de serviços"; perfil restaurado; ficha do profissional restaurada; tema voltou para escuro.

## Ainda não verificado ao vivo
As correções desta série (nome da empresa, nome da conta, categorias, contraste) foram verificadas por testes automáticos (5 novos; 1.096 no total, 0 falhas), tipos e lint;
o comportamento antigo foi reproduzido ao vivo. **O reteste no site depende de o PR ser mesclado e de rodar `scripts\publicar.ps1` (sem migration neste PR).**
