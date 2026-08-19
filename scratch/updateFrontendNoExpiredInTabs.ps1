$screenPath = "C:\Users\admin\Downloads\synxeus_fontend\lib\screens\alerts_screen.dart"

if (Test-Path $screenPath) {
    $content = Get-Content -Path $screenPath -Raw

    $oldLine = "final remainingAlerts = alerts.where((a) => !verifiedAlerts.contains(a) && !rejectedAlerts.contains(a)).toList();"
    $newLine = "final remainingAlerts = alerts.where((a) => !verifiedAlerts.contains(a) && !rejectedAlerts.contains(a) && a.status != AlertStatus.expired).toList();"

    if ($content -contains $oldLine) {
        $content = $content.Replace($oldLine, $newLine)
        Write-Host "Updated remainingAlerts in alerts_screen.dart to filter out expired cards."
    }

    Set-Content -Path $screenPath -Value $content -NoNewline
    Write-Host "Successfully saved alerts_screen.dart"
} else {
    Write-Host "alerts_screen.dart not found!"
}
