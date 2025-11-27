@echo off
git add .
git add server.js
git add public/teacher.js
git add game/game-window.html
git add game/
git commit -m "Refactor: Move all game files to game/ directory"
git push origin main

