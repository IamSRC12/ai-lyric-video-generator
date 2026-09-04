@echo off
title AI Lyric Video Generator
cd /d "%~dp0"
for /r %%f in (*.exe) do ( start "" "%%f" & exit /b 0 )
if not exist node_modules (
  echo Installing dependencies...
  npm install --prefer-offline
)
npm start
