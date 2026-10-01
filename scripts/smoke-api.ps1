param([string]$BaseUrl = "http://localhost:3333")
$ErrorActionPreference = "Stop"
function Assert-Status($method, $path, $body, $expected) {
  try {
    $response = Invoke-WebRequest -Uri "$BaseUrl$path" -Method $method -ContentType "application/json" -Body ($body | ConvertTo-Json -Compress) -UseBasicParsing
    if ($response.StatusCode -ne $expected) { throw "Expected $expected, got $($response.StatusCode)" }
    Write-Host "PASS $method $path -> $($response.StatusCode)"
    return ($response.Content | ConvertFrom-Json)
  } catch { if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq $expected) { Write-Host "PASS $method $path -> $expected"; return $null }; throw }
}

$health = Invoke-RestMethod "$BaseUrl/health"
if ($health.status -ne "ok") { throw "API health failed" }
Write-Host "PASS GET /health"
$ready = Invoke-WebRequest "$BaseUrl/health/ready" -UseBasicParsing
if ($ready.StatusCode -ne 200) { throw "Database is not ready. Start Docker Compose first." }
Write-Host "PASS GET /health/ready"
$suffix = Get-Random
$account = @{ name = "Smoke Test"; email = "smoke$suffix@example.com"; password = "Password123!" }
$created = Assert-Status "Post" "/api/v1/auth/register" $account 201
$headers = @{ Authorization = "Bearer $($created.accessToken)" }
$me = Invoke-RestMethod "$BaseUrl/api/v1/me" -Headers $headers
if ($me.user.email -ne $account.email) { throw "Authenticated user mismatch" }
Write-Host "PASS GET /api/v1/me"
$family = Invoke-RestMethod "$BaseUrl/api/v1/families" -Method Post -Headers $headers -ContentType "application/json" -Body (@{ name = "Smoke Family"; timezone = "America/Sao_Paulo" } | ConvertTo-Json)
Write-Host "PASS POST /api/v1/families"
$task = Invoke-RestMethod "$BaseUrl/api/v1/tasks" -Method Post -Headers $headers -ContentType "application/json" -Body (@{ familyId = $family.id; title = "Smoke task" } | ConvertTo-Json)
Write-Host "PASS POST /api/v1/tasks"
$tasks = Invoke-RestMethod "$BaseUrl/api/v1/tasks?familyId=$($family.id)" -Headers $headers
if ($tasks.Count -lt 1) { throw "Task was not returned" }
Write-Host "PASS GET /api/v1/tasks"
Write-Host "Smoke test completed successfully."
