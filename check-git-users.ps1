# PowerShell script to check if users.txt is tracked by Git
Write-Host "Checking if data/users.txt is tracked by Git..." -ForegroundColor Cyan
$result = git ls-files data/users.txt
if ($result) {
    Write-Host "✅ data/users.txt IS tracked by Git" -ForegroundColor Green
    Write-Host "File path: $result" -ForegroundColor Yellow
    
    Write-Host "`nChecking latest commit content..." -ForegroundColor Cyan
    $commitContent = git show HEAD:data/users.txt
    if ($commitContent -match "admin@studentscoring.com") {
        Write-Host "✅ Latest commit contains admin@studentscoring.com" -ForegroundColor Green
    } else {
        Write-Host "❌ Latest commit does NOT contain admin@studentscoring.com" -ForegroundColor Red
    }
} else {
    Write-Host "❌ data/users.txt is NOT tracked by Git" -ForegroundColor Red
    Write-Host "You need to add it to Git first:" -ForegroundColor Yellow
    Write-Host "  git add data/users.txt" -ForegroundColor White
    Write-Host "  git commit -m 'Add admin user'" -ForegroundColor White
    Write-Host "  git push" -ForegroundColor White
}

