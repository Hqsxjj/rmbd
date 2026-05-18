# 🎬 RMBD — 影视榜单动态网页与 Telegram 推送机器人

基于 **Cloudflare Worker** 的影视榜单系统。  
系统完全移除任何第三方长图渲染或中转服务。通过在 Cloudflare 边缘节点动态请求 TMDB 和 豆瓣 API，**实时渲染出极具现代感的高清原画质动态网页**。并且每日会通过 Telegram 发送更新汇总提醒。

---

## ✨ 功能特性

| 功能 | 说明 |
|------|------|
| 📊 八大榜单 | TMDB 流行趋势、TMDB 热门电影/剧集、TMDB 正在热映、豆瓣热门电影/剧集、豆瓣最新电影/剧集 |
| 🖼️ TMDB 数据补全 | 豆瓣榜单自动通过标题搜索 TMDB，补全高清原图海报、主演、发行公司信息 |
| 🌐 动态高清网页 | 彻底告别模糊截图！用户点击链接，即刻渲染原画质 HTML5 动态网页，自适应多端设备 |
| 📤 Telegram 汇总推送 | 自动将生成的各榜单网页链接推送至指定 Telegram 频道，一键点击直达 |
| ⏰ 定时触发 | 支持 Cron 定时任务（默认每日 UTC 0:00 / 北京时间 8:00 自动发送链接聚合通知） |
| 🚀 零存储 & 极简部署 | 完全无需 KV 存储！只需 3 个环境变量即可一键部署 Serverless 服务 |

---

## 🏗️ 技术架构

```
┌─────────────────┐     ┌──────────────┐     ┌──────────┐     ┌────────────────┐
│  Cron Trigger /  │────▶│ 整理所有榜单  │────▶│  Telegram  │────▶│ 用户点击查看网页 │
│  手动 /run 触发  │     │ 动态网页链接  │     │  Bot 推送  │     └───────┬────────┘
└─────────────────┘     └──────────────┘     └──────────┘             │
                                                                      │ (访问 /view/:id)
                                                                      ▼
                                                            ┌────────────────┐
                                                            │ TMDB / 豆瓣API │
                                                            │ 实时拉取 & 渲染 │
                                                            └────────────────┘
```

---

## 🔑 环境变量配置

不要将秘钥或敏感配置直接写入 `wrangler.jsonc`。
请改用 Cloudflare Dashboard 或 Wrangler Secrets 来管理环境变量。

### 必须配置的 3 个环境变量

| 变量名 | 说明 | 获取方式 |
|--------|------|----------|
| `TMDB_API_KEY` | TMDB API 密钥 | 注册 [themoviedb.org](https://www.themoviedb.org/settings/api) 后获取 |
| `TG_BOT_TOKEN` | Telegram Bot Token | 通过 [@BotFather](https://t.me/BotFather) 创建 Bot 后获取 |
| `TG_CHAT_ID` | Telegram Chat ID | 频道 ID（如 `@your_channel`）或用户/群组数字 ID |

### 推荐方式

- Cloudflare Dashboard:
  - 进入 Worker 的 `Variables` / `Settings` 页面
  - 添加 `TMDB_API_KEY`, `TG_BOT_TOKEN`, `TG_CHAT_ID`
- Wrangler CLI:
  - 运行 `wrangler secret put TMDB_API_KEY`
  - 运行 `wrangler secret put TG_BOT_TOKEN`
  - 运行 `wrangler secret put TG_CHAT_ID`

> ⚠️ **敏感配置请勿提交到仓库**。

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

### Step 2: 填写配置项

不要在 `wrangler.jsonc` 中写入明文秘钥。
请在 Cloudflare Dashboard 的 Worker Variables 页面中添加以下环境变量，或使用 Wrangler CLI 的 secret 命令：

```bash
wrangler secret put TMDB_API_KEY
wrangler secret put TG_BOT_TOKEN
wrangler secret put TG_CHAT_ID
```

### Step 3: 一键部署

```bash
npm run deploy
```

部署成功后会输出 Worker 的访问地址：
```
Published rmbd (x.xx sec)
  https://rmbd.your-subdomain.workers.dev
```

### Step 4: 检查连通性与手动触发

在浏览器中访问 Worker 的地址（如 `https://rmbd.your-subdomain.workers.dev/status`），你将看到可视化的系统诊断页面。
点击页面上的 **"🚀 立即推送"** 即可进行第一次推送，你的 Telegram 频道将立刻收到含有高清网页直达链接的通知。

---

## ⏰ 定时任务配置

默认 Cron 表达式为 `0 0 * * *`（每天 UTC 0:00 = 北京时间 8:00）。

如需修改推送时间，编辑 `wrangler.jsonc` 中的 `triggers.crons`：

```jsonc
"triggers": {
  "crons": ["0 0 * * *"]      // 每天 UTC 0:00 = 北京时间 8:00
  // "crons": ["0 12 * * *"]   // 每天 UTC 12:00 = 北京时间 20:00
}
```

修改后重新运行 `npm run deploy` 即可生效。

---

## 📋 支持的榜单路由 (`/view/:id`)

| ID | 榜单名称 |
|---|----------|
| `/view/0` | 🎬 TMDB 流行趋势 |
| `/view/1` | 🎥 TMDB 热门电影 |
| `/view/2` | 🍿 TMDB 正在热映 |
| `/view/3` | 📺 TMDB 热门剧集 |
| `/view/4` | 🔥 豆瓣热门电影 |
| `/view/5` | 🆕 豆瓣最新电影 |
| `/view/6` | 📡 豆瓣热门剧集 |
| `/view/7` | ✨ 豆瓣最新剧集 |

---

## 📄 License

MIT
