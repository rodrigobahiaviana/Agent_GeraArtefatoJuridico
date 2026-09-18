@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
for /f "usebackq tokens=1,* delims==" %%A in (".env") do set "%%A=%%B"
set "PATH=C:\Program Files\nodejs;%PATH%"
"%~dp0venv\Scripts\python.exe" server.py
