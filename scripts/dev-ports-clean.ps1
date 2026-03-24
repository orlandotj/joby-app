# Safe-by-default dev port cleaner for JOBY (Windows)
# - Frees ports: 5173, 5174, 5175, 8787, 8788
# - Kills only recognized processes:
#   - Vite: node + command line containing vite\bin\vite.js
#   - Worker: workerd.exe listening on 8787
#   - Faststart (8788): only if GET /health returns service=joby-upload-server
# - If anything is unrecognized, aborts (no blind killing)

$ErrorActionPreference = 'Stop'

$ports = @(5173, 5174, 5175, 8787, 8788)

function Get-ListeningConns([int]$port) {
  Get-NetTCPConnection -ErrorAction SilentlyContinue |
    Where-Object { $_.State -eq 'Listen' -and $_.LocalPort -eq $port }
}

function Get-ProcInfo([int]$procId) {
  $p = Get-Process -Id $procId -ErrorAction SilentlyContinue
  $w = Get-CimInstance Win32_Process -Filter "ProcessId=$procId" -ErrorAction SilentlyContinue

  [pscustomobject]@{
    PID         = $procId
    Name        = if ($p) { $p.ProcessName } else { $null }
    Path        = if ($p -and $p.Path) { $p.Path } else { $null }
    CommandLine = if ($w -and $w.CommandLine) { $w.CommandLine } else { $null }
  }
}

function Get-CimProc([int]$procId) {
  Get-CimInstance Win32_Process -Filter "ProcessId=$procId" -ErrorAction SilentlyContinue
}

function Get-ParentProcId([int]$procId) {
  $w = Get-CimProc -procId $procId
  if ($w -and $w.ParentProcessId) { return [int]$w.ParentProcessId }
  return 0
}

function Is-ViteProcess($info) {
  if (-not $info) { return $false }
  if (("$($info.Name)".ToLowerInvariant()) -ne 'node') { return $false }
  $cmd = "$($info.CommandLine)"
  if (-not $cmd) { return $false }
  return ($cmd -match '(?i)\\vite\\bin\\vite\.js')
}

function Is-WorkerdProcess($info) {
  if (-not $info) { return $false }
  return (("$($info.Name)".ToLowerInvariant()) -eq 'workerd')
}

function Is-WranglerNodeProcess($info) {
  if (-not $info) { return $false }
  if (("$($info.Name)".ToLowerInvariant()) -ne 'node') { return $false }
  $cmd = "$($info.CommandLine)"
  if (-not $cmd) { return $false }
  # Heuristic: wrangler dev (local) typically contains 'wrangler' and '--port 8787'
  if ($cmd -match '(?i)wrangler') { return $true }
  return $false
}

function Test-FaststartIsJobyUploadServer() {
  try {
    $res = Invoke-RestMethod -Uri 'http://127.0.0.1:8788/health' -Method GET -TimeoutSec 3
    if ($null -eq $res) { return $false }
    return ("$($res.service)" -eq 'joby-upload-server')
  } catch {
    return $false
  }
}

Write-Host "== JOBY dev ports clean (safe-by-default) ==" -ForegroundColor Cyan
Write-Host ("Ports: {0}" -f ($ports -join ', ')) -ForegroundColor DarkGray

$maxPasses = 3
for ($pass = 1; $pass -le $maxPasses; $pass++) {
  # Build candidates list: port -> (pid, procInfo)
  $items = @()
  foreach ($port in $ports) {
    $conns = Get-ListeningConns -port $port
    foreach ($c in $conns) {
      $procId = [int]$c.OwningProcess
      if ($procId -le 0) { continue }
      $info = Get-ProcInfo -procId $procId
      $items += [pscustomobject]@{
        Port = $port
        PID  = $procId
        Info = $info
      }
    }
  }

  if (-not $items -or $items.Count -eq 0) {
    Write-Host "OK: no target ports are in LISTEN state." -ForegroundColor Green
    Write-Host "`nDone: ports cleared safely." -ForegroundColor Green
    return
  }

  Write-Host "`n== Detected LISTEN entries (pass $pass/$maxPasses) ==" -ForegroundColor Cyan
  $items |
    Sort-Object Port, PID |
    ForEach-Object {
      $i = $_.Info
      Write-Host ("- Port {0} -> PID {1} ({2})" -f $_.Port, $_.PID, $i.Name)
      if ($i.CommandLine) { Write-Host ("  Cmd: {0}" -f $i.CommandLine) -ForegroundColor DarkGray }
    }

  # Decide what is safe to kill
  $toKill = @()
  $unknown = @()

  foreach ($it in ($items | Sort-Object Port, PID)) {
    $port = [int]$it.Port
    $info = $it.Info

    $recognized = $false

    if ($port -in 5173, 5174, 5175) {
      if (Is-ViteProcess $info) {
        $recognized = $true
        $toKill += $it
      }
    } elseif ($port -eq 8787) {
      if (Is-WorkerdProcess $info) {
        $recognized = $true
        $toKill += $it

        # Prevent Wrangler from respawning workerd: stop the recognized parent node (wrangler) too.
        $parentPid = Get-ParentProcId -procId $it.PID
        if ($parentPid -gt 0) {
          $parentInfo = Get-ProcInfo -procId $parentPid
          if (Is-WranglerNodeProcess $parentInfo) {
            $toKill += [pscustomobject]@{ Port = 8787; PID = $parentPid; Info = $parentInfo }
          }
        }
      }
    } elseif ($port -eq 8788) {
      # Only kill if /health proves it's the JOBY faststart server
      if (Test-FaststartIsJobyUploadServer) {
        $recognized = $true
        $toKill += $it
      } else {
        $recognized = $false
      }
    }

    if (-not $recognized) {
      $unknown += $it
    }
  }

  # Safety gate: any unknown means abort (no blind killing)
  if ($unknown.Count -gt 0) {
    Write-Host "`n== ABORT (safety) ==" -ForegroundColor Yellow
    Write-Host "Found ports in use by unrecognized process(es). No processes were killed." -ForegroundColor Yellow
    $unknown |
      Sort-Object Port, PID |
      ForEach-Object {
        $i = $_.Info
        Write-Host ("- Port {0} -> PID {1} ({2})" -f $_.Port, $_.PID, $i.Name) -ForegroundColor Yellow
        if ($i.CommandLine) { Write-Host ("  Cmd: {0}" -f $i.CommandLine) -ForegroundColor DarkGray }
      }
    throw "Safety abort: unrecognized process holding target port(s)."
  }

  # Kill unique PIDs
  $uniquePids = $toKill | Select-Object -ExpandProperty PID -Unique
  Write-Host "`n== Killing recognized processes (pass $pass/$maxPasses) ==" -ForegroundColor Cyan
  foreach ($procId in $uniquePids) {
    $pi = Get-ProcInfo -procId $procId
    Write-Host ("Stopping PID {0} ({1})" -f $procId, $pi.Name) -ForegroundColor Cyan
    Stop-Process -Id $procId -Force
    Write-Host ("OK: PID {0} stopped" -f $procId) -ForegroundColor Green
  }

  Start-Sleep -Milliseconds 600

  # Next pass will re-check LISTEN ports; if Wrangler respawned anything, we will kill again.
}

# Final verification after max passes
Write-Host "`n== Verification ==" -ForegroundColor Cyan
$stillListening = @()
foreach ($port in $ports) {
  $conns = Get-ListeningConns -port $port
  if ($conns) {
    $stillListening += [pscustomobject]@{
      Port = $port
      Count = @($conns).Count
      PIDs = ($conns | Select-Object -ExpandProperty OwningProcess -Unique) -join ','
    }
  } else {
    Write-Host ("OK: Port {0} is free" -f $port) -ForegroundColor Green
  }
}

if ($stillListening.Count -gt 0) {
  Write-Host "`nWARN: some ports are still in LISTEN:" -ForegroundColor Yellow
  $stillListening | Sort-Object Port | Format-Table -AutoSize
  throw "Ports still in use after cleanup."
}

Write-Host "`nDone: ports cleared safely." -ForegroundColor Green
