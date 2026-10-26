# Scripts de medição (laboratório) — Etapa 6

Não fazem parte do produto nem do `package.json`. Usam só Node 24 e o Chrome instalado (protocolo CDP), sem dependências.

- `measure.mjs <rótulo> <saida.json> [execuções-home] [execuções-outras]`: abre cada página em aba nova, cache desligado, perfis desktop (1350x940) e celular (390x844 @3x, CPU 4x, rede 1,6 Mbps / RTT 150 ms). Variáveis: `MEASURE_BASE` (padrão http://localhost:3100), `ONLY_PAGES` (lista separada por vírgula), `CHROME_PATH`.
- `compare_e6.mjs <pasta>`: junta `e6cmp_base_r{1,2,3}.json` e `e6cmp_e6_r{1,2,3}.json` e imprime medianas e execuções individuais.

Procedimento usado: dois builds de produção (main publicada e Etapa 6) servidos ao mesmo tempo em portas diferentes; rodadas intercaladas base/Etapa 6. Resultado bruto: `../comparacao.txt`. TBT aqui é proxy de laboratório, não INP.
