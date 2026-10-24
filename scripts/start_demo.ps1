# scripts/start_demo.ps1
# Starts the Legal Lens API server with pre-flight checks for Ollama and bge-m3.

$ErrorActionPreference = "Continue"

Write-Host "=======================================================================" -ForegroundColor Cyan
Write-Host " Legal Lens - Demonstration Startup Script" -ForegroundColor Cyan
Write-Host "=======================================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Pre-flight check: Ollama service & bge-m3 model
Write-Host "[*] Checking Ollama embedding service on http://localhost:11434..." -ForegroundColor Gray
$ollamaUrl = "http://localhost:11434/api/tags"
try {
    $response = Invoke-RestMethod -Uri $ollamaUrl -Method Get -TimeoutSec 3 -ErrorAction Stop
    Write-Host "[PASS] Ollama is responding on http://localhost:11434." -ForegroundColor Green

    $modelFound = $false
    if ($response.models) {
        foreach ($m in $response.models) {
            if ($m.name -like "*bge-m3*") {
                $modelFound = $true
                break
            }
        }
    }

    if ($modelFound) {
        Write-Host "[PASS] Embedding model 'bge-m3' is installed and ready." -ForegroundColor Green
    } else {
        Write-Warning "[WARN] 'bge-m3' model not found in Ollama. Pull it with: ollama pull bge-m3"
    }
} catch {
    Write-Warning "[WARN] Ollama service not reachable on http://localhost:11434. The server will use in-memory keyword search fallback."
}

# 2. Print tunnel reminder
Write-Host ""
Write-Host "-----------------------------------------------------------------------" -ForegroundColor Yellow
Write-Host " [!] IMPORTANT: To expose Legal Lens for demo access or external mobile UI," -ForegroundColor Yellow
Write-Host "     run the following command in a separate terminal:" -ForegroundColor Yellow
Write-Host ""
Write-Host "     cloudflared tunnel --url http://localhost:8000" -ForegroundColor White
Write-Host "-----------------------------------------------------------------------" -ForegroundColor Yellow
Write-Host ""

# 3. Start uvicorn server
Write-Host "[*] Launching Uvicorn server on http://0.0.0.0:8000..." -ForegroundColor Cyan
python -m uvicorn api.main:app --host 0.0.0.0 --port 8000
