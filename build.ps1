# WindSpigot KB增强版 编译脚本（Maven 完整构建）
# 用法: powershell -ExecutionPolicy Bypass -File build.ps1

$javaHome = "C:\Program Files\Zulu\zulu-8"
$env:JAVA_HOME = $javaHome
$env:PATH = "$javaHome\bin;$env:PATH"

$mvn = "F:\open\新服务器\PVP内核\tools\apache-maven-3.9.9\bin\mvn.cmd"
$projectDir = "F:\open\新服务器\PVP内核\项目\WindSpigot-KB"
$outputDir = "F:\open\新服务器\PVP内核\编译后文件"

Write-Host "========================================"
Write-Host "   WindSpigot KB增强版 编译脚本"
Write-Host "========================================"

Write-Host "[1/3] Maven 编译打包..."
& $mvn -q package -DskipTests
if ($LASTEXITCODE -ne 0) {
    Write-Host "  x 编译失败" -ForegroundColor Red
    exit 1
}
Write-Host "  √ 编译成功" -ForegroundColor Green

Write-Host "[2/3] 复制产物..."
New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
Copy-Item "$projectDir\WindSpigot-Server\target\WindSpigot.jar" "$outputDir\WindSpigot-KB-Enhanced.jar" -Force
Write-Host "  √ 输出: $outputDir\WindSpigot-KB-Enhanced.jar" -ForegroundColor Green

Write-Host "[3/3] 完成" -ForegroundColor Green
