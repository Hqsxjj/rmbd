# 🎬 影视榜单动态 Telegram 推送机器人

基于 **Cloudflare Worker** 的轻量级、无服务器（Serverless）影视榜单系统。

系统彻底摒弃了第三方低清长图渲染或中转服务。通过在 Cloudflare 边缘节点直接请求 **TMDB**、**豆瓣** 和 **猫眼** API，**实时渲染出极具现代感的高清自适应动态网页**，并每日自动通过 Telegram 发送更新汇总提醒。

---

## ✨ 核心特性

- 🌐 **多源聚合**：支持 TMDB、豆瓣、猫眼三大平台的 15 个精选榜单（电影、剧集、综艺等）。
- 🖼️ **数据智能补全**：豆瓣和猫眼榜单自动通过标题检索 TMDB，智能补全高清海报、主演及发行信息，告别单一平台数据缺失。
- 📱 **高清动态网页**：拒绝模糊截图！用户点击链接即刻渲染原画质 HTML5 网页，完美自适应手机、平板和桌面端。
- 📤 **Telegram 智能推送**：自动将生成的各榜单网页链接推送至指定 Telegram 频道，支持富文本及网页预览。
- 🛠️ **系统自检面板**：内置 `/status` 诊断路由，一键检测环境变量、API 连通性，并支持手动触发推送。
- 🚀 **极简部署**：完全无需 KV 存储或数据库！只需配置 3 个环境变量，一键即可部署至 Cloudflare。

---

## 🏗️ 技术架构

```text
┌─────────────────┐     ┌──────────────┐     ┌──────────┐     ┌────────────────┐
│  Cron Trigger /  │────▶│ 获取各大榜单 │────▶│  Telegram  │────▶│ 用户点击查看网页 │
│  手动 /run 触发  │     │ 实时数据检索 │     │  Bot 推送  │     └───────┬────────┘
└─────────────────┘     └──────────────┘     └──────────┘             │
                                                                      │ (访问 /view/:id)
                                                                      ▼
                                                            ┌────────────────┐
                                                            │ TMDB 数据补全  │
                                                            │ 实时 HTML 渲染 │
                                                            └────────────────┘
```

---

## 📋 支持的榜单路由 (`/view/:id`)

系统目前支持 15 个榜单，访问地址为 `https://your-worker.workers.dev/view/{ID}`：

| ID | 榜单名称 | 数据来源 | 类型 |
|:---|:---|:---|:---|
| `tmdb_trending` | 🎬 TMDB 流行趋势 | TMDB | 混合 |
| `tmdb_movie_popular` | 🎥 TMDB 热门电影 | TMDB | 电影 |
| `tmdb_movie_now_playing` | 🍿 TMDB 正在热映 | TMDB | 电影 |
| `tmdb_tv_popular` | 📺 TMDB 热门剧集 | TMDB | 剧集 |
| `douban_movie_hot` | 🔥 豆瓣热门电影 | 豆瓣 | 电影 |
| `douban_movie_latest` | 🆕 豆瓣最新电影 | 豆瓣 | 电影 |
| `maoyan_movie_hot` | 🐱 猫眼热映电影 | 猫眼 | 电影 |
| `douban_tv_hot` | 📡 豆瓣热门剧集 | 豆瓣 | 剧集 |
| `douban_tv_latest` | ✨ 豆瓣最新剧集 | 豆瓣 | 剧集 |
| `douban_tv_realtime_hot` | 📈 豆瓣实时热门剧集 | 豆瓣 | 剧集 |
| `douban_tv_chinese_best` | 📺 豆瓣华语口碑剧集 | 豆瓣 | 剧集 |
| `douban_tv_global_best` | 🌍 豆瓣全球口碑剧集 | 豆瓣 | 剧集 |
| `douban_show_chinese_best`| 🎤 豆瓣国内口碑综艺 | 豆瓣 | 综艺 |
| `douban_movie_weekly_best`| 🏅 豆瓣一周口碑电影 | 豆瓣 | 电影 |
| `douban_mixed_ecqm` | 🌟 豆瓣精选合集 | 豆瓣 | 混合 |

---

## 🔑 环境变量配置

不要将秘钥或敏感配置直接写入 `wrangler.jsonc`。
请改用 Cloudflare Dashboard 或 Wrangler Secrets 来管理环境变量。

### 必须配置的 3 个环境变量

| 变量名 | 说明 | 获取方式 |
|:---|:---|:---|
| `TMDB_API_KEY` | TMDB API 密钥 | 注册 [TheMovieDB](https://www.themoviedb.org/settings/api) 获取 |
| `TG_BOT_TOKEN` | Telegram Bot Token | 通过 [@BotFather](https://t.me/BotFather) 创建 Bot 获取 |
| `TG_CHAT_ID` | Telegram Chat ID | 频道 ID（如 `@your_channel`）或数字 ID |

### 推荐方式

- **Cloudflare Dashboard**:
  - 进入 Worker 的 `Settings` -> `Variables` 页面。
  - 添加 `TMDB_API_KEY`, `TG_BOT_TOKEN`, `TG_CHAT_ID`。
- **Wrangler CLI**:
  - 运行 `npx wrangler secret put TMDB_API_KEY`
  - 运行 `npx wrangler secret put TG_BOT_TOKEN`
  - 运行 `npx wrangler secret put TG_CHAT_ID`

> ⚠️ **敏感配置请勿提交到公开仓库**。

---

## 🚀 部署指南

### 前置条件

1. 已安装 [Node.js](https://nodejs.org/) (v18+)
2. 已注册 [Cloudflare](https://dash.cloudflare.com/) 账号
3. 已登录 Wrangler CLI（运行 `npx wrangler login`）

### 步骤 1：克隆项目并安装依赖

```bash
git clone https://github.com/Hqsxjj/rmbd.git
cd rmbd
npm install
```

### 步骤 2：填写配置

不要在 `wrangler.jsonc` 中写入明文秘钥。
请在 Cloudflare Dashboard 的 Worker Variables 页面中添加以下环境变量，或使用 Wrangler CLI 的 secret 命令：

```bash
npx wrangler secret put TMDB_API_KEY
npx wrangler secret put TG_BOT_TOKEN
npx wrangler secret put TG_CHAT_ID
```

### 步骤 3：一键部署

```bash
npm run deploy
```

部署成功后，Cloudflare 会输出你的 Worker 地址，例如：
`https://rmbd.your-username.workers.dev`

---

## ⚙️ 系统诊断与手动触发

- **系统状态诊断**：访问 `https://your-worker.workers.dev/status`，查看环境变量及各 API 的连通性。
- **手动触发推送**：在 `/status` 页面点击“立即推送”，或直接访问 `/run` 路由。
- **发送测试消息**：在 `/status` 页面点击“发送 TG 测试消息”，或访问 `/test-tg`。

---

## ⏰ 定时任务

默认配置下，系统每天会在 **UTC 0:00**（北京时间早上 8:00）自动执行推送。
如需修改，请调整 `wrangler.jsonc` 中的 `triggers.crons` 表达式。

## 默认 pin 码 4321
---

## 📄 开源协议
鼓励各位大佬复制下载二次编辑，融合进自己项目增加榜单功能~
MIT
