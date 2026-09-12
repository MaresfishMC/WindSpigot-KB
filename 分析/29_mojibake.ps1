# 扫描"UTF-8 文本被当作 GBK 打开后再存回 UTF-8"造成的乱码
# 判据: 对字符串 s, 若 GBK编码(s) 能无损还原为 s, 且该字节串是合法 UTF-8 并解出不同且含常用汉字的 t, 则 s 是乱码
$ErrorActionPreference = 'Stop'
$gbk = [System.Text.Encoding]::GetEncoding(936)
$utf8strict = New-Object System.Text.UTF8Encoding($false, $true)

function Repair([string]$s) {
  try {
    $b = $gbk.GetBytes($s)
    if ($gbk.GetString($b) -ne $s) { return $null }   # GBK 不可无损表示 -> 跳过
    try { $t = $utf8strict.GetString($b) } catch { return $null }
    if ($t -eq $s) { return $null }
    if ($t -notmatch '[\u4e00-\u9fff]') { return $null }
    return $t
  } catch { return $null }
}

$roots = @(
  'F:\open\新服务器\senven (2)',
  'F:\open\新服务器\PVP内核\项目\WindSpigot-KB'
)
$exts = @('.yml','.yaml','.properties','.txt','.json','.conf','.cfg','.md','.java','.bat','.sh')
$skip = '\\(logs|crash-reports|world|world1|world_nether|world_the_end|Lobby|soccer|target|\.git|kb配置文件\.bak|备分|\.idea)'
$findings = New-Object System.Collections.ArrayList
$scanned = 0

foreach ($root in $roots) {
  Get-ChildItem -LiteralPath $root -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object { $exts -contains $_.Extension.ToLower() -and $_.FullName -notmatch $skip } |
    ForEach-Object {
      $path = $_.FullName
      if ($_.Length -gt 8MB) { return }
      $scanned++
      try { $lines = [System.IO.File]::ReadAllLines($path, [System.Text.Encoding]::UTF8) } catch { return }
      for ($i = 0; $i -lt $lines.Count; $i++) {
        $line = $lines[$i]
        if ($line -notmatch '[\u4e00-\u9fff]') { continue }
        # 整行可能含 ASCII 前缀(如 yml 的 key), 按"连续非 ASCII 段"逐个尝试
        foreach ($m in [regex]::Matches($line, '[\u4e00-\u9fff\ufffd\u3000-\u303f]+')) {
          $seg = $m.Value
          $fixed = Repair $seg
          if ($fixed) {
            [void]$findings.Add([pscustomobject]@{ File=$path; Line=($i+1); Orig=$seg; Fixed=$fixed; Text=$line })
          }
        }
      }
    }
}

Write-Host "扫描文件 $scanned 个, 命中乱码片段 $($findings.Count) 处`n"
$findings | Group-Object File | ForEach-Object {
  Write-Host "=== $($_.Name)  ($($_.Count) 处)"
  $_.Group | ForEach-Object { Write-Host ("  L{0}: {1}  ->  {2}" -f $_.Line, $_.Orig, $_.Fixed) }
}
$findings | Export-Csv -Path 'F:\open\新服务器\PVP内核\分析\mojibake.csv' -NoTypeInformation -Encoding UTF8
Write-Host "`n明细已存 mojibake.csv"
