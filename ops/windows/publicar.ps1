# Publicação segura do Prime Ges no servidor local. Um comando, com travas:
#
#   powershell -File scripts\publicar.ps1                 # publica o que está na main do GitHub
#   powershell -File scripts\publicar.ps1 -DryRun         # só mostra o que faria (não altera nada)
#
# Travas (qualquer falha ANTES da troca aborta sem mexer no site):
#   T1  a main precisa ter o CI verde (pule só com -PularCI, e diga por quê)
#   T3  backup novo com restauração de teste (o banco é pequeno: leva segundos)
#   T5  migrations novas (a partir de 20261121000000) só entram com script de volta em supabase\rollback\,
#       numa transação única, com lock_timeout/statement_timeout, e ficam registradas em ops.applied_migrations
#   T9  depois da troca: teste de fumaça (saúde, login, estado da manutenção); se falhar, VOLTA SOZINHO para a imagem anterior
# A imagem anterior fica guardada como primeges-web:prev-AAAAMMDD-HHMM (volta manual: ver LEIA-ME).
param(
  [string]$Repo = "C:\Users\HAKARI\Downloads\saas-project\saas-project-fase3",
  [switch]$DryRun,
  [switch]$PularCI,
  [switch]$SemMigrations
)
$ErrorActionPreference = "Continue"
$root = "E:\primeges-local"
$logs = Join-Path $root "logs"
New-Item -ItemType Directory -Force $logs | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmm"
$log = Join-Path $logs "publicar-$stamp.log"
$ledgerStart = "20261121000000"   # migrations anteriores foram aplicadas à mão (sem registro); daqui em diante há registro

function Say($m, $cor = "White") { $l = "{0:HH:mm:ss} {1}" -f (Get-Date), $m; Write-Host $l -ForegroundColor $cor; Add-Content -Path $log -Value $l -Encoding utf8 }
function Fail($m) { Say "ABORTADO: $m" "Red"; Say "Nada foi trocado no site." "Red"; exit 1 }
function Psql($sql) { $sql | docker exec -i primeges-db-1 psql -U postgres -d postgres -v ON_ERROR_STOP=1 -At 2>&1 }

Say "Publicação iniciada (DryRun=$DryRun)"

# ---------------------------------------------------------------- 0) código da main
git -C $Repo fetch -q origin 2>&1 | Out-Null
$sha = (git -C $Repo rev-parse origin/main).Trim()
$short = $sha.Substring(0, 7)
Say "main do GitHub: $short"
if (-not $DryRun) { git -C $Repo checkout -q --detach origin/main 2>&1 | Out-Null }

# ---------------------------------------------------------------- 1) CI verde
if (-not $PularCI) {
  $runs = gh run list --repo bartolomeu7/saas-project --commit $sha --json conclusion,status --limit 5 2>$null | ConvertFrom-Json
  $ok = $runs | Where-Object { $_.conclusion -eq "success" }
  if (-not $ok) { Fail "o CI da main ($short) não está verde (ou ainda roda). Use -PularCI só se souber o motivo." }
  Say "CI verde na main" "Green"
} else { Say "CI pulado (-PularCI)" "Yellow" }

# ---------------------------------------------------------------- 2) migrations pendentes
$pending = @()
if (-not $SemMigrations) {
  if ($DryRun) {
    # ensaio: não cria nada no banco; se o registro ainda não existe, nenhuma migration está registrada
    $exists = (Psql "select to_regclass('ops.applied_migrations') is not null") -join ""
    $applied = if ($exists -eq "t") { @(Psql "select filename from ops.applied_migrations") } else { @() }
  } else {
    Psql "create schema if not exists ops; create table if not exists ops.applied_migrations (filename text primary key, checksum text not null, applied_at timestamptz not null default now(), applied_by text);" | Out-Null
    $applied = @(Psql "select filename from ops.applied_migrations")
  }
  $files = Get-ChildItem (Join-Path $Repo "supabase\migrations") -Filter "*.sql" | Where-Object { $_.Name -match "^(\d{14})_" -and $Matches[1] -ge $ledgerStart } | Sort-Object Name
  foreach ($f in $files) {
    if ($applied -contains $f.Name) { continue }
    $down = Join-Path $Repo ("supabase\rollback\" + ($f.BaseName) + ".down.sql")
    if (-not (Test-Path $down)) { Fail "a migration $($f.Name) não tem script de volta em supabase\rollback\ ($($f.BaseName).down.sql)" }
    $pending += $f
  }
  Say ("Migrations pendentes: {0}" -f $(if ($pending.Count) { ($pending.Name -join ", ") } else { "nenhuma" }))
}

if ($DryRun) { Say "DryRun: parei aqui (nada foi alterado)." "Cyan"; exit 0 }

# ---------------------------------------------------------------- 3) backup verificado (só se houver migration)
if ($pending.Count -gt 0) {
  Say "Backup antes das migrations..."
  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root "scripts\backup.ps1") | Select-Object -Last 3 | ForEach-Object { Say $_ }
  $ultimo = Get-ChildItem (Join-Path $root "backups") -Filter "*.dump" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (-not $ultimo -or ((Get-Date) - $ultimo.LastWriteTime).TotalMinutes -gt 10) { Fail "não consegui um backup novo e verificado" }
  Say ("Backup ok: {0}" -f $ultimo.Name) "Green"

  foreach ($f in $pending) {
    Say "Aplicando $($f.Name)..."
    $sum = (Get-FileHash $f.FullName -Algorithm SHA256).Hash.ToLower()
    # o arquivo vai por docker cp (mantém os acentos em UTF-8; passar por pipe no PowerShell 5 os corromperia)
    docker cp $f.FullName "primeges-db-1:/tmp/migration.sql" 2>&1 | Out-Null
    $out = docker exec -e "PGOPTIONS=-c lock_timeout=5s -c statement_timeout=120s" primeges-db-1 psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/migration.sql 2>&1
    if ($LASTEXITCODE -ne 0) { Fail "a migration $($f.Name) falhou: $($out | Select-Object -Last 3 | Out-String). O banco ficou como estava (a migration roda em transação única)." }
    Psql "insert into ops.applied_migrations (filename, checksum, applied_by) values ('$($f.Name)', '$sum', '$env:USERNAME')" | Out-Null
    Say "  ok, registrada" "Green"
  }
  Psql "notify pgrst, 'reload schema'" | Out-Null
}

# ---------------------------------------------------------------- 4) imagem nova ao lado da atual
$envFile = Join-Path $root "site.env"
$vars = @{}
Get-Content $envFile | ForEach-Object { if ($_ -match "^\s*([A-Z0-9_]+)\s*=\s*(.*)$") { $vars[$Matches[1]] = $Matches[2].Trim().Trim('"') } }
if (-not $vars["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"] -or -not $vars["NEXT_PUBLIC_SUPABASE_ANON_KEY"]) { Fail "site.env sem as chaves públicas do build" }
Say "Construindo a imagem ($short)... (alguns minutos)"
Push-Location $Repo
$env:MSYS_NO_PATHCONV = "1"
docker build -f "$root\site\Dockerfile" --build-arg "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$($vars['NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY'])" --build-arg "NEXT_PUBLIC_SUPABASE_ANON_KEY=$($vars['NEXT_PUBLIC_SUPABASE_ANON_KEY'])" -t primeges-web:next . *> (Join-Path $logs "build-$stamp.log")
$buildOk = ($LASTEXITCODE -eq 0)
Pop-Location
if (-not $buildOk) { Fail "o build da imagem falhou (veja logs\build-$stamp.log)" }
Say "Imagem construída" "Green"

# ---------------------------------------------------------------- 5) troca + teste de fumaça + volta automática
$prevTag = "primeges-web:prev-$stamp"
docker tag primeges-web:local $prevTag 2>&1 | Out-Null
docker tag primeges-web:next primeges-web:local 2>&1 | Out-Null
Push-Location $root
docker compose --profile site --profile tunnel up -d web tunnel *> $null
Pop-Location
Say "Trocado. Teste de fumaça..."

function Smoke {
  Start-Sleep -Seconds 12
  $checks = @(
    @{ n = "saúde"; u = "https://primeges.com.br/api/health"; ok = { param($r) $r.StatusCode -eq 200 } },
    @{ n = "login"; u = "https://primeges.com.br/login"; ok = { param($r) $r.StatusCode -eq 200 } },
    @{ n = "estado da manutenção"; u = "https://primeges.com.br/api/maintenance/status"; ok = { param($r) $r.StatusCode -eq 200 -and $r.Content -like "*serverNow*" } }
  )
  $fails = @()
  foreach ($c in $checks) {
    $passed = $false
    for ($i = 0; $i -lt 6 -and -not $passed; $i++) {
      try { $r = Invoke-WebRequest $c.u -UseBasicParsing -TimeoutSec 15; $passed = & $c.ok $r } catch { $passed = $false }
      if (-not $passed) { Start-Sleep -Seconds 5 }
    }
    if ($passed) { Say ("  {0}: ok" -f $c.n) } else { $fails += $c.n; Say ("  {0}: FALHOU" -f $c.n) "Red" }
  }
  return $fails
}

$fails = Smoke
if ($fails.Count -gt 0) {
  Say "Teste de fumaça falhou ($($fails -join ', ')). VOLTANDO para a imagem anterior..." "Red"
  docker tag $prevTag primeges-web:local 2>&1 | Out-Null
  Push-Location $root
  docker compose --profile site --profile tunnel up -d web tunnel *> $null
  Pop-Location
  $again = Smoke
  if ($again.Count -gt 0) { Say "ATENÇÃO: mesmo na imagem anterior algo falha ($($again -join ', ')). Siga o roteiro de incidente." "Red" } else { Say "Site de volta na versão anterior." "Yellow" }
  Say "As migrations aplicadas continuam (devem ser compatíveis com a versão anterior; scripts de volta em supabase\rollback\)." "Yellow"
  exit 2
}

Say "Publicado: main $short no ar. Imagem anterior guardada: $prevTag" "Green"
