# ========================================
# SCRIPT RÁPIDO: ATUALIZAR LOGO E BUILD
# ========================================
# 
# Como usar:
# 1. Coloque sua nova logo em: src\assets\joby-icon.png
# 2. Execute este script: .\update-logo-and-build.ps1
# 3. Pronto! APK atualizado em: c:\app joby produção\joby backups\
#

Write-Host "`n🎨 ATUALIZANDO LOGO DO APP JOBY`n" -ForegroundColor Cyan

# Verificar se a logo existe
$sourceLogo = "c:\app joby produção\app joby 01 - editando\src\assets\joby-icon.png"
if (-not (Test-Path $sourceLogo)) {
    Write-Host "❌ Logo não encontrada!" -ForegroundColor Red
    Write-Host "   Coloque sua logo em: src\assets\joby-icon.png" -ForegroundColor Yellow
    exit 1
}

Write-Host "✓ Logo encontrada!" -ForegroundColor Green

# Aplicar logo aos ícones do Android
$androidRes = "c:\app joby produção\app joby 01 - editando\android\app\src\main\res"
$sizes = @{
    "mipmap-mdpi"    = 48
    "mipmap-hdpi"    = 72
    "mipmap-xhdpi"   = 96
    "mipmap-xxhdpi"  = 144
    "mipmap-xxxhdpi" = 192
}

Write-Host "`n📱 Aplicando logo aos ícones do Android..." -ForegroundColor Cyan
foreach ($folder in $sizes.Keys) {
    $folderPath = Join-Path $androidRes $folder
    Copy-Item -Path $sourceLogo -Destination (Join-Path $folderPath "ic_launcher.png") -Force
    Copy-Item -Path $sourceLogo -Destination (Join-Path $folderPath "ic_launcher_round.png") -Force
    Copy-Item -Path $sourceLogo -Destination (Join-Path $folderPath "ic_launcher_foreground.png") -Force
    Write-Host "  ✓ $folder" -ForegroundColor Gray
}

# Build do APK
Write-Host "`n🔨 Construindo APK..." -ForegroundColor Cyan
$env:JAVA_HOME = "C:\Program Files\Microsoft\jdk-21.0.9.10-hotspot"
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"

npm run build
npx cap sync android
cd android
.\gradlew clean assembleDebug
cd ..

# Copiar para backups
$backupName = "c:\app joby produção\joby backups\joby-app-$(Get-Date -Format 'yyyy-MM-dd-HHmm').apk"
Copy-Item -Path "android\app\build\outputs\apk\debug\app-debug.apk" -Destination $backupName -Force

Write-Host "`n✅ CONCLUÍDO!" -ForegroundColor Green
Write-Host "📦 APK salvo em: $backupName" -ForegroundColor Yellow
Write-Host "`nTransfira o arquivo para seu celular e instale!`n" -ForegroundColor Cyan
