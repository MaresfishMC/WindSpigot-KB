@echo off
chcp 65001 >nul
title WindSpigot KB增强版 编译脚本
echo ========================================
echo    WindSpigot KB增强版 编译脚本
echo ========================================
echo.

set "JAVA_HOME=C:\Program Files\Zulu\zulu-8"
set "PATH=%JAVA_HOME%\bin;%PATH%"
set "MVN=F:\open\新服务器\PVP内核\tools\apache-maven-3.9.9\bin\mvn.cmd"
set "PROJECT_DIR=F:\open\新服务器\PVP内核\项目\WindSpigot-KB"
set "OUTPUT_DIR=F:\open\新服务器\PVP内核\编译后文件"

echo [1/3] 检查Java环境...
java -version
if errorlevel 1 (
    echo 错误: 未找到Java环境
    pause
    exit /b 1
)
echo.

echo [2/3] Maven 编译打包...
cd /d "%PROJECT_DIR%"
call "%MVN%" -q package -DskipTests
if errorlevel 1 (
    echo 错误: 编译失败
    pause
    exit /b 1
)
echo 编译完成
echo.

echo [3/3] 复制产物到输出目录...
if not exist "%OUTPUT_DIR%" mkdir "%OUTPUT_DIR%"
copy /y "%PROJECT_DIR%\WindSpigot-Server\target\WindSpigot.jar" "%OUTPUT_DIR%\WindSpigot-KB-Enhanced.jar" >nul
echo 输出: %OUTPUT_DIR%\WindSpigot-KB-Enhanced.jar
echo.

echo ========================================
echo    编译完成！
echo ========================================
pause
