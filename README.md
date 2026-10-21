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
- **今日穿搭推荐**：结合体感温度/季节/风格，从衣橱自动生成 3 套今日 OOTD（含套装方案），附推荐理由与衣橱缺口提示，一键保存为搭配
- **商城比价**：三种模式——单商城搜索 / 链接比价（粘贴商品链接→慢慢买 180 天价格走势）/ **同页比价**（关键词或衣橱图片搜同款，淘宝/天猫/京东/拼多多/抖音价格同页对比、最低价高亮）；衣物详情页可「同款比价」
- **统计与穿衣日历**：「今天穿了什么」月历记录（保存 OOTD 自动打卡），衣橱利用率、本月穿着天数/件次、最常穿 TOP5、分类穿着率、从未穿着清单

### 同页比价：两种运行模式

代码里有 **两种模式**，由环境变量自动切换，业务代码无感知：

| 模式 | 触发条件 | 关键词比价 | 图片搜同款 | 需要部署后端 |
| --- | --- | --- | --- | --- |
| 🟢 **直连模式**（默认推荐） | 只配 `VITE_HDK_APIKEY` | ✅ | ❌ | 不需要 |
| 🔵 **Worker 模式** | 配了 `VITE_PRICE_API` | ✅ | ✅ | 需要 |

切换逻辑在 `src/utils/priceApi.js`：

```js
export const priceMode = BASE ? 'worker' : (HDK_KEY ? 'direct' : 'none')
```

**直连模式**下，浏览器直接请求好单库 `v2.api.haodanku.com`（该接口返回 `Access-Control-Allow-Origin: *`，支持 HTTPS 与跨域，因此**不需要自建后端**），聚合淘宝/天猫、拼多多、京东、抖音的联盟商品数据，在页面内完成归一化、同款过滤、按平台取最低价与统一升序排序。

```bash
# .env
VITE_HDK_APIKEY=你的好单库apikey   # 必填，放在好单库后台「API对接」页
VITE_PRICE_API=                    # 留空即走直连模式
```

> ⚠️ `.env` 已在 `.gitignore` 中，不要提交。改完 `.env` 需重启 dev server（`VITE_` 变量在启动时注入）。

**Worker 模式**额外提供**图片搜同款**（大淘客 `goods/search-by-image`），因为大淘客接口要求 AppSecret 签名、不能暴露在前端。部署方式见 `workers/price-api/README.md`。

**平台授权说明**：好单库免费 Key 默认只开通淘宝/天猫。拼多多、京东、抖音需要在好单库后台分别绑定「多多进宝」「京东联盟」「抖音」推广账号后才返回数据；未开通的平台会在结果页显示琥珀色提示，不影响其他平台正常出价。

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
│  ├─ StatsPage.jsx        统计与穿衣日历
│  └─ TrashPage.jsx        回收站
├─ utils/
│  ├─ cutoutAI.js          AI 抠图引擎 + alpha 合成
│  ├─ backup.js            备份导出/导入解析
│  ├─ weather.js           天气 API 与穿衣建议
│  ├─ outfitRecommender.js 今日穿搭推荐引擎(温度分层/季节过滤/风格一致/缺口分析)
│  ├─ linkParser.js        商品链接平台识别 + 慢慢买比价 URL 构造
│  ├─ priceApi.js          比价 API 封装(直连/Worker 双模式自动切换)
│  ├─ imagePrep.js         衣橱图转 JPEG(透明底补白 + 缩放压缩)
│  └─ constants.js         分类/季节/风格/商城配置
├─ db/database.js          IndexedDB 数据层(含内存降级)
└─ context/AppContext.jsx  全局状态
shared/                    浏览器与 Worker 共用的比价逻辑
├─ haodankuClient.js       好单库 API 客户端(淘宝/拼多多/京东/抖音)
└─ priceNormalize.js       价格归一化 + 同款相似度/关键词覆盖度排序
workers/price-api/         可选：Cloudflare Worker 后端(仅图片搜同款需要)
```

## 说明

- 图片以 dataURL 存 IndexedDB，单张衣物建议控制在 1MB 内，避免库过大
- 浏览器不支持 IndexedDB 时自动降级为内存存储（刷新丢失），控制台会打印警告
- 商城跳转依赖浏览器弹窗权限；被拦截时可点卡片右上角 ↗ 逐个打开
