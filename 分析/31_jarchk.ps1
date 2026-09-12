$gbk=[System.Text.Encoding]::GetEncoding(936)
$strict=New-Object System.Text.UTF8Encoding($false,$true)
$rows = Get-Content 'F:\open\新服务器\PVP内核\分析\_jarstr.json' -Raw -Encoding UTF8 | ConvertFrom-Json
$hit=0
foreach($r in $rows){
  $s=$r[2]
  if($s -notmatch '[\u4e00-\u9fff]'){continue}
  try{
    $b=$gbk.GetBytes($s)
    if($gbk.GetString($b) -ne $s){continue}
    try{$t=$strict.GetString($b)}catch{continue}
    if($t -eq $s){continue}
    if($t -notmatch '[\u4e00-\u9fff]'){continue}
    Write-Host ("{0} :: {1}`n    {2}  ->  {3}" -f $r[0],$r[1],$s,$t)
    $hit++
  }catch{}
}
Write-Host "`njar 内乱码字符串: $hit 条"
