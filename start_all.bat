@echo off
echo Starting InfluxDB and STMKG Server...

:: Start InfluxDB from custom path
start "InfluxDB" cmd /c "D:\Game\InfluxDB\influxd.exe"

:: Wait for InfluxDB to be ready
echo Waiting for InfluxDB to start...
timeout /t 5 /nobreak >nul

:: Start Node.js server
start "STMKG Server" cmd /c "cd /d %~dp0 && node server.js"

echo.
echo Both services started!
echo   InfluxDB: http://localhost:8086
echo   Website:  http://localhost:3001
echo.
pause
