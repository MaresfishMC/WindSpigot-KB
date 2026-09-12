# ============================================================================\n# DEPRECATED / DO NOT USE: 本脚本会调用 SetForegroundWindow 抢占前台, 会打断使用者的\n# 其他前台游戏。实测结论(2026-09-12): 合成输入(mouse_event/keybd_event/SendKeys)在\n# 1.8 客户端上不生效 —— 窗口失焦时 inGameHasFocus=false, 客户端根本不处理输入,\n# 因此鼠标点击与键盘都无法驱动客户端。请改用插件代玩家执行指令:\n#     /kbprobe as <玩家> <指令...>      (等价于该玩家在聊天栏敲指令)\n# ============================================================================\n# Type text into a real Minecraft client window (keyboard automation).
# ASCII-only. Usage: & '.\72_type_client.ps1' -Index 0 -Text "/duel KBVictim2"
param(
    [int]$Index = 0,
    [string]$Text = '',
    [switch]$Raw          # send as raw keystrokes (no SendKeys escaping)
)
$ErrorActionPreference = 'Continue'
Add-Type -AssemblyName System.Windows.Forms

Add-Type -Namespace W2 -Name U2 -MemberDefinition @'
[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
[DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, IntPtr dwExtraInfo);
[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
'@

$procs = Get-Process java -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Sort-Object StartTime
if (-not $procs) { Write-Output 'NO_CLIENT_WINDOW'; exit 1 }
if ($Index -ge $procs.Count) { Write-Output "index out of range"; exit 1 }
$target = $procs[$Index]
$hwnd = $target.MainWindowHandle

# release foreground lock with an ALT tap, then force foreground
[W2.U2]::keybd_event(0x12, 0, 0, [IntPtr]::Zero); Start-Sleep -Milliseconds 60
[W2.U2]::keybd_event(0x12, 0, 2, [IntPtr]::Zero); Start-Sleep -Milliseconds 60
[void][W2.U2]::ShowWindow($hwnd, 9)
[void][W2.U2]::SetForegroundWindow($hwnd)
Start-Sleep -Milliseconds 600
$fg = [W2.U2]::GetForegroundWindow()
Write-Output "pid=$($target.Id) foreground=$($fg -eq $hwnd)"
if ($fg -ne $hwnd) { Write-Output 'WARN: not foreground, input may be ignored' }

# open chat, type, send
[W2.U2]::keybd_event(0x54, 0, 0, [IntPtr]::Zero)   # T
[W2.U2]::keybd_event(0x54, 0, 2, [IntPtr]::Zero)
Start-Sleep -Milliseconds 500
if ($Raw) {
    foreach ($ch in $Text.ToCharArray()) {
        $vk = [int][char]([string]$ch).ToUpper()[0]
        if ($ch -eq '/') { $vk = 0xBF }
        if ($ch -eq ' ') { $vk = 0x20 }
        [W2.U2]::keybd_event([byte]$vk, 0, 0, [IntPtr]::Zero)
        [W2.U2]::keybd_event([byte]$vk, 0, 2, [IntPtr]::Zero)
        Start-Sleep -Milliseconds 40
    }
} else {
    [System.Windows.Forms.SendKeys]::SendWait($Text)
    Start-Sleep -Milliseconds 300
}
[W2.U2]::keybd_event(0x0D, 0, 0, [IntPtr]::Zero)   # ENTER
[W2.U2]::keybd_event(0x0D, 0, 2, [IntPtr]::Zero)
Write-Output "typed: $Text"
