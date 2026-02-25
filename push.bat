@echo off
cd /d "%~dp0"

echo Adding files to git...
git add api/sync-liquipedia.js

echo Committing changes...
git commit -m "fix: 改用 dltv.org 作为 upcoming 比赛数据源"

echo Pushing to GitHub...
git push origin main

echo Done!
pause
