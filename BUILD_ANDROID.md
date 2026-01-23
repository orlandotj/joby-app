# 📱 Como Gerar o APK Android

## Passo a Passo Rápido

### 1. Configurar Java 21

```powershell
$env:JAVA_HOME = "C:\Program Files\Microsoft\jdk-21.0.9.10-hotspot"
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
```

### 2. Sincronizar código web com Android

```powershell
npm run build
npx cap sync android
```

### 3. Gerar APK

```powershell
cd android
.\gradlew assembleDebug
cd ..
```

### 4. Copiar APK para pasta de backups

```powershell
Copy-Item -Path "android\app\build\outputs\apk\debug\app-debug.apk" -Destination "c:\app joby produção\joby backups\joby-app-$(Get-Date -Format 'yyyy-MM-dd-HHmm').apk" -Force
```

## 🚀 Comando Único (Tudo de uma vez)

```powershell
$env:JAVA_HOME = "C:\Program Files\Microsoft\jdk-21.0.9.10-hotspot"; $env:PATH = "$env:JAVA_HOME\bin;$env:PATH"; npm run build; npx cap sync android; cd android; .\gradlew clean assembleDebug; cd ..; Copy-Item -Path "android\app\build\outputs\apk\debug\app-debug.apk" -Destination "c:\app joby produção\joby backups\joby-app-$(Get-Date -Format 'yyyy-MM-dd-HHmm').apk" -Force
```

## 📂 Localização do APK

- **Durante build:** `android\app\build\outputs\apk\debug\app-debug.apk`
- **Backup automático:** `c:\app joby produção\joby backups\joby-app-YYYY-MM-DD-HHMM.apk`

## 🧹 Limpar Caches (se tiver problemas)

```powershell
Remove-Item -Recurse -Force "android\app\build", "android\build", "android\.gradle", "node_modules\.vite" -ErrorAction SilentlyContinue
```

## ⚠️ Requisitos

- Java 21 instalado
- Node.js e npm
- Android SDK configurado
