# Vigia o projeto primeges a cada 5 minutos: containers, API, chave do Clerk, disco e idade do último backup.
# Corrige sozinho o que dá (religa containers do primeges, atualiza a chave do Clerk) e avisa o resto.
# Não toca em nenhum outro projeto Docker (stoat etc.).
$ErrorActionPreference = "Continue"
$root = "E:\primeges-local"
$logs = Join-Path $root "logs"
New-Item -ItemType Directory -Force $logs | Out-Null
$log = Join-Path $logs "health.log"
$alertFile = Join-Path $logs "ALERTA_saude.txt"
$problems = New-Object System.Collections.Generic.List[string]
function Log($m) { Add-Content -Path $log -Value ("{0:yyyy-MM-dd HH:mm:ss} {1}" -f (Get-Date), $m) -Encoding utf8 }

# mantém o log pequeno (últimas 2000 linhas)
if ((Test-Path $log) -and (Get-Item $log).Length -gt 1MB) { Get-Content $log -Tail 2000 | Set-Content $log -Encoding utf8 }

# 0) manutenção em andamento (scripts\manutencao.ps1 iniciar): o vigia NÃO religa nada nem alerta. A trava vale por no máximo 6 horas.
$mflag = Join-Path $logs "MANUTENCAO.flag"
if ((Test-Path $mflag) -and (((Get-Date) - (Get-Item $mflag).LastWriteTime).TotalHours -lt 6)) { Log "manutenção em andamento: vigia em pausa"; exit 0 }
# 1) Docker acessível? (se não, tenta abrir o Docker Desktop)
docker info *> $null
if ($LASTEXITCODE -ne 0) {
  Log "Docker fora do ar; tentando abrir o Docker Desktop"
  if (-not (Get-Process "Docker Desktop" -ErrorAction SilentlyContinue)) { Start-Process "C:\Users\HAKARI\AppData\Local\Programs\DockerDesktop\Docker Desktop.exe" }
  $problems.Add("Docker estava fora do ar (tentei abrir o Docker Desktop)")
} else {
  # 2) containers do primeges
  foreach ($c in "primeges-db-1", "primeges-rest-1") {
    $st = docker inspect -f '{{.State.Status}}' $c 2>$null
    if ($st -ne "running") {
      Log "$c estava '$st'; subindo o projeto primeges"
      Push-Location $root; docker compose up -d *> $null; Pop-Location
      $problems.Add("$c estava parado (religado automaticamente)")
      break
    }
  }
  $h = docker inspect -f '{{.State.Health.Status}}' primeges-db-1 2>$null
  if ($h -and $h -ne "healthy") { $problems.Add("banco não está saudável: $h") }

  # 3) API responde
  try { $r = Invoke-WebRequest "http://127.0.0.1:3001/" -UseBasicParsing -TimeoutSec 8; if ($r.StatusCode -ne 200) { $problems.Add("API respondeu $($r.StatusCode)") } }
  catch { $problems.Add("API local não responde") }
}

# 4) chave pública do Clerk mudou? (rotação) -> atualiza o arquivo e reinicia só o PostgREST
try {
  $remote = (Invoke-WebRequest "https://clerk.primeges.com.br/.well-known/jwks.json" -UseBasicParsing -TimeoutSec 15).Content | ConvertFrom-Json
  $local = Get-Content (Join-Path $root "clerk-jwks.json") -Raw | ConvertFrom-Json
  $sig = { param($j) (($j.keys | ForEach-Object { "$($_.kid):$($_.n)" } | Sort-Object) -join "|") }
  if ($remote.keys.Count -ge 1 -and (& $sig $remote) -ne (& $sig $local)) {
    Copy-Item (Join-Path $root "clerk-jwks.json") (Join-Path $root "clerk-jwks.anterior.json") -Force
    [IO.File]::WriteAllText((Join-Path $root "clerk-jwks.json"), ($remote | ConvertTo-Json -Depth 6 -Compress))
    & "C:\Program Files\nodejs\node.exe" (Join-Path $root "scripts\build-jwks.mjs") *> $null   # remonta jwks.json (Clerk + chave local)
    docker restart primeges-rest-1 *> $null
    Log "chave do Clerk MUDOU: arquivo atualizado e PostgREST reiniciado"
    $problems.Add("a chave do Clerk mudou; atualizei e reiniciei a API (confira o login)")
  }
} catch { Log "não consegui consultar a chave do Clerk: $($_.Exception.Message)" }

# 5) disco
foreach ($d in "C", "E", "D") {
  $free = [math]::Round((Get-PSDrive $d).Free / 1GB, 1)
  if ($free -lt 5) { $problems.Add("pouco espaço em ${d}: ($free GB livres)") }
}

# 6) último backup com menos de 36 h
$last = Get-ChildItem (Join-Path $root "backups") -Filter "primeges_*.dump" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $last) { $problems.Add("ainda não existe backup") }
elseif (((Get-Date) - $last.LastWriteTime).TotalHours -gt 36) { $problems.Add("último backup tem mais de 36 h ($($last.Name))") }
if (Test-Path (Join-Path $logs "ALERTA_backup.txt")) { $problems.Add("o último backup falhou (veja logs\ALERTA_backup.txt)") }

# resultado
$status = [ordered]@{ checkedAt = (Get-Date -Format "s"); ok = ($problems.Count -eq 0); problems = @($problems) }
$status | ConvertTo-Json | Set-Content (Join-Path $logs "status.json") -Encoding utf8
if ($problems.Count -gt 0) {
  Log ("PROBLEMAS: " + ($problems -join "; "))
  ("{0:yyyy-MM-dd HH:mm}`n" -f (Get-Date)) + ($problems -join "`n") | Set-Content $alertFile -Encoding utf8
  try {  # aviso na tela do Windows (melhor esforço)
    [void][Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]
    $x = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
    $t = $x.GetElementsByTagName("text"); $t.Item(0).AppendChild($x.CreateTextNode("Prime Ges local: atenção")) | Out-Null; $t.Item(1).AppendChild($x.CreateTextNode($problems[0])) | Out-Null
    [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("Prime Ges").Show([Windows.UI.Notifications.ToastNotification]::new($x))
  } catch {}
  exit 1
} else {
  Remove-Item $alertFile -ErrorAction SilentlyContinue
  exit 0
}
