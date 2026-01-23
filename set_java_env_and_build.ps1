# Script PowerShell para configurar JAVA_HOME e PATH temporariamente e compilar o projeto Android

$env:JAVA_HOME = "C:\Program Files\Microsoft\jdk-17.0.17.10-hotspot"
$env:PATH = "$env:JAVA_HOME\bin;" + $env:PATH

Write-Host "JAVA_HOME configurado para: $env:JAVA_HOME"
Write-Host "Iniciando compilação do projeto Android..."

cd android
.\gradlew.bat assembleDebug

Write-Host "Compilação finalizada."
