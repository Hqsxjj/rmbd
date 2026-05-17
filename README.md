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
│   └── index.ts         # Worker 主逻辑（所有业务代码）
├── wrangler.jsonc        # Cloudflare Worker 配置文件
├── package.json          # 项目依赖与脚本
├── tsconfig.json         # TypeScript 配置
└── README.md             # 本文档
```

---

## 🔑 环境变量配置（通过 Cloudflare Dashboard 设置）

所有配置项均通过 **Cloudflare 环境变量 / Secrets** 管理，无需修改代码，无需 KV 存储。

### 必须配置的环境变量

| 变量名 | 类型 | 说明 | 获取方式 |
|--------|:----:|------|----------|
| `MOVIE_PILOT_URL` | Secret | Movie-Pilot 实例的完整 URL | 你自建的 Movie-Pilot 服务地址，例如 `https://mp.example.com` |
| `MOVIE_PILOT_TOKEN` | Secret | Movie-Pilot 的 API 认证 Token | Movie-Pilot 后台 → 设置 → API Token（JWT Bearer Token） |
| `TMDB_API_KEY` | Secret | TMDB API 密钥 | 注册 [themoviedb.org](https://www.themoviedb.org/settings/api) 后获取 |
| `HCTI_API_ID` | Secret | HtmlCssToImage 的 User ID | 注册 [htmlcsstoimage.com](https://htmlcsstoimage.com/) 后在 Dashboard 获取 |
| `HCTI_API_KEY` | Secret | HtmlCssToImage 的 API Key | 同上 |
| `TG_BOT_TOKEN` | Secret | Telegram Bot Token | 通过 [@BotFather](https://t.me/BotFather) 创建 Bot 后获取 |
| `TG_CHAT_ID` | Secret | Telegram 接收消息的 Chat ID | 频道 ID（如 `@your_channel`）或用户/群组数字 ID |

> ⚠️ **所有变量均为必填**，缺少任何一项都会导致推送流程中断。

---

## 🚀 部署指南

### 前置条件

- 已安装 [Node.js](https://nodejs.org/) (v18+)
- 已注册 [Cloudflare](https://dash.cloudflare.com/) 账号
- 已登录 Wrangler CLI（运行 `npx wrangler login`）

### Step 1: 克隆项目并安装依赖

```bash
git clone https://github.com/Hqsxjj/rmbd.git
cd rmbd
npm install
```

### Step 2: 部署 Worker

```bash
npm run deploy
```

部署成功后会输出 Worker 的访问地址：
```
Published rmbd (x.xx sec)
  https://rmbd.your-subdomain.workers.dev
```

### Step 3: 在 Cloudflare Dashboard 配置环境变量

1. 打开 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 进入 **Workers & Pages** → 点击 **rmbd**
3. 点击 **Settings** → **Variables and Secrets**
4. 逐一添加上面表格中的 7 个变量（建议全部选择 **Encrypt** 加密类型）

或者通过 CLI 逐个设置（会提示交互式输入值）：

```bash
npx wrangler secret put MOVIE_PILOT_URL
npx wrangler secret put MOVIE_PILOT_TOKEN
npx wrangler secret put TMDB_API_KEY
npx wrangler secret put HCTI_API_ID
npx wrangler secret put HCTI_API_KEY
npx wrangler secret put TG_BOT_TOKEN
npx wrangler secret put TG_CHAT_ID
```

### Step 4: 手动测试

访问以下地址触发一次推送：

```
https://rmbd.your-subdomain.workers.dev/run
```

检查你的 Telegram 频道是否收到了榜单长图。

---

## ⏰ 定时任务配置

默认 Cron 表达式为 `0 0 * * *`（每天 UTC 0:00 = 北京时间 8:00）。

如需修改推送时间，编辑 `wrangler.jsonc` 中的 `triggers.crons`：

```jsonc
"triggers": {
  "crons": ["0 0 * * *"]      // 每天 UTC 0:00 = 北京时间 8:00
  // "crons": ["0 12 * * *"]   // 每天 UTC 12:00 = 北京时间 20:00
  // "crons": ["0 */6 * * *"]  // 每 6 小时一次
}
```

修改后重新运行 `npm run deploy` 即可生效。

---

## 🔧 本地开发

```bash
npm install
npm run dev
```

本地开发时需要创建 `.dev.vars` 文件提供环境变量：

```ini
MOVIE_PILOT_URL=https://mp.example.com
MOVIE_PILOT_TOKEN=your_jwt_token
TMDB_API_KEY=your_tmdb_key
HCTI_API_ID=your_hcti_id
HCTI_API_KEY=your_hcti_key
TG_BOT_TOKEN=your_bot_token
TG_CHAT_ID=your_chat_id
```

> ⚠️ `.dev.vars` 已在 `.gitignore` 中排除，不会被提交到仓库。

本地开发服务器默认启动在 `http://localhost:8787`：

- 手动触发：`http://localhost:8787/run`
- 状态检查：`http://localhost:8787/`

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

## 📄 License

MIT
