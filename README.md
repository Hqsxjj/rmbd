# 🎬 RMBD — 影视榜单 Telegram 图文推送机器人

基于 **Cloudflare Worker** 的影视榜单自动推送 Bot。  
每日定时从 Movie-Pilot 抓取 TMDB / 豆瓣 八大榜单数据，通过 TMDB API 补全海报与演职人员信息，渲染为精美排行卡片长图后自动推送至 Telegram 频道。

---

## ✨ 功能特性

| 功能 | 说明 |
|------|------|
| 📊 八大榜单 | TMDB 流行趋势、TMDB 热门电影/剧集、豆瓣正在热映、豆瓣热门电影/剧集、豆瓣最新电影/剧集 |
| 🖼️ TMDB 数据补全 | 自动从 TMDB 获取高清海报、主演（前3位）、发行公司信息 |
| 🎨 精美长图渲染 | 通过 HtmlCssToImage (HCTI) 将 HTML 排行卡片渲染为高质量长图 |
| 📤 Telegram 推送 | 自动将生成的长图推送至指定 Telegram 频道或群组 |
| ⏰ 定时触发 | 支持 Cron 定时任务（默认每日 UTC 0:00 / 北京时间 8:00） |
| 🔧 Web 管理面板 | 通过 `/admin` 路径在线配置所有 API 密钥，无需修改代码 |
| 🚀 手动触发 | 通过 `/run` 路径一键手动触发推送，方便调试 |

---

## 🏗️ 技术架构

```
┌─────────────────┐     ┌──────────────┐     ┌──────────┐     ┌──────────────┐
│  Cron Trigger /  │────▶│ Movie-Pilot  │────▶│ TMDB API │────▶│    HCTI      │
│  手动 /run 触发  │     │  榜单 API    │     │ 数据补全  │     │  HTML→图片   │
└─────────────────┘     └──────────────┘     └──────────┘     └──────┬───────┘
                                                                     │
                                                                     ▼
                                                              ┌──────────────┐
                                                              │  Telegram    │
                                                              │  Bot 推送    │
                                                              └──────────────┘
```

---

## 📂 项目结构

```
rmbd/
├── src/
│   └── index.ts              # Worker 主逻辑（所有业务代码）
├── wrangler.jsonc             # Cloudflare Worker 配置文件
├── package.json               # 项目依赖与脚本
├── tsconfig.json              # TypeScript 配置
├── worker-configuration.d.ts  # Cloudflare Worker 类型声明
└── README.md                  # 本文档
```

---

## 🔑 环境变量 / KV 配置项

本项目的所有配置项均存储在 **Cloudflare KV** 命名空间中，通过 `/admin` 管理面板进行配置。  
**不需要**在 `wrangler.jsonc` 中手动设置环境变量。

### 必须配置的 KV 项

| KV Key | 必填 | 说明 | 获取方式 |
|--------|:----:|------|----------|
| `MOVIE_PILOT_URL` | ✅ | Movie-Pilot 实例的完整 URL | 你自建的 Movie-Pilot 服务地址，例如 `https://mp.example.com` |
| `MOVIE_PILOT_TOKEN` | ✅ | Movie-Pilot 的 API 认证 Token | 在 Movie-Pilot 后台 → 设置 → API Token 中获取（JWT Bearer Token） |
| `TMDB_API_KEY` | ✅ | TMDB API 密钥 | 注册 [themoviedb.org](https://www.themoviedb.org/settings/api) 后在设置页面获取 |
| `HCTI_API_ID` | ✅ | HtmlCssToImage 的 API User ID | 注册 [htmlcsstoimage.com](https://htmlcsstoimage.com/) 后在 Dashboard 获取 |
| `HCTI_API_KEY` | ✅ | HtmlCssToImage 的 API Key | 同上，在 Dashboard 中获取 |
| `TG_BOT_TOKEN` | ✅ | Telegram Bot Token | 通过 Telegram 中的 [@BotFather](https://t.me/BotFather) 创建 Bot 后获取 |
| `TG_CHAT_ID` | ✅ | Telegram 接收消息的 Chat ID | 频道 ID（如 `@your_channel`）或用户/群组数字 ID |

> **⚠️ 注意**: 以上所有配置项均为**必填**。缺少任何一项都可能导致推送流程中断。

### 代码中的硬编码常量

| 常量 | 默认值 | 说明 |
|------|--------|------|
| `ADMIN_PASSWORD` | `"admin"` | 管理面板登录密码，**部署前务必修改** |
| `TARGET_BANKS` | 8 个榜单 | 需要抓取的榜单列表，可在 `src/index.ts` 顶部自行增删 |

---

## 🚀 部署指南

### 前置条件

- 已安装 [Node.js](https://nodejs.org/) (v18+)
- 已注册 [Cloudflare](https://dash.cloudflare.com/) 账号
- 已登录 Wrangler CLI（运行 `npx wrangler login`）
- 拥有以上表格中所有 API 密钥

### Step 1: 克隆项目

```bash
git clone https://github.com/Hqsxjj/rmbd.git
cd rmbd
npm install
```

### Step 2: 创建 KV 命名空间

```bash
npx wrangler kv namespace create BOT_CONFIG
```

命令执行后会返回类似输出：

```
🌀 Creating namespace with title "rmbd-BOT_CONFIG"
✨ Success!
Add the following to your configuration file in your kv_namespaces array:
{
  binding = "BOT_CONFIG",
  id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"   ← 复制这个 ID
}
```

### Step 3: 填入 KV Namespace ID

编辑 `wrangler.jsonc`，将上一步获取的 `id` 替换 `YOUR_KV_NAMESPACE_ID`：

```jsonc
"kv_namespaces": [
  {
    "binding": "BOT_CONFIG",
    "id": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"  // ← 替换为你的实际 ID
  }
]
```

### Step 4: 修改管理密码

编辑 `src/index.ts` 第 5 行，将默认密码改为你自己的：

```typescript
const ADMIN_PASSWORD = "your_strong_password";
```

### Step 5: 部署到 Cloudflare

```bash
npm run deploy
```

部署成功后会输出 Worker 的访问地址，例如：
```
Published rmbd (x.xx sec)
  https://rmbd.your-subdomain.workers.dev
```

### Step 6: 配置 API 密钥

在浏览器中访问：

```
https://rmbd.your-subdomain.workers.dev/admin
```

在管理面板中依次填入所有 API 密钥，输入管理密码后点击「保存配置并应用生效」。

### Step 7: 测试推送

访问以下地址手动触发一次推送测试：

```
https://rmbd.your-subdomain.workers.dev/run
```

检查你的 Telegram 频道是否收到了榜单长图。

---

## ⏰ 定时任务配置

默认的 Cron 表达式为 `0 0 * * *`（每天 UTC 0:00 = 北京时间 8:00）。

如需修改推送时间，编辑 `wrangler.jsonc` 中的 `triggers.crons`：

```jsonc
"triggers": {
  "crons": ["0 0 * * *"]    // 每天 UTC 0:00
  // "crons": ["0 12 * * *"]  // 每天 UTC 12:00 = 北京时间 20:00
  // "crons": ["0 */6 * * *"] // 每 6 小时一次
}
```

修改后重新运行 `npm run deploy` 即可生效。

---

## 🔧 本地开发

```bash
npm install
npm run dev
```

本地开发服务器默认启动在 `http://localhost:8787`：

- 管理面板：`http://localhost:8787/admin`
- 手动触发：`http://localhost:8787/run`
- 状态检查：`http://localhost:8787/`

> **注意**：本地开发需要先创建本地 KV 存储，Wrangler 会自动处理。

---

## 📋 支持的榜单列表

| # | 榜单名称 | API 路径 | 类型 |
|---|----------|----------|------|
| 1 | 🎬 TMDB 流行趋势 | `/api/v1/recommend/tmdb_trending` | mixed |
| 2 | 🎥 TMDB 热门电影 | `/api/v1/recommend/tmdb_movies` | movie |
| 3 | 📺 TMDB 热门剧集 | `/api/v1/recommend/tmdb_tvs` | tv |
| 4 | 🍿 豆瓣正在热映 | `/api/v1/recommend/douban_movie_showing` | movie |
| 5 | 🔥 豆瓣热门电影 | `/api/v1/recommend/douban_movie_hot` | movie |
| 6 | 🆕 豆瓣最新电影 | `/api/v1/recommend/douban_movies` | movie |
| 7 | 📡 豆瓣热门剧集 | `/api/v1/recommend/douban_tv_hot` | tv |
| 8 | ✨ 豆瓣最新剧集 | `/api/v1/recommend/douban_tvs` | tv |

如需增删榜单，编辑 `src/index.ts` 顶部的 `TARGET_BANKS` 数组。

---

## 🛡️ 安全建议

1. **务必修改默认管理密码**（`ADMIN_PASSWORD`），否则任何人都可以修改你的 API 密钥
2. 所有敏感 Token 均存储在 Cloudflare KV 中，不会出现在代码仓库中
3. 建议为 `/admin` 路由添加 Cloudflare Access 等额外鉴权层

---

## 📄 License

MIT
