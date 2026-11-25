# Fotos da modelo (geradas por IA) para o site

O site usa **uma única modelo**, gerada por IA, só para demonstrar o produto. Ela não é cliente e o site não coloca fala, nome ou depoimento ao lado dela. O rodapé informa que as imagens são ilustrativas e geradas por IA.

## Como gerar (ChatGPT, Gemini ou outro gerador de imagens)

1. Gere primeiro a **foto 1**. Quando gostar do rosto, peça as outras **na mesma conversa**, começando com "a mesma pessoa, mesma roupa, mesmo lugar". Assim a modelo não muda de uma foto para outra.
2. Baixe no maior tamanho que o gerador permitir.
3. Envie as imagens aqui no chat (ou diga em que pasta salvou), com os nomes abaixo. Pode ser `.png`, `.jpg` ou `.webp`.

### Texto-base (cole antes de cada pedido)

> Fotografia realista, aparência de câmera profissional com lente 50 mm. Mulher brasileira de cerca de 30 anos, dona de uma padaria pequena, cabelo castanho curto, camiseta branca e avental mostarda. Ambiente escuro e acolhedor, madeira e luz quente lateral, fundo levemente desfocado. Pele com textura natural, mãos corretas, expressão espontânea. Sem texto, sem logotipos, sem marcas d'água. Quando houver tablet ou celular, a tela fica virada para a pessoa, não para a câmera.

| Nome do arquivo | Formato | Pedido |
|---|---|---|
| `modelo-1-balcao` | horizontal 3:2 | Atrás do balcão, segurando um tablet, olhando para a câmera com um leve sorriso. Ela fica na metade direita; o lado esquerdo é escuro e sem objetos. |
| `modelo-2-tablet` | vertical 4:5 | Da cintura para cima, tocando na tela do tablet, olhando para ele, concentrada. |
| `modelo-3-pagamento` | horizontal 3:2 | Entregando um pacote de pães para um cliente que aproxima o celular para pagar. O cliente aparece de costas. |
| `modelo-4-fechamento` | horizontal 3:2 | No fim do dia, sentada a uma mesa da padaria com um notebook e um caderno, tranquila. |
| `modelo-5-sorriso` | vertical 4:5 | Na porta da padaria, braços cruzados, sorrindo, tablet na mão. |

## O que acontece enquanto as fotos não chegam

O site fica completo sem elas: no topo das páginas aparece uma tela do próprio sistema, e os outros espaços de foto não ocupam lugar. Quando as imagens chegarem, elas vão para `public/marketing/` e são registradas em `src/config/marketing-photos.ts`.

| Arquivo | Espaço no código | Onde aparece |
|---|---|---|
| `modelo-1-balcao` | `balcao` | Topo da home |
| `modelo-2-tablet` | `tablet` | Home (módulos) e topo de Recursos |
| `modelo-3-pagamento` | `pagamento` | Home (diferenciais) e topo de Produto |
| `modelo-4-fechamento` | `fechamento` | Produto e topo de Para quem é |
| `modelo-5-sorriso` | `sorriso` | Chamada final de todas as páginas |
