@echo off
cd /d "%~dp0"
if exist "dist\LiquidGlass-win32-x64\LiquidGlass.exe" (
 start "" "dist\LiquidGlass-win32-x64\LiquidGlass.exe"
) else (
 start "" "node_modules\electron\dist\electron.exe" .
)
