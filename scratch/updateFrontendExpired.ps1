$modelsPath = "C:\Users\admin\Downloads\synxeus_fontend\lib\core\models\models.dart"

if (Test-Path $modelsPath) {
    $content = Get-Content -Path $modelsPath -Raw

    # 1. Add expired to enum AlertStatus
    if ($content -notmatch "enum AlertStatus \{[^}]*expired") {
        $content = $content -replace "enum AlertStatus \{ active, assigned, rejected, verified, resolved \}", "enum AlertStatus { active, assigned, rejected, verified, resolved, expired }"
        Write-Host "Updated AlertStatus enum in models.dart"
    }

    # 2. Add EXPIRED check in Alert.fromJson
    $targetCode = "    AlertStatus alertStatus = AlertStatus.active;"
    $replacementCode = "    final asgnStatusStr = json['assignmentStatus']?.toString().toUpperCase() ?? '';`r`n    final bool isExpiredRaw = json['isExpired'] == true || statusRaw == 'EXPIRED' || asgnStatusStr == 'EXPIRED';`r`n`r`n    AlertStatus alertStatus = AlertStatus.active;`r`n    if (isExpiredRaw) {`r`n      alertStatus = AlertStatus.expired;`r`n    } else"

    if ($content -match "final statusRaw = json\['status'\]\?\.toString\(\)\.toUpperCase\(\) \?\? 'OPEN';" -and $content -notmatch "isExpiredRaw") {
        $content = $content.Replace("    AlertStatus alertStatus = AlertStatus.active;", $replacementCode)
        Write-Host "Updated Alert.fromJson in models.dart"
    }

    Set-Content -Path $modelsPath -Value $content -NoNewline
    Write-Host "Successfully saved models.dart"
} else {
    Write-Host "models.dart not found!"
}
