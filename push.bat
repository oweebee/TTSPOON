@echo off
cd /d "%~dp0"
git add .
set /p msg="Message du commit (Entree = 'update'): "
if "%msg%"=="" set msg=update
git commit -m "%msg%"
git push
echo.
echo Termine.
pause
