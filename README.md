# 🎬 RMBD — 影视榜单 Telegram 图文推送机器人

基于 **Cloudflare Worker** 的影视榜单自动推送 Bot。  
每日定时**直接从 TMDB / 豆瓣 官方和公开接口**抓取榜单数据，通过 TMDB API 补全海报与演职人员信息，渲染为精美排行卡片长图后自动推送至 Telegram 频道。（**已彻底移除对 Movie-Pilot 的依赖！**）

---

## ✨ 功能特性

| 功能 | 说明 |
|------|------|
| 📊 八大榜单 | TMDB 流行趋势、TMDB 热门电影/剧集、TMDB 正在热映、豆瓣热门电影/剧集、豆瓣最新电影/剧集 |
| 🖼️ TMDB 数据补全 | 豆瓣榜单自动通过标题搜索 TMDB，补全高清海报、主演、发行公司信息 |
| 🎨 精美长图渲染 | 通过 HtmlCssToImage (HCTI) 将 HTML 排行卡片渲染为高质量长图 |
| 📤 Telegram 推送 | 自动将生成的长图推送至指定 Telegram 频道或群组 |
| ⏰ 定时触发 | 支持 Cron 定时任务（默认每日 UTC 0:00 / 北京时间 8:00） |
| 🚀 系统诊断 | 内置 `/status` 可视化诊断页面，一键检测所有服务连通性 |

---

## 🏗️ 技术架构

```
┌─────────────────┐     ┌──────────────┐     ┌──────────┐     ┌──────────────┐
│  Cron Trigger /  │────▶│ TMDB / 豆瓣   │────▶│ TMDB API │────▶│    HCTI      │
│  手动 /run 触发  │     │ 榜单原始数据  │     │ 详情补全  │     │  HTML→图片   │
└─────────────────┘     └──────────────┘     └──────────┘     └──────┬───────┘
                                                                     │
                                                                     ▼
                                                              ┌──────────────┐
                                                              │  Telegram    │
                                                              │  Bot 推送    │
                                                              └──────────────┘
```

---

## 🔑 环境变量配置

所有配置项均直接写在 `wrangler.jsonc` 文件的 `vars` 中，无需在 Cloudflare Dashboard 操作，真正做到开箱即用。

### 必须配置的 5 个环境变量

| 变量名 | 说明 | 获取方式 |
|--------|------|----------|
| `TMDB_API_KEY` | TMDB API 密钥 | 注册 [themoviedb.org](https://www.themoviedb.org/settings/api) 后获取 |
| `HCTI_API_ID` | HtmlCssToImage User ID | 注册 [htmlcsstoimage.com](https://htmlcsstoimage.com/) 后在 Dashboard 获取 |
| `HCTI_API_KEY` | HtmlCssToImage API Key | 同上 |
| `TG_BOT_TOKEN` | Telegram Bot Token | 通过 [@BotFather](https://t.me/BotFather) 创建 Bot 后获取 |
| `TG_CHAT_ID` | Telegram Chat ID | 频道 ID（如 `@your_channel`）或用户/群组数字 ID |

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

### Step 2: 填写配置项

打开项目根目录的 `wrangler.jsonc`，在 `vars` 中填入你的 5 个配置值：

```jsonc
	"vars": {
		"TMDB_API_KEY": "填你的Key",
		"HCTI_API_ID": "填你的ID",
		"HCTI_API_KEY": "填你的Key",
		"TG_BOT_TOKEN": "填你的Token",
		"TG_CHAT_ID": "填你的ChatID"
	}
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

### Step 4: 检查连通性

在浏览器中访问 Worker 的地址（或 `/status`），你将看到漂亮的系统诊断页面：

```
https://rmbd.your-subdomain.workers.dev/status
```

如果全部显示绿色 ✅，点击页面上的 **"🚀 立即推送"** 即可进行第一次推送！

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

## 📋 支持的榜单列表

| # | 榜单名称 | API 路径 | 来源 |
|---|----------|----------|------|
| 1 | 🎬 TMDB 流行趋势 | `/trending/all/day` | TMDB |
| 2 | 🎥 TMDB 热门电影 | `/movie/popular` | TMDB |
| 3 | 🍿 TMDB 正在热映 | `/movie/now_playing` | TMDB |
| 4 | 📺 TMDB 热门剧集 | `/tv/popular` | TMDB |
| 5 | 🔥 豆瓣热门电影 | `/j/search_subjects?tag=热门` | 豆瓣 |
| 6 | 🆕 豆瓣最新电影 | `/j/search_subjects?tag=最新` | 豆瓣 |
| 7 | 📡 豆瓣热门剧集 | `/j/search_subjects?tag=热门` | 豆瓣 |
| 8 | ✨ 豆瓣最新剧集 | `/j/search_subjects?tag=最新` | 豆瓣 |

如需增删榜单，编辑 `src/index.ts` 顶部的 `TARGET_BANKS` 数组。

---

## 📄 License

MIT
