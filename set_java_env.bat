@echo off
REM Script para configurar JAVA_HOME e PATH no Windows

REM Verifica se o JDK está instalado no caminho padrão
set "JDK_PATH=C:\Program Files\Java\jdk-17"

if not exist "%JDK_PATH%" (
    echo JDK nao encontrado no caminho padrao: %JDK_PATH%
    echo Por favor, ajuste o caminho no script ou instale o JDK.
    pause
    exit /b 1
)

REM Configura a variavel de ambiente JAVA_HOME
setx JAVA_HOME "%JDK_PATH%" /M

REM Adiciona JAVA_HOME\bin ao PATH
setx PATH "%PATH%;%JDK_PATH%\bin" /M

echo Variaveis de ambiente JAVA_HOME e PATH configuradas com sucesso.
echo Feche e reabra o terminal para as alteracoes terem efeito.
pause
