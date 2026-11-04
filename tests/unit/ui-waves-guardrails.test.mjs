import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * Travas do plano de novo visual (docs/ui/PLANO_IMPLANTACAO_NOVO_VISUAL_20261102.md). As ondas mudam só a
 * apresentação: estas checagens impedem, sem querer, trocar a base técnica ou enfraquecer guardas.
 * Se uma decisão do dono mudar o plano (ex.: aprovar uma biblioteca de gráficos), atualize o plano e esta lista.
 */
const base = new URL("../../", import.meta.url);
const read = (p) => readFileSync(new URL(p, base), "utf8");
const pkg = JSON.parse(read("package.json"));
const deps = { ...pkg.dependencies, ...pkg.devDependencies };

describe("base técnica preservada (regra fixa 1 e decisão D2)", () => {
  it("mantém React 18, Tailwind 3 e Zod 3", () => {
    assert.match(deps.react, /^\^?18\./);
    assert.match(deps.tailwindcss, /^\^?3\./);
    assert.match(deps.zod, /^\^?3\./);
  });

  it("não adiciona as bibliotecas dos templates sem decisão do dono", () => {
    for (const name of ["recharts", "motion", "framer-motion", "next-themes", "react-hook-form", "@tanstack/react-table", "nuqs"]) {
      assert.equal(deps[name], undefined, `${name} exige aprovação (decisões D1–D3 do plano)`);
    }
    assert.ok(!Object.keys(deps).some((name) => name.startsWith("@base-ui")), "Base UI: o projeto usa Radix");
  });
});

describe("guardas e rotas fora do escopo visual (regra fixa 2)", () => {
  it("o admin continua protegido por requirePlatformAdmin e o middleware pelas camadas conhecidas", () => {
    assert.match(read("src/app/admin/layout.tsx"), /requirePlatformAdmin\(/);
    const middleware = read("src/middleware.ts");
    assert.match(middleware, /isActivePlatformAdmin/);
    assert.match(middleware, /session_slot_status/);
    assert.match(middleware, /get_my_legal_consent_status/);
  });

  it("o layout do app mantém a ordem de proteção (sessão, consentimento, empresa)", () => {
    const layout = read("src/app/(app)/layout.tsx");
    // posição das chamadas (não dos imports, que vêm em outra ordem)
    const gateCall = layout.indexOf("await evaluateSessionGate(");
    const consentCall = layout.indexOf("await requireLegalConsent(");
    assert.ok(gateCall > -1 && consentCall > gateCall, "evaluateSessionGate deve rodar antes de requireLegalConsent");
    assert.match(layout, /\/onboarding/);
  });

  it("páginas públicas não importam o Clerk", () => {
    for (const file of ["src/components/marketing/site-header.tsx", "src/components/marketing/site-footer.tsx"]) {
      assert.doesNotMatch(read(file), /@clerk\//, file);
    }
  });
});

describe("licença e verificação pós-deploy (regras fixas 5 e 7)", () => {
  it("THIRD_PARTY_NOTICES.md cita as quatro referências MIT", () => {
    const notices = read("THIRD_PARTY_NOTICES.md");
    for (const owner of ["shadcn-ui/ui", "shadcnstore/shadcn-dashboard-landing-template", "Kiranism/next-shadcn-dashboard-starter", "satnaing/shadcn-admin"]) {
      assert.ok(notices.includes(owner), owner);
    }
    assert.match(notices, /Permission is hereby granted, free of charge/);
  });

  it("o script de verificação existe, só lê e não depende de pacotes", () => {
    assert.ok(existsSync(new URL("scripts/verify-production.mjs", base)));
    const script = read("scripts/verify-production.mjs");
    assert.doesNotMatch(script, /method:\s*["'](POST|PUT|PATCH|DELETE)/i);
    assert.doesNotMatch(script, /from\s+["'](?!node:)[^"']+["']/);
  });

  it("o rodapé continua expondo o commit publicado para essa verificação", () => {
    assert.match(read("src/components/marketing/site-footer.tsx"), /data-build-sha=\{BUILD_SHA\}/);
  });
});

describe("Onda B1 — Home: Funcionalidades e Segmentos sem conteúdo inventado", () => {
  const home = read("src/app/(public)/page.tsx");

  it("os cartões só mostram módulos disponíveis (nunca 'em breve' como pronto)", () => {
    assert.match(home, /FEATURES\.filter\(\(feature\) => feature\.available\)\.map\(\(feature\) => \[feature\.name, feature\]\)/);
    assert.match(home, /FEATURE_BY_NAME\.get\(name\)/);
  });

  it("não há depoimentos, logos de clientes nem números de uso na home (D6)", () => {
    assert.doesNotMatch(home, /depoimento|testimonial|nossos clientes|clientes atendidos|\+\s?\d+\s?(mil\s)?(empresas|usuários)/i);
  });

  it("o rótulo dos segmentos não afirma estatística de uso", () => {
    assert.match(home, /Módulos indicados/);
    assert.doesNotMatch(home, /mais usados/i);
  });
});

describe("Onda B2 — Home: Diferenciais, chamada final e rodapé", () => {
  const home = read("src/app/(public)/page.tsx");
  const footer = read("src/components/marketing/site-footer.tsx");

  it("os diferenciais continuam vindo de DIFFERENTIALS (afirmações reais do produto)", () => {
    assert.match(home, /DIFFERENTIALS\.map\(\(item, index\)/);
  });

  it("a chamada final mantém os links de cadastro e login e só cita fatos já existentes na home", () => {
    assert.match(home, /siteConfig\.links\.register/);
    assert.match(home, /siteConfig\.links\.login/);
    assert.match(home, /home-v4-cta__trust/);
    assert.match(home, /Sem renovação automática/);
  });

  it("o rodapé preserva todas as colunas de links legais, o commit publicado e não importa o Clerk", () => {
    for (const href of ["/termos-de-uso", "/politica-de-privacidade", "/politica-de-reembolso", "/direitos-do-titular", "/#precos", "/#faq"]) {
      assert.ok(footer.includes(href), href);
    }
    assert.match(footer, /data-build-sha=\{BUILD_SHA\}/);
    assert.doesNotMatch(footer, /@clerk\//);
  });
});

describe("Onda C — login e cadastro: moldura nova, fluxo do Clerk e do aceite intactos", () => {
  const card = read("src/components/shared/auth/auth-card.tsx");
  const login = read("src/app/(public)/login/page.tsx");
  const register = read("src/app/(public)/register/page.tsx");

  it("a moldura não importa o Clerk (o escopo do Clerk fica nas páginas de login/cadastro)", () => {
    assert.doesNotMatch(card, /@clerk\//);
  });

  it("o login mantém SignIn, redirecionamento seguro e aparência do Clerk", () => {
    assert.match(login, /<SignIn/);
    assert.match(login, /safeNextPath\(/);
    assert.match(login, /appearance=\{clerkAppearance\}/);
  });

  it("o cadastro continua em duas etapas: aceite assinado no servidor antes do SignUp", () => {
    assert.match(register, /verifySignupIntent\(/);
    assert.match(register, /startSignupAction/);
    assert.ok(register.indexOf("<ConsentForm") < register.indexOf("<SignUp"), "aceite vem antes do formulário do Clerk");
    assert.match(register, /step=\{\{ current: 1, total: 2 \}\}/);
    assert.match(register, /step=\{\{ current: 2, total: 2 \}\}/);
  });

  it("os selos do painel só repetem fatos já publicados na home", () => {
    for (const fact of ["Pagamento por Pix", "Sem renovação automática", "Sem instalar nada"]) {
      assert.ok(card.includes(fact), fact);
      assert.ok(read("src/app/(public)/page.tsx").includes(fact) || read("src/config/marketing.ts").includes(fact), fact + " deve existir na home");
    }
  });
});

describe("Onda D1 — casca da área logada: só apresentação", () => {
  const sidebar = read("src/components/app/app-sidebar.tsx");
  const header = read("src/components/app/header.tsx");
  const shell = read("src/components/app/app-shell.tsx");

  it("mantém navegação por grupos, estado ativo acessível e menu do usuário", () => {
    assert.match(sidebar, /NAV_GROUPS\.map/);
    assert.match(sidebar, /aria-current=\{isActive \? "page" : undefined\}/);
    assert.match(sidebar, /<UserMenu/);
    assert.match(sidebar, /aria-label="Navegação principal"/);
  });

  it("o cabeçalho continua com breadcrumb, busca rápida e notificações", () => {
    assert.match(header, /buildAppBreadcrumbs\(/);
    assert.match(header, /<CommandMenu/);
    assert.match(header, /<NotificationButton/);
    assert.match(header, /Localização na área da empresa/);
  });

  it("a casca mantém o skip link e o container do conteúdo", () => {
    assert.match(shell, /Pular para o conteúdo/);
    assert.match(shell, /id="conteudo-principal"/);
  });

  it("a casca não importa Clerk nem Supabase (apresentação apenas)", () => {
    for (const source of [sidebar, header, shell]) {
      assert.doesNotMatch(source, /@clerk\/|@\/lib\/supabase/);
    }
  });
});

describe("Onda E (piloto Clientes): visual novo, mesma funcionalidade", () => {
  const page = read("src/app/(app)/app/clientes/page.tsx");
  const table = read("src/components/app/customer-table.tsx");
  const filters = read("src/components/app/customer-filters.tsx");
  const search = read("src/components/app/customer-search.tsx");
  const toolbar = read("src/components/app/list-toolbar.tsx");

  it("a página mantém as mesmas consultas do servidor e a paginação por URL", () => {
    assert.match(page, /getCustomerStats\(companyId\)/);
    assert.match(page, /listCustomers\(\{ companyId, search: q, status, page \}\)/);
    assert.match(page, /basePath="\/app\/clientes"/);
    assert.match(page, /EmptyState/);
  });

  it("a tabela preserva links de ver/editar e os botões de desativar/reativar", () => {
    assert.match(table, /\/app\/clientes\/\$\{customer\.id\}\/editar/);
    assert.match(table, /<DeactivateCustomerButton/);
    assert.match(table, /<ReactivateCustomerButton/);
    assert.match(table, /<CustomerStatusBadge/);
  });

  it("busca e filtros continuam guiados pela URL (?q, ?status) e resetam a página", () => {
    for (const source of [filters, search]) {
      assert.match(source, /params\.delete\("page"\)/);
      assert.match(source, /router\.push\(/);
    }
    assert.match(filters, /params\.set\("status", value\)/);
    assert.match(search, /params\.set\("q", value\)/);
    assert.match(filters, /aria-pressed=/);
    assert.match(search, /aria-label="Buscar clientes por nome, telefone, e-mail ou documento"/);
  });

  it("os componentes novos não acessam banco nem dependências novas", () => {
    for (const source of [toolbar, table, filters, search]) {
      assert.doesNotMatch(source, /@\/lib\/supabase|@clerk\//);
    }
  });

  it("existe esqueleto de carregamento específico e acessível", () => {
    const loading = read("src/components/app/list-loading.tsx");
    assert.match(loading, /aria-busy="true"/);
    assert.match(loading, /role="status"/);
    assert.match(read("src/app/(app)/app/clientes/loading.tsx"), /ListLoading/);
  });
});

describe("Clientes no celular: as ações precisam estar acessíveis sem rolar para o lado", () => {
  const table = read("src/components/app/customer-table.tsx");

  it("há um bloco de ações visível só no celular (sm:hidden) e outro na coluna Ações (hidden sm:table-cell)", () => {
    assert.match(table, /sm:hidden/);
    assert.match(table, /hidden px-4 py-3 sm:table-cell/);
    assert.equal((table.match(/<DeactivateCustomerButton/g) ?? []).length, 2);
    assert.equal((table.match(/<ReactivateCustomerButton/g) ?? []).length, 2);
  });

  it("não impõe largura mínima no celular (só a partir de sm)", () => {
    assert.match(table, /sm:min-w-\[560px\]/);
    assert.doesNotMatch(table, /"w-full min-w-\[/);
  });
});

describe("Onda E (lote 2): Produtos, Serviços e Vendas no mesmo padrão, mesma funcionalidade", () => {
  const modules = [
    { dir: "produtos", table: "product-table", search: "product-search", queries: [/getProductStats\(companyId\)/, /listProducts\(\{/], buttons: [/<DeactivateProductButton/, /<ReactivateProductButton/], edit: /\/app\/produtos\/\$\{product\.id\}\/editar/ },
    { dir: "servicos", table: "service-table", search: "service-search", queries: [/getServiceStats\(companyId\)/, /listServices\(\{/], buttons: [/<DeactivateServiceButton/, /<ReactivateServiceButton/], edit: /\/app\/servicos\/\$\{service\.id\}\/editar/ },
    { dir: "vendas", table: "sale-table", search: "sale-search", queries: [/getSaleStats\(companyId, range\.from, range\.to\)/, /listSales\(\{/], buttons: [/<CancelSaleButton/], edit: /\/app\/vendas\/\$\{sale\.id\}/ },
  ];

  for (const m of modules) {
    it(`${m.dir}: mesmas consultas do servidor, paginação por URL e barra de lista nova`, () => {
      const page = read(`src/app/(app)/app/${m.dir}/page.tsx`);
      for (const query of m.queries) assert.match(page, query);
      assert.match(page, /<ListToolbar/);
      assert.match(page, /<ListSummary/);
      assert.match(page, new RegExp(`basePath="/app/${m.dir}"`));
    });

    it(`${m.dir}: tabela mantém ações e tem versão para celular sem rolar para o lado`, () => {
      const table = read(`src/components/app/${m.table}.tsx`);
      for (const button of m.buttons) assert.match(table, button);
      assert.match(table, m.edit);
      assert.match(table, /sm:hidden/);
      assert.match(table, /hidden px-4 py-3 sm:table-cell/);
      assert.match(table, /sm:min-w-\[/);
      assert.doesNotMatch(table, /"w-full min-w-\[/);
    });

    it(`${m.dir}: busca com rótulo acessível e ainda guiada pela URL (?q)`, () => {
      const search = read(`src/components/app/${m.search}.tsx`);
      assert.match(search, /aria-label="Buscar /);
      assert.match(search, /params\.set\("q", value\)/);
      assert.match(search, /params\.delete\("page"\)/);
    });

    it(`${m.dir}: esqueleto de carregamento próprio`, () => {
      assert.match(read(`src/app/(app)/app/${m.dir}/loading.tsx`), /ListLoading/);
    });
  }

  it("Vendas continua restringindo o cancelamento (owner/admin sempre; funcionário só a própria venda)", () => {
    const table = read("src/components/app/sale-table.tsx");
    assert.match(table, /role === "owner" \|\| role === "admin"/);
    assert.match(table, /sale\.user_id === userId/);
    assert.match(table, /sale\.status !== "completed"/);
  });
});

describe("Onda E (lote 3): Estoque, Compras e Fornecedores, mesma funcionalidade", () => {
  const stock = read("src/app/(app)/app/estoque/page.tsx");
  const purchases = read("src/app/(app)/app/compras/page.tsx");
  const suppliers = read("src/app/(app)/app/fornecedores/page.tsx");

  it("Estoque mantém a mesma consulta e as mesmas regras de nível de estoque", () => {
    assert.match(stock, /listProducts\(\{ companyId: current\.company\.id, status: "active", pageSize: 1000, sortBy: "stock", sortDirection: "asc" \}\)/);
    assert.match(stock, /getStockLevel\(p\) === "out"/);
    assert.match(stock, /getStockLevel\(p\) === "low"/);
    assert.match(stock, /\/app\/compras/);
  });

  it("Compras mantém as consultas, o link do pedido e dá cor a todos os status do pedido", () => {
    assert.match(purchases, /getPurchaseStats\(current\.company\.id\)/);
    assert.match(purchases, /listPurchaseOrders\(current\.company\.id\)/);
    assert.match(purchases, /"\/app\/compras\/" \+ order\.id/);
    for (const status of ["draft", "ordered", "partially_received", "received", "cancelled"]) {
      assert.match(purchases, new RegExp(`${status}: "`), status);
    }
    assert.match(purchases, /hidden px-4 py-3 [^"]*md:table-cell/);
    assert.match(purchases, /sm:min-w-\[/);
    assert.doesNotMatch(purchases, /"w-full min-w-\[/);
  });

  it("Fornecedores mantém busca por GET (?q), as mesmas consultas e o link do fornecedor", () => {
    assert.match(suppliers, /getSupplierStats\(current\.company\.id\)/);
    assert.match(suppliers, /listSuppliers\(current\.company\.id, searchParams\?\.q\)/);
    assert.match(suppliers, /name="q"/);
    assert.match(suppliers, /\/app\/fornecedores\/\$\{s\.id\}/);
    assert.match(suppliers, /aria-label="Buscar fornecedores"/);
  });

  it("os três módulos têm esqueleto de carregamento e nenhum acessa banco direto na apresentação", () => {
    for (const dir of ["estoque", "compras", "fornecedores"]) {
      assert.match(read(`src/app/(app)/app/${dir}/loading.tsx`), /ListLoading/);
    }
    for (const source of [stock, purchases, suppliers]) {
      assert.doesNotMatch(source, /@\/lib\/supabase|@clerk\//);
    }
  });
});

describe("Onda E (lote 4): Caixa e Financeiro, só apresentação", () => {
  const cash = read("src/app/(app)/app/caixa/page.tsx");
  const movements = read("src/components/app/cash-movements-table.tsx");
  const finance = read("src/app/(app)/app/financeiro/page.tsx");

  it("Caixa mantém as consultas, a regra de quem opera e todos os formulários", () => {
    assert.match(cash, /getCurrentOpenCashRegister\(current\.company\.id\)/);
    assert.match(cash, /getLastClosedCashRegister\(current\.company\.id\)/);
    assert.match(cash, /listCashMovements\(openRegister\.id\)/);
    assert.match(cash, /summarizeCashMovements\(/);
    assert.match(cash, /const canOperate = current\.role === "owner" \|\| current\.role === "admin"/);
    for (const form of ["CashRegisterOpenForm", "CashRegisterCloseForm", "CashMovementForm"]) {
      assert.match(cash, new RegExp(`<${form}`), form);
    }
    assert.match(cash, /prime-module-page--caixa/);
  });

  it("o histórico do caixa continua sem coluna de ações (imutável) e sem largura mínima no celular", () => {
    assert.doesNotMatch(movements, /<TableHead[^>]*>Ações|<Link|<button/);
    assert.match(movements, /sm:min-w-\[/);
    assert.doesNotMatch(movements, /"w-full min-w-\[/);
  });

  it("Financeiro mantém a consulta única, as visões e os formulários só para owner/admin", () => {
    assert.match(finance, /getFinanceWorkspace\(current\.company\.id\)/);
    assert.match(finance, /const canOperate = current\.role === "owner" \|\| current\.role === "admin"/);
    for (const view of ['view === "pagar"', 'view === "receber"', 'view === "lancamentos"', 'view === "estrutura"']) {
      assert.ok(finance.includes(view), view);
    }
    for (const form of ["AccountsPayablePaymentForm", "SalePaymentForm", "FinancialEntryForm", "FinancialCategoryForm", "CostCenterForm"]) {
      assert.match(finance, new RegExp(`<${form}`), form);
    }
    assert.match(finance, /canOperate \?/);
  });

  it("Financeiro: navegação acessível e situação da conta em português", () => {
    assert.match(finance, /aria-label="Seções do financeiro"/);
    assert.match(finance, /aria-current=\{current === key \? "page" : undefined\}/);
    for (const label of ["Em aberto", "Pago parcialmente", "Pago", "Cancelado"]) {
      assert.ok(finance.includes(`"${label}"`), label);
    }
  });

  it("esqueletos de carregamento próprios e nenhuma apresentação acessa banco direto", () => {
    for (const dir of ["caixa", "financeiro"]) {
      assert.match(read(`src/app/(app)/app/${dir}/loading.tsx`), /ListLoading/);
    }
    for (const source of [cash, movements, finance]) {
      assert.doesNotMatch(source, /@\/lib\/supabase|@clerk\//);
    }
  });
});

describe("Onda E (lote 5): Agenda, Equipe e Fidelidade, só apresentação", () => {
  const agenda = read("src/app/(app)/app/agenda/page.tsx");
  const team = read("src/app/(app)/app/equipe/page.tsx");
  const loyalty = read("src/app/(app)/app/fidelidade/page.tsx");
  const loyaltyTabs = read("src/components/app/loyalty-tabs.tsx");

  it("Agenda mantém as consultas, a navegação por data/profissional e os formulários de ação", () => {
    for (const query of [/listAppointments\(current\.company\.id, date, professional\)/, /getAgendaStats\(current\.company\.id, date\)/, /listAgendaServices\(current\.company\.id\)/]) {
      assert.match(agenda, query);
    }
    assert.match(agenda, /shiftDate\(date, -1\)/);
    assert.match(agenda, /shiftDate\(date, 1\)/);
    for (const form of ["AppointmentForm", "AppointmentStatusForm", "RescheduleForm"]) {
      assert.match(agenda, new RegExp(`<${form}`), form);
    }
    assert.match(agenda, /aria-label="Navegar entre os dias"/);
    assert.match(agenda, /aria-current=/);
  });

  it("Equipe mantém consultas, regra de gestão (owner/admin), limites de assentos e formulários", () => {
    assert.match(team, /listCompanyTeam\(\)/);
    assert.match(team, /getSeatUsage\(\)/);
    assert.match(team, /const canManage = current\.role === "owner" \|\| current\.role === "admin"/);
    for (const form of ["AddMemberForm", "MemberRoleForm", "RemoveMemberForm", "TeamMemberCard"]) {
      assert.match(team, new RegExp(`<${form}`), form);
    }
    assert.match(team, /seats\.overLimit/);
    assert.match(team, /xl:hidden/);
    assert.match(team, /\/app\/assinatura\/planos/);
  });

  it("Fidelidade mantém a busca de dados por aba, as quatro abas e a regra de edição", () => {
    for (const query of [/getLoyaltySettings\(/, /getLoyaltyTierThresholds\(/, /getLoyaltyMultipliers\(/, /getLoyaltyCampaigns\(/]) {
      assert.match(loyalty, query);
    }
    assert.match(loyalty, /const canEdit = current\.role === "owner" \|\| current\.role === "admin"/);
    for (const tab of ["configuracoes", "multiplicadores", "niveis", "campanhas"]) {
      assert.ok(loyaltyTabs.includes(`key: "${tab}"`), tab);
    }
    assert.match(loyaltyTabs, /aria-label="Seções da fidelidade"/);
    assert.match(loyaltyTabs, /aria-current=\{isActive \? "page" : undefined\}/);
  });

  it("esqueletos de carregamento e nenhuma apresentação acessa banco direto", () => {
    for (const dir of ["agenda", "equipe", "fidelidade"]) {
      assert.match(read(`src/app/(app)/app/${dir}/loading.tsx`), /ListLoading/);
    }
    for (const source of [agenda, team, loyalty, loyaltyTabs]) {
      assert.doesNotMatch(source, /@\/lib\/supabase|@clerk\//);
    }
  });
});

describe("Onda E (lote 6): Relatórios e Assinatura, só apresentação", () => {
  const reports = read("src/app/(app)/app/relatorios/page.tsx");
  const subscription = read("src/app/(app)/app/assinatura/page.tsx");
  const plans = read("src/app/(app)/app/assinatura/planos/page.tsx");
  const history = read("src/app/(app)/app/assinatura/historico/page.tsx");

  it("Relatórios mantém a consulta, os períodos, a exportação CSV e o aviso de dados reais", () => {
    assert.match(reports, /getReportsWorkspace\(current\.company\.id, period\)/);
    for (const period of ['"today"', '"7d"', '"30d"', '"month"', '"year"']) assert.ok(reports.includes(period), period);
    assert.match(reports, /\/app\/relatorios\/export\?period=/);
    assert.match(reports, /Nenhuma métrica fictícia/);
    assert.match(reports, /aria-label="Período do relatório"/);
    assert.match(reports, /aria-current=/);
  });

  it("Assinatura mantém consultas, regras de expiração/vitalício, teste grátis e links de plano e histórico", () => {
    for (const query of [/getCurrentSubscription\(companyId\)/, /getSubscriptionPayments\(companyId\)/, /getMyTrialStatus\(\)/, /isSubscriptionAccessActive\(subscription\)/]) {
      assert.match(subscription, query);
    }
    assert.match(subscription, /<RequestTrialButton/);
    assert.match(subscription, /\/app\/assinatura\/planos/);
    assert.match(subscription, /\/app\/assinatura\/historico/);
    assert.match(subscription, /Continuar pagamento/);
    assert.match(subscription, /Acesso suspenso/);
    assert.match(subscription, /Vitalício/);
  });

  it("Planos usa o mesmo catálogo da home e o histórico mantém o link do Pix pendente", () => {
    assert.match(plans, /getPublicPlans\(\{ authenticated: true \}\)/);
    assert.match(plans, /<PlanCard/);
    assert.match(history, /getSubscriptionPayments\(current\.company\.id\)/);
    assert.match(history, /\/app\/assinatura\/pagamento\/\$\{payment\.id\}/);
    assert.match(history, /sm:table-cell/);
  });

  it("esqueletos de carregamento e nenhuma apresentação acessa banco direto", () => {
    for (const dir of ["relatorios", "assinatura"]) {
      assert.match(read(`src/app/(app)/app/${dir}/loading.tsx`), /ListLoading/);
    }
    for (const source of [reports, subscription, plans, history]) {
      assert.doesNotMatch(source, /@\/lib\/supabase|@clerk\//);
    }
  });
});

describe("Onda F1: casca do painel admin no novo visual, guardas intactas", () => {
  const layout = read("src/app/admin/layout.tsx");
  const sidebar = read("src/components/admin/admin-sidebar.tsx");
  const header = read("src/components/admin/admin-header.tsx");
  const shell = read("src/components/admin/admin-shell.tsx");

  it("o layout continua exigindo administrador da plataforma e respeitando o limite de sessões", () => {
    assert.match(layout, /await requirePlatformAdmin\(\)/);
    assert.match(layout, /evaluateSessionGate\(user\.id\)/);
    assert.match(layout, /robots: \{ index: false, follow: false \}/);
    assert.match(layout, /export const dynamic = "force-dynamic"/);
  });

  it("a barra lateral continua escondendo o que é só de super_admin e marcando o item ativo", () => {
    assert.match(sidebar, /item\.superAdminOnly \|\| role === "super_admin"/);
    assert.match(sidebar, /aria-current=\{isActive \? "page" : undefined\}/);
    assert.match(sidebar, /\/app/);
  });

  it("a casca usa as mesmas classes visuais da área da empresa (D1)", () => {
    assert.match(sidebar, /prime-app-sidebar/);
    assert.match(sidebar, /prime-app-sidebar__brand/);
    assert.match(sidebar, /prime-app-nav-item/);
    assert.match(header, /prime-app-header/);
    assert.match(shell, /prime-app-main/);
    const css = read("src/app/globals.css");
    for (const cls of [".prime-app-sidebar", ".prime-app-header", ".prime-app-main"]) assert.ok(css.includes(cls), cls);
  });

  it("o cabeçalho mantém breadcrumb, selo do papel e o link de volta ao app", () => {
    assert.match(header, /<Breadcrumb/);
    assert.match(header, /roleLabel/);
    assert.match(header, /href="\/app"/);
    assert.match(shell, /Pular para o conteúdo/);
    assert.match(shell, /id="conteudo-principal"/);
  });

  it("a casca do admin não acessa banco nem Clerk diretamente", () => {
    for (const source of [sidebar, header, shell]) {
      assert.doesNotMatch(source, /@\/lib\/supabase|@clerk\//);
    }
  });
});
