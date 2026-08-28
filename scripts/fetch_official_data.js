#!/usr/bin/env node
/**
 * 每日碳排放計算器 (Daily Carbon Footprint Calculator) - Node.js 資料管線 (Data Pipeline)
 * =====================================================================================
 * 1. 動態介接環境部氣候變遷署「產品碳足跡排放係數 (CFP_P_02)」開放資料 API。
 * 2. 整合經濟部能源署電力排碳係數（最新公告為 0.467 kg CO2e/度）。
 * 3. 執行單位統一標準化（轉換為 kg CO2e 計量）。
 * 4. 自動場景分類邏輯（交通運輸、飲食習慣、居家能源、消費與廢棄物）。
 * 5. 具備高可用 Fallback 備份機制，確保網路異常或 API 無回應時服務不中斷。
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const MOENV_API_ENDPOINT = "https://data.moenv.gov.tw/api/v2/CFP_P_02";
const DEFAULT_ELECTRICITY_COEFFICIENT = 0.467;

const HISTORICAL_ELECTRICITY_COEFFICIENTS = {
  "2024": 0.467,
  "2023": 0.495,
  "2022": 0.495,
  "2021": 0.509,
  "2020": 0.502
};

const CATEGORY_RULES = {
  transportation: {
    name_zh: "交通運輸",
    icon: "🚗",
    keywords: [
      "高鐵", "台鐵", "捷運", "公車", "機車", "汽車", "客運", "腳踏車", "自行車",
      "航空", "飛機", "輪船", "柴油", "汽油", "運輸", "航行", "里程", "乘車",
      "計程車", "電動車", "海運", "空運"
    ]
  },
  food: {
    name_zh: "飲食習慣",
    icon: "🍱",
    keywords: [
      "米", "麵", "鮮乳", "牛奶", "豆漿", "豆腐", "飲料", "咖啡", "茶", "便當",
      "蔬菜", "水果", "牛肉", "豬肉", "雞肉", "蛋", "餅乾", "食用油", "沙拉油",
      "包裝水", "礦泉水", "麵包", "罐頭", "醬油", "湯", "餐包", "燕麥", "優格"
    ]
  },
  energy: {
    name_zh: "居家能源",
    icon: "⚡",
    keywords: [
      "電力", "用電", "電費", "水", "自來水", "瓦斯", "天然氣", "液化石油氣",
      "桶裝瓦斯", "冷氣", "冷媒", "暖氣", "蒸汽", "熱能", "重油", "煤氣"
    ]
  },
  waste_consumption: {
    name_zh: "消費與廢棄物",
    icon: "♻️",
    keywords: [
      "紙張", "影印紙", "衛生紙", "面紙", "塑膠", "寶特瓶", "玻璃", "金屬",
      "鋁罐", "鐵罐", "垃圾", "廢棄物", "焚化", "回收", "清潔劑", "洗髮精",
      "沐浴乳", "衣服", "服飾", "鞋子", "包裝袋", "紙箱", "洗潔精"
    ]
  }
};

const FALLBACK_DATASET = [
  { name: "台灣高鐵 (每人公里)", coe: 0.034, unit: "kg CO2e/人-公里", category: "transportation", source: "環境部/高鐵局", statement_no: "CFP-FB-001" },
  { name: "台北捷運 (每人公里)", coe: 0.042, unit: "kg CO2e/人-公里", category: "transportation", source: "台北捷運公司", statement_no: "CFP-FB-002" },
  { name: "台鐵電聯車 (每人公里)", coe: 0.055, unit: "kg CO2e/人-公里", category: "transportation", source: "台灣鐵路管理局", statement_no: "CFP-FB-003" },
  { name: "市區公車 (每人公里)", coe: 0.068, unit: "kg CO2e/人-公里", category: "transportation", source: "環境部開放資料", statement_no: "CFP-FB-004" },
  { name: "燃油機車 (每公里)", coe: 0.052, unit: "kg CO2e/公里", category: "transportation", source: "環境部開放資料", statement_no: "CFP-FB-005" },
  { name: "電動機車 (每公里)", coe: 0.022, unit: "kg CO2e/公里", category: "transportation", source: "環境部開放資料", statement_no: "CFP-FB-006" },
  { name: "汽油轎車 (1.6L-2.0L每公里)", coe: 0.173, unit: "kg CO2e/公里", category: "transportation", source: "環境部開放資料", statement_no: "CFP-FB-007" },
  { name: "國內線航班 (每人公里)", coe: 0.220, unit: "kg CO2e/人-公里", category: "transportation", source: "國際民航組織/環境部", statement_no: "CFP-FB-008" },

  { name: "全脂鮮乳 (1000ml)", coe: 1.620, unit: "kg CO2e/瓶", category: "food", source: "氣候變遷署審查通過", statement_no: "CFP-FB-010" },
  { name: "包裝礦泉水 (600ml)", coe: 0.180, unit: "kg CO2e/瓶", category: "food", source: "氣候變遷署審查通過", statement_no: "CFP-FB-011" },
  { name: "白米 (1公斤)", coe: 1.450, unit: "kg CO2e/公斤", category: "food", source: "農委會/氣候變遷署", statement_no: "CFP-FB-012" },
  { name: "傳統豆腐 (400g)", coe: 0.520, unit: "kg CO2e/盒", category: "food", source: "氣候變遷署審查通過", statement_no: "CFP-FB-013" },
  { name: "現煮美式咖啡 (350ml)", coe: 0.240, unit: "kg CO2e/杯", category: "food", source: "氣候變遷署審查通過", statement_no: "CFP-FB-014" },
  { name: "現煮拿鐵咖啡 (350ml)", coe: 0.550, unit: "kg CO2e/杯", category: "food", source: "氣候變遷署審查通過", statement_no: "CFP-FB-015" },
  { name: "台式排骨便當 (1個)", coe: 1.380, unit: "kg CO2e/個", category: "food", source: "氣候變遷署審查通過", statement_no: "CFP-FB-016" },
  { name: "雞蛋 (10顆/盒)", coe: 0.950, unit: "kg CO2e/盒", category: "food", source: "氣候變遷署審查通過", statement_no: "CFP-FB-017" },
  { name: "國產牛肉 (1公斤)", coe: 12.500, unit: "kg CO2e/公斤", category: "food", source: "氣候變遷署審查通過", statement_no: "CFP-FB-018" },
  { name: "國產豬肉 (1公斤)", coe: 3.800, unit: "kg CO2e/公斤", category: "food", source: "氣候變遷署審查通過", statement_no: "CFP-FB-019" },

  { name: "台電發電電力 (1度/kWh)", coe: DEFAULT_ELECTRICITY_COEFFICIENT, unit: "kg CO2e/度", category: "energy", source: "經濟部能源署 (最新公告)", statement_no: "MOEA-ELE-2024" },
  { name: "自來水 (1立方公尺/度)", coe: 0.156, unit: "kg CO2e/度", category: "energy", source: "台灣自來水公司", statement_no: "CFP-FB-021" },
  { name: "天然氣 (1立方公尺)", coe: 2.100, unit: "kg CO2e/立方公尺", category: "energy", source: "台灣中油公司", statement_no: "CFP-FB-022" },
  { name: "液化石油氣/桶裝瓦斯 (1公斤)", coe: 3.120, unit: "kg CO2e/公斤", category: "energy", source: "環境部開放資料", statement_no: "CFP-FB-023" },

  { name: "A4 影印紙 (500張/包)", coe: 4.600, unit: "kg CO2e/包", category: "waste_consumption", source: "氣候變遷署審查通過", statement_no: "CFP-FB-030" },
  { name: "抽取式衛生紙 (100抽/包)", coe: 0.310, unit: "kg CO2e/包", category: "waste_consumption", source: "氣候變遷署審查通過", statement_no: "CFP-FB-031" },
  { name: "寶特瓶回收處理 (1公斤)", coe: 0.085, unit: "kg CO2e/公斤", category: "waste_consumption", source: "環境部資源循環署", statement_no: "CFP-FB-032" },
  { name: "一般生活垃圾焚化處理 (1公斤)", coe: 0.420, unit: "kg CO2e/公斤", category: "waste_consumption", source: "環境部資源循環署", statement_no: "CFP-FB-033" },
  { name: "洗髮精 (500ml)", coe: 1.150, unit: "kg CO2e/瓶", category: "waste_consumption", source: "氣候變遷署審查通過", statement_no: "CFP-FB-034" },
  { name: "純棉短袖 T-Shirt (1件)", coe: 3.500, unit: "kg CO2e/件", category: "waste_consumption", source: "氣候變遷署審查通過", statement_no: "CFP-FB-035" }
];

function classifyItem(name, originalCategory = "") {
  const text = `${name} ${originalCategory}`;
  for (const [catKey, catInfo] of Object.entries(CATEGORY_RULES)) {
    for (const kw of catInfo.keywords) {
      if (text.includes(kw)) {
        return catKey;
      }
    }
  }
  return "waste_consumption";
}

function normalizeCoeAndUnit(rawCoe, rawUnit) {
  let coeVal = parseFloat(rawCoe);
  if (isNaN(coeVal)) return { coe: null, unit: rawUnit };

  let unitClean = rawUnit ? String(rawUnit).trim() : "件";
  if (unitClean.includes("g CO2e") && !unitClean.includes("kg")) {
    coeVal = coeVal / 1000.0;
    unitClean = unitClean.replace("g CO2e", "kg CO2e");
  } else if (unitClean.includes("gCO2e") && !unitClean.includes("kg")) {
    coeVal = coeVal / 1000.0;
    unitClean = unitClean.replace("gCO2e", "kg CO2e");
  }
  return { coe: Math.round(coeVal * 10000) / 10000, unit: unitClean };
}

function fetchMoenvData(apiKey) {
  return new Promise((resolve) => {
    let url = `${MOENV_API_ENDPOINT}?format=json&limit=1000`;
    if (apiKey) {
      url += `&api_key=${encodeURIComponent(apiKey)}`;
    }

    console.log(`[INFO] (Node.js) 正在連線至官方 API: ${MOENV_API_ENDPOINT} ...`);
    const req = https.get(url, { headers: { 'User-Agent': 'DailyCarbonCalculator-Node/1.0' } }, (res) => {
      if (res.statusCode !== 200) {
        console.log(`[WARNING] API 回應 HTTP Status ${res.statusCode}`);
        return resolve([]);
      }
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          let records = [];
          if (Array.isArray(data)) records = data;
          else if (data && typeof data === 'object') {
            records = data.records || [];
            if (records && records.dataset) records = records.dataset;
          }
          console.log(`[SUCCESS] 官方 API 連線成功！共取得 ${records.length} 筆紀錄。`);
          resolve(records);
        } catch (err) {
          console.log(`[WARNING] 解析 API JSON 失敗: ${err.message}`);
          resolve([]);
        }
      });
    });

    req.on('error', (err) => {
      console.log(`[WARNING] 無法連接官方 API (${err.message})，將啟動 Fallback 備份模式。`);
      resolve([]);
    });

    req.setTimeout(10000, () => {
      req.destroy();
      console.log(`[WARNING] 連線逾時，切換至 Fallback 備份模式。`);
      resolve([]);
    });
  });
}

async function main() {
  const apiKey = process.env.MOENV_API_KEY;
  const outputPath = path.join(__dirname, '..', 'data', 'carbon_database.json');

  console.log("==========================================================");
  printBanner();
  console.log("==========================================================");

  const rawRecords = await fetchMoenvData(apiKey);
  let items = [];

  if (rawRecords && rawRecords.length > 0) {
    rawRecords.forEach((item, idx) => {
      const name = item.passport_name || item.name || item.product_name || item["產品名稱"];
      const rawCoe = item.coe || item.carbon_footprint_coe || item["碳足跡數值"];
      const rawUnit = item.unit || item.carbon_footprint_unit || item["單位"];
      const reviewDate = item.announcement_date || item.review_date || item["審查通過日期"] || "";
      const statementNo = item.statement_no || item.certificate_no || item["聲明書號"] || `CFP-MOENV-${idx+1}`;
      const company = item.company_name || item["申請公司"] || "官方採樣";

      if (!name || rawCoe === undefined) return;
      const normalized = normalizeCoeAndUnit(rawCoe, rawUnit);
      if (!normalized.coe || normalized.coe <= 0) return;

      items.push({
        id: `cfp-${String(idx+1).padStart(4, '0')}`,
        name: String(name).trim(),
        coe: normalized.coe,
        unit: normalized.unit,
        category: classifyItem(name, item.category || ""),
        review_date: String(reviewDate).trim(),
        statement_no: String(statementNo).strip ? String(statementNo).strip() : String(statementNo).trim(),
        company: String(company).trim(),
        source: "環境部氣候變遷署"
      });
    });
  }

  // 合併 Fallback Data
  const existingNames = new Set(items.map(i => i.name));
  FALLBACK_DATASET.forEach((fb, idx) => {
    if (!existingNames.has(fb.name)) {
      const normalized = normalizeCoeAndUnit(fb.coe, fb.unit);
      items.push({
        id: `fb-${String(idx+1).padStart(3, '0')}`,
        name: fb.name,
        coe: normalized.coe,
        unit: normalized.unit,
        category: fb.category,
        review_date: new Date().toISOString().split('T')[0],
        statement_no: fb.statement_no,
        company: fb.source,
        source: fb.source
      });
    }
  });

  const catCounts = { transportation: 0, food: 0, energy: 0, waste_consumption: 0 };
  items.forEach(it => {
    if (catCounts[it.category] !== undefined) {
      catCounts[it.category]++;
    }
  });

  const outputData = {
    metadata: {
      title: "每日碳排放計算器 - 官方標準碳足跡數據庫",
      version: "1.0.0",
      last_updated: new Date().toISOString(),
      total_items: items.length,
      electricity_coefficient: DEFAULT_ELECTRICITY_COEFFICIENT,
      electricity_unit: "kg CO2e / 度 (kWh)",
      historical_electricity_coefficients: HISTORICAL_ELECTRICITY_COEFFICIENTS,
      data_sources: [
        { name: "環境部氣候變遷署 - 產品碳足跡排放係數 (CFP_P_02)", url: "https://data.moenv.gov.tw/dataset/detail/CFP_P_02" },
        { name: "經濟部能源署 - 電力排碳係數", url: "https://www.moeaea.gov.tw/" }
      ],
      category_summary: catCounts
    },
    categories: Object.fromEntries(
      Object.entries(CATEGORY_RULES).map(([k, v]) => [k, { name_zh: v.name_zh, icon: v.icon, count: catCounts[k] }])
    ),
    items: items
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2), 'utf-8');

  console.log(`\n[COMPLETE] 數據庫已成功寫入至: ${outputPath}`);
  console.log(`📊 總係數筆數: ${items.length}`);
  Object.entries(catCounts).forEach(([catKey, count]) => {
    console.log(`   - ${CATEGORY_RULES[catKey].icon} ${CATEGORY_RULES[catKey].name_zh}: ${count} 筆`);
  });
  console.log(`⚡ 電力排碳係數: ${DEFAULT_ELECTRICITY_COEFFICIENT} kg CO2e/度`);
  console.log("==========================================================");
}

function printBanner() {
  console.log(" 🌿 每日碳排放計算器 (Daily Carbon Calculator) Node.js Pipeline");
}

main();
