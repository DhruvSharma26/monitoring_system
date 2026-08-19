$detailPath = "C:\Users\admin\Downloads\synxeus_fontend\lib\screens\alert_detail_screen.dart"

if (Test-Path $detailPath) {
    $content = Get-Content -Path $detailPath -Raw

    # 1. Update _showAssignDialog guard in alert_detail_screen.dart
    $detailGuard = "  void _showAssignDialog() {`r`n    if (_alert.status == AlertStatus.expired) {`r`n      ScaffoldMessenger.of(context).showSnackBar(`r`n        SnackBar(`r`n          content: const Text('This alert has expired and cannot be assigned or modified.'),`r`n          backgroundColor: context.appColors.danger,`r`n          behavior: SnackBarBehavior.floating,`r`n        ),`r`n      );`r`n      return;`r`n    }"

    if ($content -match "void _showAssignDialog\(\) \{" -and $content -notmatch "This alert has expired and cannot be assigned") {
        $content = $content.Replace("  void _showAssignDialog() {", $detailGuard)
        Write-Host "Updated _showAssignDialog guard in alert_detail_screen.dart"
    }

    Set-Content -Path $detailPath -Value $content -NoNewline
    Write-Host "Successfully saved alert_detail_screen.dart"
} else {
    Write-Host "alert_detail_screen.dart not found!"
}
