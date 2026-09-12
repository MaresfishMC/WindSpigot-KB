# ============================================================================\n# DEPRECATED / DO NOT USE: 本脚本会调用 SetForegroundWindow 抢占前台, 会打断使用者的\n# 其他前台游戏。实测结论(2026-09-12): 合成输入(mouse_event/keybd_event/SendKeys)在\n# 1.8 客户端上不生效 —— 窗口失焦时 inGameHasFocus=false, 客户端根本不处理输入,\n# 因此鼠标点击与键盘都无法驱动客户端。请改用插件代玩家执行指令:\n#     /kbprobe as <玩家> <指令...>      (等价于该玩家在聊天栏敲指令)\n# ============================================================================\n# Click automation for the real Minecraft clients (v2).
# Fixes v1: SetForegroundWindow silently fails from a background process; the standard
# workaround is to tap ALT first (releases the foreground lock). We also verify the
# foreground window actually became the target before clicking.
# ASCII-only on purpose (PowerShell reads .ps1 as GBK here).
param(
    [int]$Clicks = 10,
    [int]$GapMs = 280,
    [int]$Index = 0    # 0 = oldest client window, 1 = second oldest, ...
)
$ErrorActionPreference = 'Continue'

Add-Type -Namespace W -Name U -MemberDefinition @'
[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
[DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
[DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
[DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, IntPtr dwExtraInfo);
[DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, IntPtr dwExtraInfo);
[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
[StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
'@

$procs = Get-Process java -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Sort-Object StartTime
if (-not $procs) { Write-Output 'NO_CLIENT_WINDOW'; exit 1 }
Write-Output ("clients: " + (($procs | ForEach-Object { "$($_.Id)@$($_.StartTime.ToString('HH:mm:ss'))" }) -join ', '))
if ($Index -ge $procs.Count) { Write-Output "index $Index out of range"; exit 1 }
$target = $procs[$Index]
$hwnd = $target.MainWindowHandle

# tap ALT to release the foreground lock, then force foreground
[W.U]::keybd_event(0x12, 0, 0, [IntPtr]::Zero); Start-Sleep -Milliseconds 60
[W.U]::keybd_event(0x12, 0, 2, [IntPtr]::Zero); Start-Sleep -Milliseconds 60
[void][W.U]::ShowWindow($hwnd, 9)   # SW_RESTORE
$ok = [W.U]::SetForegroundWindow($hwnd)
Start-Sleep -Milliseconds 500
$fg = [W.U]::GetForegroundWindow()
Write-Output "pid=$($target.Id) hwnd=$hwnd SetForegroundWindow=$ok foregroundNow=$fg match=$($fg -eq $hwnd)"
if ($fg -ne $hwnd) {
    for ($i = 0; $i -lt 5 -and ([W.U]::GetForegroundWindow() -ne $hwnd); $i++) {
        [W.U]::keybd_event(0x12, 0, 0, [IntPtr]::Zero); [W.U]::keybd_event(0x12, 0, 2, [IntPtr]::Zero)
        [void][W.U]::SetForegroundWindow($hwnd); Start-Sleep -Milliseconds 400
    }
    Write-Output "retry foreground => $([W.U]::GetForegroundWindow() -eq $hwnd)"
}

$r = New-Object W.U+RECT
[void][W.U]::GetWindowRect($hwnd, [ref]$r)
$cx = [int](($r.Left + $r.Right) / 2); $cy = [int](($r.Top + $r.Bottom) / 2)
[void][W.U]::SetCursorPos($cx, $cy); Start-Sleep -Milliseconds 250
for ($i = 1; $i -le $Clicks; $i++) {
    [W.U]::mouse_event(0x0002, 0, 0, 0, [IntPtr]::Zero)
    Start-Sleep -Milliseconds 45
    [W.U]::mouse_event(0x0004, 0, 0, 0, [IntPtr]::Zero)
    Start-Sleep -Milliseconds $GapMs
}
Write-Output "sent $Clicks clicks to pid=$($target.Id) at ($cx,$cy)"
