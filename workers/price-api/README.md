# 同款比价 API（Cloudflare Worker）

为 agent-YiGui 提供「同一页面」的多平台价格对比后端：好单库（淘宝/拼多多/京东/抖音）+ 大淘客（图搜/淘宝补充），聚合归一化后返回统一 JSON。

## 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 健康检查，返回已配置的数据源 |
| GET | `/api/search?kw=连衣裙` | 关键词比价，返回各平台同款候选（价格升序）与平台最低价汇总 |
| POST | `/api/image-search` | 图片比价，body `{ "image": "<base64>" }`，图搜识别标题后再全网比价 |

返回结构：`{ keyword, best: [...同款候选], byPlatform: [...各平台最低价], others: [...相似款], total, platforms, updatedAt }`

## 部署步骤

① 申请密钥（个人免费）

1. 好单库：`https://www.haodanku.com` → 开放平台 → 注册 → 应用中心创建应用 → 复制 **apikey**
2. 大淘客：`https://www.dataoke.com` → 开放平台 → 注册开发者 → 创建应用 → 复制 **AppKey / AppSecret**（图搜必须）

② 部署

```bash
cd workers/price-api
npm install
# 写入密钥（推荐用 secret，不要提交到仓库）
npx wrangler secret put HDK_APIKEY
npx wrangler secret put DTK_APPKEY
npx wrangler secret put DTK_SECRET
npm run deploy
```

部署完成后把 Worker 地址（形如 `https://agent-yigui-price-api.<你的子域>.workers.dev`）填到前端 `.env`：

```
VITE_PRICE_API=https://agent-yigui-price-api.xxx.workers.dev
```

③ 验证

```bash
curl https://<worker地址>/api/health
curl "https://<worker地址>/api/search?kw=白色T恤"
```

## 已知限制

- 淘客接口只覆盖「有佣金的推广商品」，非平台全量，小众衣物可能无结果 → 前端已做降级（提示 + 跳慢慢买）
- 抖音仅类目榜单接口，关键词匹配为本地过滤，命中率有限
- 1688 无免费个人接口，未接入（可后续接第三方付费图搜 `1688.item_search_img`）
- 大淘客签名规则若官方调整，改 `src/providers/dataoke.js` 的 `buildSign`
