@echo off
title AIDIT
cd /d "%~dp0"
rem Když už AIDIT běží, jen otevři prohlížeč
curl -s -o nul http://localhost:5175/api/clients && (
	start "" http://localhost:5175
	exit /b
)
npm run studio -- %*
