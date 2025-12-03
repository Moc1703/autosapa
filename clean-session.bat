@echo off
echo Cleaning WhatsApp session...
rmdir /s /q .wwebjs_auth 2>nul
rmdir /s /q .wwebjs_cache 2>nul
echo Session cleaned!
echo.
echo Now run: node index.js
pause
