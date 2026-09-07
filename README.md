# ProjectPlan-PertChart (PERT & Gantt Chart 排程系統 - Microsoft Project 相容)

一套專業、現代化的排程與專案管理系統，支援 **PERT Chart (網狀圖)** 與 **Gantt Chart (甘特圖)** 雙向即時互轉，內建 **CPM (Critical Path Method, 關鍵路徑法)** 自動排程引擎，並能與 **Microsoft Project (MSPDI XML)** 雙向匯入與匯出相容。

---

## 核心功能特色

### 1. 關鍵路徑法 (CPM) 自動排程核心
- **正向推算 (Forward Pass)**：自動計算各任務最早開始時間 (ES) 與最早結束時間 (EF)。
- **逆向推算 (Backward Pass)**：自動計算最晚開始時間 (LS) 與最晚結束時間 (LF)。
- **時差計算 (Slack / Float)**：精確推算總浮時 (Total Float) 與自由浮時 (Free Float)。
- **關鍵路徑自動求解**：自動鎖定時差為 0 的關鍵任務鏈，計算總專案工期，並以醒目紅框與加粗紅色箭頭高亮顯示。
- **循環依賴防呆檢測**：即時偵測任務之間的閉環相依關係（Circular Dependency），並標明問題節點。

### 2. PERT 網路圖視圖 (Network Diagram)
- 參照經典 PERT / CPM 活動節點設計：
  - **節點卡片**：顯示任務名稱、開始日期與工期（如 `02/01/00 | 1 day`），亦可一鍵切換為包含 ES/EF/LS/LF/Slack 的 6 格專業工程節點。
  - **關鍵路徑紅線**：自動將關鍵路徑上的節點與箭頭標為鮮明紅色。
  - **自動拓撲佈局**：基於 Dagre 演算法由左至右自動排列階層，支援自由畫布拖曳平移、滾輪縮放與節點任意拖曳調整。
  - **即時視覺連線**：點擊節點上的箭頭按鈕即可快速連線建立前置任務依賴。
  - **右上角工期看板**：即時顯示如參考圖中之「`Critical Path: 88 Days`」動態數據。

### 3. Gantt 甘特圖視圖 (Gantt Chart)
- 雙欄同步視圖：左側為任務列表，右側為水平時間軸網格。
- 關鍵任務以紅色漸層顯示，非關鍵任務以藍色漸層顯示。
- 視覺化虛線條標記各任務的**浮時 (Slack)**，清楚掌握各項工作能延後的最大安全天數。
- 支援放大/縮小時間軸刻度（天/週）以及「僅顯示關鍵路徑」過濾模式。

### 4. 雙視圖並列模式 (Split View)
- 上下分割同屏呈現 PERT 網圖與 Gantt 甘特圖，兩者共享相同狀態，任何修改立即同步反應。

### 5. Microsoft Project 相容性與 .mpp 格式直接支援
- **直接匯入 MS Project (.mpp) 檔案**：
  - 系統內建純 Python OLE 專案解析引擎（免安裝 Java 或 MS Project），點擊「**匯入 MS Project**」選擇 `.mpp` 檔案即可直接讀取所有工作項目、工期及前置任務依賴關係，並立即自動計算關鍵路徑！
  - 亦提供獨立轉檔批次檔 `convert_mpp.bat`，可直接將 `.mpp` 拖曳上去產出專案 JSON 檔案。
- **匯入 MS Project XML (*.xml)**：支援載入微軟標準 XML 專案檔（包含任務名稱、工期、開始/結束時間、前置任務 `<PredecessorLink>` 關係）。
- **匯出 MS Project XML**：一鍵將當前排程匯出為符合微軟官方 Schema 的標準 XML 格式，可在 Microsoft Project、ProjectLibre 或 GanttProject 中直接無損開啟。
- **備份匯入與匯出**：支援 JSON 格式專案完整備份與載入。
- **相容性指引視窗**：工具列提供說明按鈕，針對舊版或特殊受保護之 `.mpp` 檔亦有提供完整微軟官方另存 XML 教學。

---

## 快速啟動

### 方式一：雙擊啟動 (Windows)
直接雙擊專案目錄下的 `start.bat`，系統將自動啟動並在瀏覽器中開啟。

### 方式二：指令列啟動
```bash
# 安裝依賴
npm install

# 啟動本機開發伺服器
npm run dev
```
啟動後打開瀏覽器訪問 `http://localhost:5173/` 即可開始使用。

### 建置發布版本
```bash
npm run build
```
產生的最佳化靜態網頁檔案位於 `dist/` 目錄。
