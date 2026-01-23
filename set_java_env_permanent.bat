@echo off
REM Script para configurar JAVA_HOME e PATH permanentemente no Windows

setx JAVA_HOME "C:\Program Files\Java\jdk-17" /M
setx PATH "%JAVA_HOME%\bin;%PATH%" /M

echo Variáveis de ambiente JAVA_HOME e PATH configuradas permanentemente.
echo Feche e reabra o terminal para as alterações terem efeito.
pause
