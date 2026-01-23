# Script para gerar ícones do Android em todas as densidades
# Requer que a logo esteja em src/assets/logo.png

$sourceLogo = "c:\app joby produção\app joby 01 - editando\src\assets\logo.png"
$androidRes = "c:\app joby produção\app joby 01 - editando\android\app\src\main\res"

# Verificar se o arquivo de origem existe
if (-not (Test-Path $sourceLogo)) {
    Write-Error "Logo não encontrada em: $sourceLogo"
    exit 1
}

# Definir os tamanhos para cada densidade
$sizes = @{
    "mipmap-mdpi"    = 48
    "mipmap-hdpi"    = 72
    "mipmap-xhdpi"   = 96
    "mipmap-xxhdpi"  = 144
    "mipmap-xxxhdpi" = 192
}

Write-Host "Gerando ícones do Android..." -ForegroundColor Green

# Copiar a logo original para cada pasta de densidade
foreach ($folder in $sizes.Keys) {
    $folderPath = Join-Path $androidRes $folder
    $size = $sizes[$folder]
    
    # Criar pasta se não existir
    if (-not (Test-Path $folderPath)) {
        New-Item -ItemType Directory -Path $folderPath -Force | Out-Null
    }
    
    # Copiar para ic_launcher.png, ic_launcher_round.png e ic_launcher_foreground.png
    $destIcon = Join-Path $folderPath "ic_launcher.png"
    $destIconRound = Join-Path $folderPath "ic_launcher_round.png"
    $destIconForeground = Join-Path $folderPath "ic_launcher_foreground.png"
    
    Copy-Item -Path $sourceLogo -Destination $destIcon -Force
    Copy-Item -Path $sourceLogo -Destination $destIconRound -Force
    Copy-Item -Path $sourceLogo -Destination $destIconForeground -Force
    
    Write-Host "✓ Ícone criado para $folder (${size}x${size}px)" -ForegroundColor Cyan
}

Write-Host "`n✅ Ícones gerados com sucesso!" -ForegroundColor Green
Write-Host "Observação: Para melhor qualidade, use uma ferramenta de redimensionamento de imagem" -ForegroundColor Yellow
Write-Host "ou o Android Asset Studio: https://romannurik.github.io/AndroidAssetStudio/icons-launcher.html" -ForegroundColor Yellow
