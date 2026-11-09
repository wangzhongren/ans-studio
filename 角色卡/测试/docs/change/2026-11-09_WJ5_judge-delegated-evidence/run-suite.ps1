param([string]$OutDir)
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $repo
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$summary = Join-Path $OutDir 'summary.tsv'
$lines = @("file`tstatus`ttests`tpass`tfail`tcancelled`tskipped`ttodo`texit`tduration_s")
$files = Get-ChildItem -Path 'test\测试' -Recurse -Filter '*.test.ts' -File | Sort-Object FullName
$n = 0
foreach ($file in $files) {
  $n++
  $rel = $file.FullName.Substring($repo.Length + 1).Replace('\', '/')
  $slug = $rel.Substring('test/测试/'.Length).Replace('/', '__') -replace '\.test\.ts$', ''
  $limit = if ($rel -like '*customer-authorization-plane-integration.test.ts') { 90 } else { 300 }
  $tap = Join-Path $OutDir ($slug + '.tap')
  $err = Join-Path $OutDir ($slug + '.stderr')
  $start = Get-Date
  $p = Start-Process -FilePath 'node' -ArgumentList @('--test', '--test-concurrency=1', '--test-reporter=tap', $rel) -PassThru -NoNewWindow -RedirectStandardOutput $tap -RedirectStandardError $err
  $status = 'natural'
  if (-not $p.WaitForExit($limit * 1000)) {
    taskkill /PID $p.Id /T /F 2>$null | Out-Null
    $p.WaitForExit(10000) | Out-Null
    $status = "hang(${limit}s)"
  }
  $exit = $p.ExitCode
  $dur = [int]((Get-Date) - $start).TotalSeconds
  $counts = @('-', '-', '-', '-', '-', '-')
  if (Test-Path $tap) {
    $text = Get-Content $tap -Raw -ErrorAction SilentlyContinue
    if ($text) {
      $get = { param($k) if ($text -match "(?m)^# $k (\d+)") { $Matches[1] } else { '-' } }
      $counts = @((& $get 'tests'), (& $get 'pass'), (& $get 'fail'), (& $get 'cancelled'), (& $get 'skipped'), (& $get 'todo'))
    }
  }
  $lines += ($rel + "`t" + $status + "`t" + ($counts -join "`t") + "`t" + $exit + "`t" + $dur)
  Write-Host "[$n] $status exit=$exit ${dur}s $rel"
}
Set-Content -Path $summary -Value $lines -Encoding UTF8
Write-Host "DONE $($files.Count) files"
