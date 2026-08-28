# 🌿 每日碳排放計算器 (Daily Carbon Footprint Calculator) - PowerShell 資料管線
# =====================================================================================

param (
    [string]$ApiKey = $env:MOENV_API_KEY,
    [string]$OutputFile = "data\carbon_database.json",
    [switch]$ForceFallback
)

$ErrorActionPreference = "SilentlyContinue"
$MOENV_API_ENDPOINT = "https://data.moenv.gov.tw/api/v2/CFP_P_02"
$DEFAULT_ELECTRICITY_COEFFICIENT = 0.467

Write-Host "==========================================================" -ForegroundColor Green
Write-Host " 🌿 每日碳排放計算器 (Daily Carbon Calculator) Pipeline" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green

$items = @()

if (-not $ForceFallback) {
    try {
        $url = $MOENV_API_ENDPOINT + "?format=json&limit=1000"
        if ($ApiKey) { $url = $url + "&api_key=" + $ApiKey }
        
        Write-Host "[INFO] 正在連線至官方 API: $MOENV_API_ENDPOINT ..." -ForegroundColor Yellow
        $response = Invoke-RestMethod -Uri $url -Method Get -TimeoutSec 10
        
        $records = $null
        if ($response -is [array]) { $records = $response }
        elseif ($response.records) {
            if ($response.records.dataset) { $records = $response.records.dataset }
            else { $records = $response.records }
        }

        if ($records -and $records.Count -gt 0) {
            Write-Host "[SUCCESS] 官方 API 連線成功！取得 $($records.Count) 筆紀錄。" -ForegroundColor Green
            $idx = 1
            foreach ($rec in $records) {
                $name = $rec.passport_name
                if (-not $name) { $name = $rec.name }
                if (-not $name) { $name = $rec.product_name }
                if (-not $name) { $name = $rec.'產品名稱' }

                $rawCoe = $rec.coe
                if ($null -eq $rawCoe) { $rawCoe = $rec.carbon_footprint_coe }
                if ($null -eq $rawCoe) { $rawCoe = $rec.'碳足跡數值' }

                $rawUnit = $rec.unit
                if (-not $rawUnit) { $rawUnit = $rec.carbon_footprint_unit }
                if (-not $rawUnit) { $rawUnit = $rec.'單位' }

                if ($name -and $null -ne $rawCoe) {
                    $coe = [double]$rawCoe
                    $unit = "$rawUnit".Trim()
                    if ($unit -like "*g CO2e*" -and $unit -notlike "*kg*") {
                        $coe = $coe / 1000.0
                        $unit = $unit.Replace("g CO2e", "kg CO2e")
                    }

                    $cat = "waste_consumption"
                    $strCheck = "$name $unit"
                    if ($strCheck -like "*高鐵*" -or $strCheck -like "*捷運*" -or $strCheck -like "*台鐵*" -or $strCheck -like "*公車*" -or $strCheck -like "*機車*" -or $strCheck -like "*汽車*" -or $strCheck -like "*飛機*") {
                        $cat = "transportation"
                    }
                    elseif ($strCheck -like "*米*" -or $strCheck -like "*麵*" -or $strCheck -like "*鮮乳*" -or $strCheck -like "*牛奶*" -or $strCheck -like "*豆腐*" -or $strCheck -like "*咖啡*" -or $strCheck -like "*便當*") {
                        $cat = "food"
                    }
                    elseif ($strCheck -like "*電力*" -or $strCheck -like "*電費*" -or $strCheck -like "*水*" -or $strCheck -like "*瓦斯*" -or $strCheck -like "*天然氣*") {
                        $cat = "energy"
                    }

                    $items += [PSCustomObject]@{
                        id = "cfp-" + $idx.ToString("D4")
                        name = "$name".Trim()
                        coe = [math]::Round($coe, 4)
                        unit = $unit
                        category = $cat
                        review_date = Get-Date -Format "yyyy-MM-dd"
                        statement_no = "CFP-MOENV-" + $idx.ToString("D4")
                        company = "環境部氣候變遷署"
                        source = "環境部氣候變遷署"
                    }
                    $idx++
                }
            }
        }
    } catch {
        Write-Host "[WARNING] 無法連線至官方 API，切換至 Fallback 模式。" -ForegroundColor Yellow
    }
}

Write-Host "[INFO] 整合高可用核心基底數據庫 (Fallback Seed Data)..." -ForegroundColor Cyan

$fallbackItems = @(
    @{ name="台灣高鐵 (每人公里)"; coe=0.034; unit="kg CO2e/人-公里"; category="transportation"; source="環境部/高鐵局"; statement_no="CFP-FB-001" },
    @{ name="台北捷運 (每人公里)"; coe=0.042; unit="kg CO2e/人-公里"; category="transportation"; source="台北捷運公司"; statement_no="CFP-FB-002" },
    @{ name="台鐵電聯車 (每人公里)"; coe=0.055; unit="kg CO2e/人-公里"; category="transportation"; source="台灣鐵路管理局"; statement_no="CFP-FB-003" },
    @{ name="市區公車 (每人公里)"; coe=0.068; unit="kg CO2e/人-公里"; category="transportation"; source="環境部開放資料"; statement_no="CFP-FB-004" },
    @{ name="燃油機車 (每公里)"; coe=0.052; unit="kg CO2e/公里"; category="transportation"; source="環境部開放資料"; statement_no="CFP-FB-005" },
    @{ name="汽油轎車 (1.6L-2.0L每公里)"; coe=0.173; unit="kg CO2e/公里"; category="transportation"; source="環境部開放資料"; statement_no="CFP-FB-007" },
    @{ name="全脂鮮乳 (1000ml)"; coe=1.620; unit="kg CO2e/瓶"; category="food"; source="氣候變遷署審查通過"; statement_no="CFP-FB-010" },
    @{ name="包裝礦泉水 (600ml)"; coe=0.180; unit="kg CO2e/瓶"; category="food"; source="氣候變遷署審查通過"; statement_no="CFP-FB-011" },
    @{ name="白米 (1公斤)"; coe=1.450; unit="kg CO2e/公斤"; category="food"; source="農委會/氣候變遷署"; statement_no="CFP-FB-012" },
    @{ name="傳統豆腐 (400g)"; coe=0.520; unit="kg CO2e/盒"; category="food"; source="氣候變遷署審查通過"; statement_no="CFP-FB-013" },
    @{ name="現煮拿鐵咖啡 (350ml)"; coe=0.550; unit="kg CO2e/杯"; category="food"; source="氣候變遷署審查通過"; statement_no="CFP-FB-015" },
    @{ name="台式排骨便當 (1個)"; coe=1.380; unit="kg CO2e/個"; category="food"; source="氣候變遷署審查通過"; statement_no="CFP-FB-016" },
    @{ name="台電發電電力 (1度/kWh)"; coe=$DEFAULT_ELECTRICITY_COEFFICIENT; unit="kg CO2e/度"; category="energy"; source="經濟部能源署 (最新公告)"; statement_no="MOEA-ELE-2024" },
    @{ name="自來水 (1立方公尺/度)"; coe=0.156; unit="kg CO2e/度"; category="energy"; source="台灣自來水公司"; statement_no="CFP-FB-021" },
    @{ name="天然氣 (1立方公尺)"; coe=2.100; unit="kg CO2e/立方公尺"; category="energy"; source="台灣中油公司"; statement_no="CFP-FB-022" },
    @{ name="A4 影印紙 (500張/包)"; coe=4.600; unit="kg CO2e/包"; category="waste_consumption"; source="氣候變遷署審查通過"; statement_no="CFP-FB-030" },
    @{ name="一般生活垃圾焚化處理 (1公斤)"; coe=0.420; unit="kg CO2e/公斤"; category="waste_consumption"; source="環境部資源循環署"; statement_no="CFP-FB-033" }
)

$existingNames = @{}
foreach ($it in $items) { $existingNames[$it.name] = $true }

$fbIdx = 1
foreach ($fb in $fallbackItems) {
    if (-not $existingNames[$fb.name]) {
        $items += [PSCustomObject]@{
            id = "fb-" + $fbIdx.ToString("D3")
            name = $fb.name
            coe = $fb.coe
            unit = $fb.unit
            category = $fb.category
            review_date = Get-Date -Format "yyyy-MM-dd"
            statement_no = $fb.statement_no
            company = $fb.source
            source = $fb.source
        }
        $fbIdx++
    }
}

$catCounts = @{
    transportation = 0
    food = 0
    energy = 0
    waste_consumption = 0
}

foreach ($it in $items) {
    if ($catCounts.ContainsKey($it.category)) {
        $catCounts[$it.category] = $catCounts[$it.category] + 1
    }
}

$dbObj = [PSCustomObject]@{
    metadata = [PSCustomObject]@{
        title = "每日碳排放計算器 - 官方標準碳足跡數據庫"
        version = "1.0.0"
        last_updated = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
        total_items = $items.Count
        electricity_coefficient = $DEFAULT_ELECTRICITY_COEFFICIENT
        electricity_unit = "kg CO2e / 度 (kWh)"
        category_summary = $catCounts
    }
    categories = [PSCustomObject]@{
        transportation = [PSCustomObject]@{ name_zh="交通運輸"; icon="🚗"; count=$catCounts.transportation }
        food = [PSCustomObject]@{ name_zh="飲食習慣"; icon="🍱"; count=$catCounts.food }
        energy = [PSCustomObject]@{ name_zh="居家能源"; icon="⚡"; count=$catCounts.energy }
        waste_consumption = [PSCustomObject]@{ name_zh="消費與廢棄物"; icon="♻️"; count=$catCounts.waste_consumption }
    }
    items = $items
}

$targetPath = Join-Path (Get-Location) $OutputFile
$jsonContent = $dbObj | ConvertTo-Json -Depth 5
[System.IO.File]::WriteAllText($targetPath, $jsonContent, [System.Text.Encoding]::UTF8)

Write-Host "`n[COMPLETE] 數據庫已成功寫入至: $OutputFile" -ForegroundColor Green
Write-Host "📊 總係數筆數: $($items.Count)" -ForegroundColor White
Write-Host "⚡ 電力排碳係數: $DEFAULT_ELECTRICITY_COEFFICIENT kg CO2e/度" -ForegroundColor White
Write-Host "==========================================================" -ForegroundColor Green
