# Prime Ges — Fase 7 (Final): Segurança, Criptografia e Preparação de Produção

## Status

**Planejada como a última fase do produto.**

A Fase 7 somente começa depois que os módulos funcionais do Prime Ges, incluindo a Fase 6, estiverem concluídos e validados.

A regra desta fase é: **não usar segurança como justificativa para reescrever módulos estáveis**. Primeiro auditamos e endurecemos o que já existe; só criamos novos componentes quando houver uma lacuna comprovada.

## Objetivo

Levar o Prime Ges ao estado de **produção segura e operável**, cobrindo autenticação e sessões, autorização e RBAC, isolamento multi-tenant, RLS e políticas do Supabase, RPCs e funções privilegiadas, proteção de APIs e webhooks, armazenamento e arquivos, gestão de segredos, criptografia em trânsito, em repouso e, quando realmente necessária, em nível de campo/aplicação, proteção contra abuso e ataques comuns, cadeia de dependências e supply chain, logs, auditoria, alertas, resposta a incidentes, backup, restauração e continuidade, revisão final de configuração do Supabase, GitHub e Vercel e testes de segurança e critérios de liberação.

## Princípio de criptografia

A plataforma não deve criptografar dados indiscriminadamente.

A Fase 7 fará primeiro um **inventário de dados sensíveis** e classificará cada campo em público, interno, confidencial ou altamente sensível.

Depois definiremos o nível de proteção apropriado para cada classe.

### Proteção por camada

**Em trânsito**
- HTTPS/TLS obrigatório para tráfego público;
- conexões de banco com SSL enforced;
- verificação adequada de certificado quando houver conexão direta;
- nenhum segredo enviado ao browser.

**Em repouso**
- aproveitar a criptografia de infraestrutura oferecida pelo provedor;
- validar a configuração real do projeto Supabase e dos backups;
- revisar Storage e dados de autenticação.

**Em nível de aplicação/campo**
- usar somente para dados que realmente exijam sigilo adicional;
- preferir gestão de chaves separada dos dados;
- projetar rotação de chaves e recriptografia;
- nunca guardar a chave de descriptografia junto do dado protegido.

**Não utilizar pgsodium como nova base de criptografia do projeto.**
A documentação atual do Supabase informa que pgsodium está em processo de descontinuação e recomenda o uso de Supabase Vault para gerenciamento de segredos; a documentação também alerta contra a adoção das antigas soluções de Transparent Column Encryption por sua complexidade operacional e risco de configuração.

## 7A — Threat model e inventário

Criar:
- mapa de ativos;
- mapa de fluxos de dados;
- classificação de dados;
- limites de confiança;
- superfícies públicas;
- superfícies administrativas;
- integrações externas;
- ameaças por tenant;
- ameaças contra contas administrativas;
- ameaças contra webhooks e billing;
- cenários de vazamento, fraude, escalada de privilégio e abuso.

Saída: docs/security/threat-model.md

## 7B — Identidade, autenticação e sessão

Auditar:
- cadastro;
- login;
- logout;
- recuperação de senha;
- redefinição de senha;
- expiração de sessão;
- refresh de sessão;
- cookies;
- CSRF quando aplicável;
- rate limiting;
- proteção contra credential stuffing;
- MFA para contas administrativas quando suportado;
- bloqueio/suspensão de usuários;
- revogação de sessões após eventos críticos;
- regras de senha e proteção contra senhas comprometidas.

Também revisar a configuração de Auth do Supabase.

## 7C — Autorização e isolamento multi-tenant

Auditar todas as tabelas e operações SELECT, INSERT, UPDATE, DELETE, RPC, Storage, Route Handlers e Server Actions.

Critério obrigatório:

**ser autenticado nunca pode ser suficiente para acessar dados de outra empresa.**

Cada fluxo sensível deverá comprovar:

usuário → empresa → papel → permissão → recurso → operação

Também testar:
- IDOR/BOLA;
- troca de company_id;
- troca de user_id;
- alteração de role;
- acesso cruzado entre empresas;
- acesso administrativo indevido.

## 7D — Supabase Security Hardening

Executar revisão completa de:
- RLS;
- policies;
- funções SECURITY DEFINER;
- grants;
- Data API;
- Storage policies;
- Auth;
- extensões;
- views;
- triggers;
- índices e funções críticas;
- conexões SSL;
- network restrictions, quando apropriadas;
- secrets/Vault;
- backups.

Toda função SECURITY DEFINER deverá ter motivo documentado e controle explícito de execução.

O Supabase recomenda revisão das policies/RLS e uso do Security Advisor antes de produção.

## 7E — API, webhook e proteção contra abuso

Auditar:
- Route Handlers;
- webhooks EvoPay;
- endpoints públicos;
- Server Actions;
- RPCs;
- uploads;
- importações/exportações.

Implementar conforme necessidade:
- rate limiting;
- validação de payload;
- tamanho máximo de request;
- timeouts;
- proteção contra replay;
- idempotência;
- assinatura/autenticidade de webhook;
- logs sem dados sensíveis;
- mensagens de erro sem vazamento interno.

## 7F — Headers e navegador

Revisar e aplicar, conforme compatibilidade:
- Content Security Policy;
- HSTS;
- frame protection;
- MIME sniffing protection;
- Referrer-Policy;
- Permissions-Policy;
- cookies Secure/HttpOnly/SameSite;
- políticas para uploads;
- proteção contra XSS e clickjacking.

A política CSP deverá ser criada a partir dos recursos realmente utilizados pela aplicação, sem liberar domínios genéricos desnecessariamente.

## 7G — Segredos e chaves

Criar inventário de:
- Supabase keys;
- service role;
- EvoPay;
- webhooks;
- Vercel;
- OAuth;
- Storage;
- qualquer nova integração futura.

Regras:
- nenhum segredo no Git;
- nenhum segredo em código;
- nenhum segredo em NEXT_PUBLIC_;
- rotação documentada;
- revogação documentada;
- segregação por ambiente;
- menor privilégio possível;
- chaves de criptografia separadas dos dados protegidos.

## 7H — Supply chain e dependências

Auditar:
- package-lock.json;
- dependências diretas;
- dependências transitivas;
- scripts de instalação;
- pacotes abandonados;
- vulnerabilidades conhecidas;
- permissões desnecessárias;
- secrets acidentais.

Automação prevista:
- Dependabot;
- GitHub secret scanning;
- CodeQL;
- análise de dependências;
- revisão de lockfile.

Quando fizer sentido, usar ferramentas abertas de supply-chain/security em CI em vez de criar scanners próprios.

## 7I — Storage e documentos

Revisar o bucket de documentos:
- acesso privado;
- URLs assinadas;
- expiração;
- ownership;
- políticas;
- mime type;
- tamanho;
- nomes de arquivo;
- conteúdo potencialmente malicioso;
- remoção/substituição;
- logs de acesso.

Nenhum arquivo privado deve ficar acessível apenas por conhecer uma URL previsível.

## 7J — Auditoria e observabilidade

Centralizar eventos críticos:
- login;
- logout;
- falha de autenticação relevante;
- alteração de senha;
- alteração de papel;
- alteração de permissão;
- acesso administrativo;
- alteração de assinatura;
- pagamento;
- webhook;
- exportação de dados;
- alteração de configurações;
- ações destrutivas;
- eventos de segurança.

Logs devem:
- não armazenar senhas;
- não armazenar tokens;
- não armazenar chaves;
- minimizar dados pessoais;
- possuir retenção definida;
- possuir contexto suficiente para investigação.

## 7K — Backup, restauração e continuidade

A Fase 7 não termina com backup existente.

Precisaremos provar:
- existência do backup;
- retenção;
- restauração em ambiente controlado;
- integridade após restauração;
- procedimento documentado;
- RPO/RTO definidos para o produto;
- plano de incidente;
- rotação/revogação de credenciais em caso de comprometimento.

## 7L — Testes de segurança

Executar uma bateria final.

### Aplicação
- XSS;
- SQL injection;
- CSRF;
- SSRF quando aplicável;
- path traversal;
- upload abuse;
- IDOR/BOLA;
- privilege escalation;
- session abuse;
- rate-limit bypass.

### Multi-tenant
- acesso cruzado A → B;
- alteração cruzada A → B;
- exportação cruzada;
- Storage cruzado;
- RPC cruzado.

### Admin
- usuário comum → /admin;
- owner de empresa → /admin;
- admin de empresa → funções de plataforma;
- mudança indevida de profiles.role;
- acesso a dados de outras empresas.

### Criptografia
- inventário de chaves;
- rotação;
- armazenamento;
- descarte;
- fallback;
- acesso com chave incorreta;
- recriptografia.

## 7M — Verificação final baseada em padrão

Usar o **OWASP ASVS 5.0.0** como referência de verificação técnica final, priorizando os capítulos relevantes para autenticação, autorização, sessão, criptografia, armazenamento, comunicação segura, logging e integração.

A matriz final deverá apontar:
- requisito;
- evidência;
- teste;
- resultado;
- risco;
- correção;
- responsável;
- data da validação.

## 7N — Go-live security gate

O Prime Ges somente poderá ser considerado pronto para produção depois de:
- zero vulnerabilidade crítica aberta;
- vulnerabilidades altas avaliadas e tratadas;
- RLS validado;
- isolamento multi-tenant validado;
- Admin validado;
- secrets auditados;
- criptografia validada;
- backups restaurados em teste;
- webhooks validados;
- logs/auditoria funcionando;
- dependências auditadas;
- headers/security config revisados;
- documentação de incidentes pronta;
- checklist final assinado.

## Regra de ouro da Fase 7

A Fase 7 **não deve ser desenvolvida parcialmente durante as fases anteriores**, salvo correções de segurança críticas descobertas durante o desenvolvimento.

A intenção é que, ao chegar ao final:

Fases funcionais
→ Fase 6 — Administração/Governança
→ **Fase 7 — Segurança + Criptografia + Go-Live**

Somente depois do fechamento dessa cadeia será feita a preparação definitiva para produção.

## Referências técnicas

- OWASP ASVS 5.0.0
- OWASP Cheat Sheet Series
- Supabase Security / Production Checklist
- Supabase Vault para gestão de segredos
- GitHub CodeQL / Dependabot / Secret Scanning

Nenhum código dessas referências será copiado sem avaliação prévia de licença, manutenção, segurança, compatibilidade e necessidade.
