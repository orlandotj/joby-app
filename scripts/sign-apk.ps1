# Script para gerar keystore e assinar APK

$keystorePath = "c:\app joby produção\joby.keystore"
$keystoreAlias = "joby-key"
$keystorePassword = "joby123456"
$apkPath = "android\app\build\outputs\apk\debug\app-debug.apk"
$apkAligned = "android\app\build\outputs\apk\debug\app-aligned.apk"
$apkSigned = "android\app\build\outputs\apk\debug\app-signed.apk"

Write-Host "🔐 Configurando assinatura do APK..." -ForegroundColor Green

# Verificar se keystore já existe
if (-not (Test-Path $keystorePath)) {
    Write-Host "Gerando nova keystore..." -ForegroundColor Yellow
    & keytool -genkey -v -keystore $keystorePath -alias $keystoreAlias -keyalg RSA -keysize 2048 -validity 10000 -storepass $keystorePassword -keypass $keystorePassword -dname "CN=Joby, OU=Development, O=Joby, L=Brazil, ST=Brazil, C=BR"
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Keystore criada com sucesso" -ForegroundColor Green
    } else {
        Write-Error "Erro ao criar keystore"
        exit 1
    }
}

Write-Host "`n📦 Construindo APK release assinado..." -ForegroundColor Green

# Configurar variáveis de ambiente
$env:JAVA_HOME = "C:\Program Files\Microsoft\jdk-21.0.9.10-hotspot"
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"

# Build do projeto
npm run build
npx cap sync android

# Build APK release
cd android
.\gradlew clean assembleRelease
cd ..

# Zipalign
$zipalignPath = (Get-ChildItem -Path "$env:LOCALAPPDATA\Android\Sdk\build-tools" -Directory | Sort-Object Name -Descending | Select-Object -First 1).FullName + "\zipalign.exe"
$releaseApk = "android\app\build\outputs\apk\release\app-release-unsigned.apk"

if (Test-Path $releaseApk) {
    Write-Host "`n📏 Alinhando APK..." -ForegroundColor Cyan
    & $zipalignPath -v -p 4 $releaseApk $apkAligned
    
    # Assinar APK
    Write-Host "✍️ Assinando APK..." -ForegroundColor Cyan
    & apksigner sign --ks $keystorePath --ks-key-alias $keystoreAlias --ks-pass pass:$keystorePassword --key-pass pass:$keystorePassword --out $apkSigned $apkAligned
    
    # Verificar assinatura
    Write-Host "`n🔍 Verificando assinatura..." -ForegroundColor Cyan
    & apksigner verify $apkSigned
    
    if ($LASTEXITCODE -eq 0) {
        # Copiar para backups
        $backupName = "c:\app joby produção\joby backups\joby-app-signed-$(Get-Date -Format 'yyyy-MM-dd-HHmm').apk"
        Copy-Item -Path $apkSigned -Destination $backupName -Force
        
        Write-Host "`n✅ APK assinado criado com sucesso!" -ForegroundColor Green
        Write-Host "📍 Local: $backupName" -ForegroundColor Yellow
    } else {
        Write-Error "Erro ao verificar assinatura"
    }
} else {
    Write-Error "APK release não encontrado"
}
