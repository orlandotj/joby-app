# Health check for JOBY dev stack:
# - Detects Vite port (5173-5175) and prints mobile URL
# - Checks worker 8787 responds
# - Checks faststart 8788 /health returns joby-upload-server

$ErrorActionPreference = 'Stop'

function Get-HttpStatus([string]$url, [int]$timeoutSec = 3) {
  # Compatible with Windows PowerShell 5.1 and PowerShell 7+
  try {
    $resp = Invoke-WebRequest -Uri $url -Method GET -TimeoutSec $timeoutSec -UseBasicParsing
    return [pscustomobject]@{ Ok = $true; StatusCode = [int]$resp.StatusCode }
  } catch {
    $ex = $_.Exception

    # When the server responds with non-2xx, Invoke-WebRequest throws but still carries a response.
    try {
      if ($ex -and $ex.Response -and $ex.Response.StatusCode) {
        return [pscustomobject]@{ Ok = $true; StatusCode = [int]$ex.Response.StatusCode }
      }
    } catch {
      # ignore
    }

    return [pscustomobject]@{ Ok = $false; StatusCode = $null; Error = "$($ex.Message)" }
  }
}

function Get-LanIp() {
  $ips = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object {
      $_.IPAddress -and
      $_.IPAddress -ne '127.0.0.1' -and
      $_.IPAddress -notlike '169.254*'
    } |
    Select-Object -ExpandProperty IPAddress

  if (-not $ips) { return $null }

  $preferred = $ips | Where-Object { $_ -like '192.168.*' } | Select-Object -First 1
  if ($preferred) { return $preferred }

  return ($ips | Select-Object -First 1)
}

function Find-VitePort() {
  $ports = @(5173, 5174, 5175)
  foreach ($p in $ports) {
    $conn = Get-NetTCPConnection -ErrorAction SilentlyContinue |
      Where-Object { $_.State -eq 'Listen' -and $_.LocalPort -eq $p } |
      Select-Object -First 1
    if (-not $conn) { continue }

    $procId = [int]$conn.OwningProcess
    $w = Get-CimInstance Win32_Process -Filter "ProcessId=$procId" -ErrorAction SilentlyContinue
    $cmd = "$($w.CommandLine)"
    if ($cmd -match '(?i)\\vite\\bin\\vite\.js') { return $p }
  }
  return $null
}

Write-Host "== JOBY dev health ==" -ForegroundColor Cyan

$lanIp = Get-LanIp
$vitePort = Find-VitePort

if ($vitePort) {
  Write-Host ("WEB: OK (Vite detected on port {0})" -f $vitePort) -ForegroundColor Green
  Write-Host ("WEB Local:   http://127.0.0.1:{0}/" -f $vitePort) -ForegroundColor DarkGray
  if ($lanIp) {
    Write-Host ("WEB Mobile:  http://{0}:{1}/" -f $lanIp, $vitePort) -ForegroundColor Cyan
  } else {
    Write-Host ("WEB Mobile:  (could not detect LAN IP) use http://<YOUR_IP>:{0}/" -f $vitePort) -ForegroundColor Yellow
  }

  $web = Get-HttpStatus -url ("http://127.0.0.1:{0}/" -f $vitePort) -timeoutSec 3
  if ($web.Ok) {
    Write-Host ("WEB HTTP: {0}" -f $web.StatusCode) -ForegroundColor Green
  } else {
    Write-Host ("WEB HTTP: FAILED ({0})" -f $web.Error) -ForegroundColor Yellow
  }
} else {
  Write-Host "WEB: NOT DETECTED on 5173-5175" -ForegroundColor Yellow
}

# Worker 8787
try {
  $connW = Get-NetTCPConnection -ErrorAction SilentlyContinue |
    Where-Object { $_.State -eq 'Listen' -and $_.LocalPort -eq 8787 } |
    Select-Object -First 1
  if (-not $connW) { throw "Worker not listening on 8787" }

  $w = Get-HttpStatus -url "http://127.0.0.1:8787/" -timeoutSec 3
  if (-not $w.Ok) { throw "Worker not responding: $($w.Error)" }
  Write-Host ("WORKER: OK (HTTP {0})" -f $w.StatusCode) -ForegroundColor Green
} catch {
  Write-Host "WORKER: FAILED (not responding on 8787)" -ForegroundColor Red
  throw
}

# Server 8788 /health
try {
  $health = Invoke-RestMethod -Uri "http://127.0.0.1:8788/health" -Method GET -TimeoutSec 3
  if ("$($health.service)" -ne 'joby-upload-server') {
    throw "Unexpected service from /health: $($health.service)"
  }
  Write-Host "SERVER: OK (8788 /health joby-upload-server)" -ForegroundColor Green
} catch {
  Write-Host "SERVER: FAILED (8788 /health not OK)" -ForegroundColor Red
  throw
}

Write-Host "`nAll checks passed." -ForegroundColor Green
