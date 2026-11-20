# Manutenção do servidor local: pausa o vigia de saúde para ele NÃO religar o que você parou de propósito.
#
#   powershell -File scripts\manutencao.ps1 iniciar "motivo curto"   # cria a trava (vale por até 6 horas)
#   powershell -File scripts\manutencao.ps1 terminar                 # remove a trava e roda uma conferência
#   powershell -File scripts\manutencao.ps1 status
#
# A tela/aviso para os CLIENTES é feita no painel: /admin/maintenance (agendar, iniciar, estender, encerrar).
# Este script cuida só do lado do servidor (vigia) e do backup de segurança antes de mexer em algo.
param(
  [Parameter(Position = 0)][ValidateSet("iniciar", "terminar", "status")][string]$Acao = "status",
  [Parameter(Position = 1)][string]$Motivo = "manutenção",
  [switch]$SemBackup
)
$ErrorActionPreference = "Continue"
$root = "E:\primeges-local"
$flag = Join-Path $root "logs\MANUTENCAO.flag"
New-Item -ItemType Directory -Force (Join-Path $root "logs") | Out-Null

function Show-Status {
  if (Test-Path $flag) {
    $idade = (Get-Date) - (Get-Item $flag).LastWriteTime
    Write-Host ("EM MANUTENÇÃO desde {0:dd/MM HH:mm} ({1:N0} min). Motivo: {2}" -f (Get-Item $flag).LastWriteTime, $idade.TotalMinutes, (Get-Content $flag -Raw).Trim())
    if ($idade.TotalHours -ge 6) { Write-Host "A trava passou de 6 h: o vigia já voltou a funcionar sozinho." -ForegroundColor Yellow }
  } else {
    Write-Host "Vigia ativo (sem manutenção em andamento)."
  }
}

switch ($Acao) {
  "iniciar" {
    if (-not $SemBackup) {
      Write-Host "Backup de segurança antes de começar..."
      & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root "scripts\backup.ps1") | Select-Object -Last 3
      $ultimo = Get-ChildItem (Join-Path $root "backups") -Filter "*.dump" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
      if (-not $ultimo -or ((Get-Date) - $ultimo.LastWriteTime).TotalMinutes -gt 10) {
        Write-Host "ABORTADO: não encontrei um backup novo (últimos 10 min). Nada foi alterado." -ForegroundColor Red
        exit 1
      }
      Write-Host ("Backup ok: {0}" -f $ultimo.Name)
    }
    Set-Content -Path $flag -Value ("{0} (iniciada por {1})" -f $Motivo, $env:USERNAME) -Encoding utf8
    Write-Host "Vigia em pausa por até 6 horas. Agora agende/inicie a manutenção no painel: /admin/maintenance"
  }
  "terminar" {
    if (Test-Path $flag) { Remove-Item $flag -Force }
    Write-Host "Trava removida. Conferindo o servidor..."
    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root "scripts\health.ps1")
    Get-Content (Join-Path $root "logs\status.json") -Raw
    Write-Host "Lembre de ENCERRAR a manutenção no painel (/admin/maintenance) para os clientes voltarem."
  }
  "status" { Show-Status }
}
