# 智能衣橱 agent-YiGui

上传衣服图片 → 自动抠图 → 分类入库 → 自由搭配 → 结合天气推荐 OOTD → 一键跳转多个商城比价。

纯前端应用，数据全部存在浏览器 IndexedDB 里，**不上传任何图片到服务器**。

## 技术栈

React 18 · Vite 5 · Tailwind CSS 3 · React Router 6 · IndexedDB(idb)

## 快速开始

```bash
npm install
npm run dev      # 开发
npm run build    # 构建到 dist/
npm run preview  # 预览构建产物
```

## 功能

### 抠图（双引擎）

| 引擎 | 原理 | 适用 | 代价 |
| --- | --- | --- | --- |
| ✨ AI 抠图 | ISNet ONNX 模型，浏览器本地推理 | 任意背景、发丝/毛绒/半透明边缘 | 模型内置，本站加载 |
| ⚡ 快速去背 | 四角+边缘种子点 flood fill | 纯色/浅色背景 | 零加载，百毫秒级完成 |

两个引擎都产出 **0~255 软 alpha**，抠完还能继续用「🖌 加选 / 🧽 减选」画笔微调，支持撤销/重做/反选/清除修饰。导出时可选**边缘羽化**，让主体贴到任意背景都不生硬。

AI 模型（isnet_quint8，约 43MB）与 onnxruntime WASM **已内置在 `public/ai-cutout/`**，从本站直接加载，不依赖任何外部 CDN——离线、内网、弱网环境均可使用，推理全程在用户浏览器内完成，图片不出本机。若 AI 失败会显示可见警告并降级为「快速去背」，不会卡住流程。

### 批量上传

一次最多选 20 张，串行压缩 + 逐张 AI 抠图，处理完统一设置分类/季节/风格再批量入库。单张 AI 失败不会中断整批，会回退原图并标注。

### 其他

- **衣橱**：按分类/季节/风格筛选，卡片棋盘格展示透明图
- **分类管理**：预设 10 类 + 自定义分类，支持子分类
- **搭配**：挑选衣物组合成套装，标注季节与场合
- **天气穿搭**：Open-Meteo 免费 API（无需 Key），按体感温度给穿衣建议 + 7 天预报
- **商城比价**：淘宝/拼多多/抖音/京东 同关键词一键对比

### 数据安全

- **回收站**：删除衣物/搭配是软删除，在回收站保留 30 天，期间可恢复或彻底删除；过期条目在下次打开应用时自动清理
- **备份导出**：「我的 → 导出备份」把全部数据（含图片）打包成一个 JSON 文件下载
- **备份导入**：选择之前导出的 JSON，支持「合并导入」（保留现有，覆盖同 ID）与「覆盖导入」（清空后写入），文件带格式校验
- **清空数据**：二次确认 + 建议先导出备份

## 目录结构

```
src/
├─ components/
│  ├─ CutoutCanvas.jsx     抠图画布(双引擎 + 画笔微调)
│  ├─ Layout.jsx           底部 Tab 导航
│  └─ TopBar.jsx / ItemCard.jsx / Modal.jsx / ConfirmDialog.jsx / EmptyState.jsx
├─ pages/
│  ├─ WardrobePage.jsx     衣橱首页
│  ├─ UploadPage.jsx       单张上传(抠图 + 属性)
│  ├─ BatchUploadPage.jsx  批量上传
│  ├─ CategoryPage.jsx     分类管理
│  ├─ ItemDetailPage.jsx   衣物详情
│  ├─ OutfitPage.jsx       搭配
│  ├─ WeatherPage.jsx      天气穿搭
│  ├─ ShopPage.jsx         商城比价
│  ├─ SettingsPage.jsx     我的(统计/备份/清空)
│  └─ TrashPage.jsx        回收站
├─ utils/
│  ├─ cutoutAI.js          AI 抠图引擎 + alpha 合成
│  ├─ backup.js            备份导出/导入解析
│  ├─ weather.js           天气 API 与穿衣建议
│  └─ constants.js         分类/季节/风格/商城配置
├─ db/database.js          IndexedDB 数据层(含内存降级)
└─ context/AppContext.jsx  全局状态
```

## 说明

- 图片以 dataURL 存 IndexedDB，单张衣物建议控制在 1MB 内，避免库过大
- 浏览器不支持 IndexedDB 时自动降级为内存存储（刷新丢失），控制台会打印警告
- 商城跳转依赖浏览器弹窗权限；被拦截时可点卡片右上角 ↗ 逐个打开
