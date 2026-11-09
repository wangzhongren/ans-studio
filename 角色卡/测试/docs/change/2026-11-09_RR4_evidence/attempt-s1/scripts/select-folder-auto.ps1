param([string]$Path = 'C:\Users\51054\Desktop\work\ans-game2d-snake-2026-11-09\target')
Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class RrDlg3 {
  public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc proc, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr parent, EnumProc proc, IntPtr lParam);
  [DllImport("user32.dll")] public static extern int GetClassName(IntPtr hWnd, StringBuilder sb, int max);
  [DllImport("user32.dll")] public static extern int GetDlgCtrlID(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint msg, IntPtr wParam, string lParam, uint flags, uint timeout, out IntPtr result);
  [DllImport("user32.dll", SetLastError=true)]
  public static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam, uint flags, uint timeout, out IntPtr result);
}
"@
$dialogs = @()
$cb = [RrDlg3+EnumProc]{ param($h,$l)
  $cls = New-Object System.Text.StringBuilder 128
  [void][RrDlg3]::GetClassName($h,$cls,128)
  if ($cls.ToString() -eq '#32770') { $script:dialogs += $h }
  return $true
}
for ($i=0; $i -lt 40 -and $dialogs.Count -eq 0; $i++) {
  $script:dialogs = @()
  [void][RrDlg3]::EnumWindows($cb,[IntPtr]::Zero)
  if ($dialogs.Count -eq 0) { Start-Sleep -Milliseconds 250 }
}
if ($dialogs.Count -eq 0) { "NO_DIALOG"; exit 1 }
$chosen = [IntPtr]::Zero; $edit = [IntPtr]::Zero; $button = [IntPtr]::Zero
foreach ($d in $dialogs) {
  $script:e = [IntPtr]::Zero; $script:b = [IntPtr]::Zero
  $cb2 = [RrDlg3+EnumProc]{ param($h,$l)
    $cls = New-Object System.Text.StringBuilder 128
    [void][RrDlg3]::GetClassName($h,$cls,128)
    $id = [RrDlg3]::GetDlgCtrlID($h)
    if ($cls.ToString() -eq 'Edit' -and $id -eq 1152) { $script:e = $h }
    if ($cls.ToString() -eq 'Button' -and $id -eq 1) { $script:b = $h }
    return $true
  }
  [void][RrDlg3]::EnumChildWindows($d,$cb2,[IntPtr]::Zero)
  if ($e -ne [IntPtr]::Zero -and $b -ne [IntPtr]::Zero) { $chosen = $d; $edit = $e; $button = $b; break }
}
if ($chosen -eq [IntPtr]::Zero) { "NO_PICKER dialogs=$($dialogs.Count)"; exit 2 }
[void][RrDlg3]::SetForegroundWindow($chosen)
$flags = 0x0002
$res = [IntPtr]::Zero
[void][RrDlg3]::SendMessageTimeout($edit, 0x000C, [IntPtr]::Zero, $Path, $flags, 2000, [ref]$res)
Start-Sleep -Milliseconds 300
[void][RrDlg3]::SendMessageTimeout($button, 0x00F5, [IntPtr]::Zero, [IntPtr]::Zero, $flags, 2000, [ref]$res)
"SELECTED dialogs=$($dialogs.Count) chosen=$chosen edit=$edit button=$button path=$Path"
