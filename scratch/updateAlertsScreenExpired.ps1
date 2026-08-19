$screenPath = "C:\Users\admin\Downloads\synxeus_fontend\lib\screens\alerts_screen.dart"

if (Test-Path $screenPath) {
    $content = Get-Content -Path $screenPath -Raw

    # 1. Update _showAssignDialog to block EXPIRED alerts
    $dialogGuard = "  void _showAssignDialog(Alert alert) {`r`n    if (alert.status == AlertStatus.expired) {`r`n      ScaffoldMessenger.of(context).showSnackBar(`r`n        SnackBar(`r`n          content: const Text('This alert has expired and cannot be assigned or modified.'),`r`n          backgroundColor: context.appColors.danger,`r`n          behavior: SnackBarBehavior.floating,`r`n        ),`r`n      );`r`n      return;`r`n    }"

    if ($content -match "void _showAssignDialog\(Alert alert\) \{" -and $content -notmatch "This alert has expired and cannot be assigned") {
        $content = $content.Replace("  void _showAssignDialog(Alert alert) {", $dialogGuard)
        Write-Host "Updated _showAssignDialog guard in alerts_screen.dart"
    }

    # 2. Add EXPIRED badge in _buildSeverityBadge row
    $badgeRowOld = "_buildSeverityBadge(context, alert.severity),"
    $badgeRowNew = "_buildSeverityBadge(context, alert.severity),`r`n                                                  if (alert.status == AlertStatus.expired) ...[`r`n                                                    const SizedBox(width: 8),`r`n                                                    Container(`r`n                                                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),`r`n                                                      decoration: BoxDecoration(`r`n                                                        color: Colors.grey.shade600,`r`n                                                        borderRadius: BorderRadius.circular(6),`r`n                                                      ),`r`n                                                      child: const Text(`r`n                                                        'EXPIRED',`r`n                                                        style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 11),`r`n                                                      ),`r`n                                                    ),`r`n                                                  ],"

    if ($content -contains "_buildSeverityBadge(context, alert.severity)," -and $content -notmatch "color: Colors.grey.shade600,") {
        $content = $content.Replace($badgeRowOld, $badgeRowNew)
        Write-Host "Updated _buildSeverityBadge row in alerts_screen.dart"
    }

    # 3. Disable Action Buttons Row for Expired Alerts
    $actionRowOld = "                                        /// ACTION BUTTONS ROW`r`n                                        if (_activeTab == 0) ...["
    $actionRowNew = "                                        /// ACTION BUTTONS ROW`r`n                                        if (alert.status == AlertStatus.expired) ...[`r`n                                          const SizedBox(height: 14),`r`n                                          Divider(color: context.appColors.border, height: 1),`r`n                                          const SizedBox(height: 12),`r`n                                          Container(`r`n                                            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),`r`n                                            decoration: BoxDecoration(`r`n                                              color: Colors.grey.shade200,`r`n                                              borderRadius: BorderRadius.circular(10),`r`n                                              border: Border.all(color: Colors.grey.shade400),`r`n                                            ),`r`n                                            child: const Row(`r`n                                              mainAxisSize: MainAxisSize.min,`r`n                                              children: [`r`n                                                Icon(Icons.timer_off_rounded, color: Colors.grey, size: 16),`r`n                                                SizedBox(width: 6),`r`n                                                Text('EXPIRED (Action Unavailable)', style: TextStyle(color: Colors.grey, fontWeight: FontWeight.bold, fontSize: 12)),`r`n                                              ],`r`n                                            ),`r`n                                          ),`r`n                                        ] else if (_activeTab == 0) ...["

    if ($content -match "/// ACTION BUTTONS ROW" -and $content -notmatch "EXPIRED \(Action Unavailable\)") {
        $content = $content.Replace($actionRowOld, $actionRowNew)
        Write-Host "Updated Action Buttons Row in alerts_screen.dart"
    }

    Set-Content -Path $screenPath -Value $content -NoNewline
    Write-Host "Successfully saved alerts_screen.dart"
} else {
    Write-Host "alerts_screen.dart not found!"
}
