// ==========================================
// 全局常量配置
// ==========================================

interface TargetBank {
  name: string;
  source: "tmdb" | "douban";
  path?: string;
  type: "movie" | "tv" | "mixed";
  tag?: string;
}

// 目标榜单配置 (直接访问 TMDB 和 豆瓣 API)
const TARGET_BANKS: TargetBank[] = [
  { name: "🎬 TMDB 流行趋势", source: "tmdb", path: "/trending/all/day", type: "mixed" },
  { name: "🎥 TMDB 热门电影", source: "tmdb", path: "/movie/popular", type: "movie" },
  { name: "🍿 TMDB 正在热映", source: "tmdb", path: "/movie/now_playing", type: "movie" },
  { name: "📺 TMDB 热门剧集", source: "tmdb", path: "/tv/popular", type: "tv" },
  { name: "🔥 豆瓣热门电影", source: "douban", type: "movie", tag: "热门" },
  { name: "🆕 豆瓣最新电影", source: "douban", type: "movie", tag: "最新" },
  { name: "📡 豆瓣热门剧集", source: "douban", type: "tv", tag: "热门" },
  { name: "✨ 豆瓣最新剧集", source: "douban", type: "tv", tag: "最新" }
];

// ==========================================
// 类型定义
// ==========================================

interface Env {
  TMDB_API_KEY: string;
  HCTI_API_ID: string;
  HCTI_API_KEY: string;
  TG_BOT_TOKEN: string;
  TG_CHAT_ID: string;
}

interface TmdbDetails {
  actors: string;
  companies: string;
  date: string;
  poster: string;
}

interface BankItem {
  id?: number | string;
  tmdb_id?: number;
  media_type?: string;
  title?: string;
  name?: string;
  overview?: string;
  vote_average?: number;
  rating?: number;
  tmdbDetails?: TmdbDetails;
}

// ==========================================
// 辅助函数: TMDB API
// ==========================================

// 通过标题搜索 TMDB 获取 ID
async function searchTmdbByTitle(title: string, type: string, apiKey: string): Promise<number | null> {
  if (!title || !apiKey) return null;
  // mixed falls back to multi search
  const searchType = type === "mixed" ? "multi" : type;
  try {
    const url = `https://api.themoviedb.org/3/search/${searchType}?api_key=${apiKey}&query=${encodeURIComponent(title)}&language=zh-CN&page=1`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json: any = await res.json();
    if (json.results && json.results.length > 0) {
      return json.results[0].id;
    }
  } catch (e) {
    console.error(`TMDB 搜索失败: ${title}`);
  }
  return null;
}

async function fetchTmdbDetails(tmdbId: number, type: string, apiKey: string): Promise<TmdbDetails> {
  const result: TmdbDetails = { actors: "暂无演员信息", companies: "暂无", date: "未知", poster: "" };
  if (!tmdbId || isNaN(tmdbId) || !apiKey) return result;

  try {
    const fetchType = type === "mixed" ? "movie" : type; // Default to movie if mixed
    const url = `https://api.themoviedb.org/3/${fetchType}/${tmdbId}?api_key=${apiKey}&append_to_response=credits&language=zh-CN`;
    const res = await fetch(url);
    if (!res.ok) return result;
    const json: any = await res.json();

    if (json.poster_path) {
      result.poster = `https://image.tmdb.org/t/p/w500${json.poster_path}`;
    }

    const rawDate = json.release_date || json.first_air_date || "";
    if (rawDate) result.date = rawDate.split("-")[0];

    if (json.credits && json.credits.cast) {
      result.actors = json.credits.cast.slice(0, 3).map((c: any) => c.name).join(" / ");
    }

    if (json.production_companies) {
      result.companies = json.production_companies.slice(0, 2).map((c: any) => c.name).join(" / ");
    }
  } catch (err) {
    console.error(`TMDB 数据补全失败 ID: ${tmdbId}`);
  }
  return result;
}

// ==========================================
// 数据抓取逻辑
// ==========================================

async function fetchBankData(bank: TargetBank, env: Env): Promise<BankItem[]> {
  const items: BankItem[] = [];

  if (bank.source === "tmdb" && bank.path) {
    // 抓取 TMDB 榜单
    const url = `https://api.themoviedb.org/3${bank.path}?api_key=${env.TMDB_API_KEY}&language=zh-CN&page=1`;
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`TMDB 榜单获取失败: ${bank.name}`);
      return [];
    }
    const data: any = await res.json();
    const results = data.results || [];
    
    // 取前 20，并格式化
    for (const r of results.slice(0, 20)) {
      items.push({
        tmdb_id: r.id,
        media_type: bank.type === "mixed" ? r.media_type : bank.type,
        title: r.title || r.name,
        overview: r.overview,
        vote_average: r.vote_average
      });
    }

  } else if (bank.source === "douban" && bank.tag) {
    // 抓取 豆瓣 榜单
    const url = `https://movie.douban.com/j/search_subjects?type=${bank.type}&tag=${encodeURIComponent(bank.tag)}&sort=recommend&page_limit=20&page_start=0`;
    // 伪装浏览器 UA 防止被盾
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });
    
    if (!res.ok) {
      console.error(`豆瓣榜单获取失败: ${bank.name}`);
      return [];
    }
    const data: any = await res.json();
    const subjects = data.subjects || [];

    for (const s of subjects.slice(0, 20)) {
      items.push({
        id: s.id,
        media_type: bank.type,
        title: s.title,
        overview: "", // 豆瓣该接口不返回简介，将在 TMDB 补全
        rating: parseFloat(s.rate || "0")
      });
    }
  }

  return items;
}

// ==========================================
// HTML 与图片渲染
// ==========================================

function buildHtml(bankName: string, items: BankItem[]): string {
  let cardsHtml = '';

  items.forEach((item, index) => {
    let rankClass = 'normal-rank';
    if (index === 0) rankClass = 'top1';
    else if (index === 1) rankClass = 'top2';
    else if (index === 2) rankClass = 'top3';

    const title = item.title || item.name || '未知影视';
    const year = item.tmdbDetails?.date || '未知';
    const desc = item.overview ? item.overview.substring(0, 60) + '...' : '暂无详细简介';
    const score = item.vote_average || item.rating || 'N/A';
    const posterSrc = item.tmdbDetails?.poster || 'https://via.placeholder.com/140x200/cccccc/ffffff?text=No+Poster';
    const actors = item.tmdbDetails?.actors || '暂无演员信息';
    const companies = item.tmdbDetails?.companies || '暂无';

    cardsHtml += `
      <div class="movie-card">
        <div class="rank-badge ${rankClass}">${index + 1}</div>
        <img class="poster" src="${posterSrc}" />
        <div class="info-area">
          <h2 class="title">${title}</h2>
          <div class="meta-tags">${year} / ${companies}</div>
          <div class="description">${desc}</div>
          <div class="cast">👥 ${actors}</div>
        </div>
        <div class="rating-area">
          <div style="color: #888; font-size: 16px; margin-bottom: 8px;">综合评分</div>
          <div class="score">${typeof score === 'number' ? score.toFixed(1) : score}</div>
        </div>
      </div>
    `;
  });

  return `
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
    <meta charset="UTF-8">
    <style>
      body { background-color: #F8F3ED; font-family: "PingFang SC", "Microsoft YaHei", sans-serif; padding: 40px; width: 850px; margin: 0; }
      .header { background: linear-gradient(135deg, #1f1c2c, #928DAB); border-radius: 20px; padding: 40px; margin-bottom: 40px; color: white; text-align: center; box-shadow: 0 10px 30px rgba(0,0,0,0.15); }
      .header h1 { margin: 0; font-size: 52px; font-weight: bold; text-shadow: 2px 2px 4px rgba(0,0,0,0.3); }
      .header p { color: #eee; font-size: 20px; margin-top: 15px; letter-spacing: 2px; }
      .movie-card { display: flex; background: #FFF; border-radius: 16px; padding: 24px; margin-bottom: 28px; box-shadow: 0 8px 24px rgba(0,0,0,0.06); position: relative; border: 1px solid rgba(0,0,0,0.02); }
      .rank-badge { position: absolute; top: -12px; left: -12px; width: 48px; height: 60px; border-radius: 8px 8px 16px 8px; color: white; font-size: 32px; font-weight: bold; text-align: center; line-height: 54px; box-shadow: 2px 4px 10px rgba(0,0,0,0.2); }
      .top1 { background: linear-gradient(135deg, #FF416C, #FF4B2B); }
      .top2 { background: linear-gradient(135deg, #F37335, #FDC830); }
      .top3 { background: linear-gradient(135deg, #fceabb, #f8b500); color: #a67c00; }
      .normal-rank { background: #9E9E9E; }
      .poster { width: 140px; height: 200px; border-radius: 8px; object-fit: cover; margin-right: 24px; margin-left: 20px; box-shadow: 0 4px 10px rgba(0,0,0,0.1); background-color: #f5f5f5;}
      .info-area { flex: 1; display: flex; flex-direction: column; justify-content: space-between; padding-top: 4px; }
      .title { font-size: 32px; margin: 0 0 10px 0; color: #222; font-weight: 800; }
      .meta-tags { color: #666; font-size: 18px; margin-bottom: 12px; }
      .description { color: #555; font-size: 17px; line-height: 1.6; }
      .cast { font-size: 18px; color: #333; margin-top: 12px; font-weight: 500; }
      .rating-area { width: 140px; text-align: center; border-left: 2px dashed #E0E0E0; padding-left: 20px; display: flex; flex-direction: column; justify-content: center; }
      .score { font-size: 64px; font-weight: bold; color: #FF9800; font-family: "Impact", sans-serif; letter-spacing: 1px; }
    </style>
    </head>
    <body>
      <div class="header">
        <h1>${bankName}</h1>
        <p>每日 TOP 20 推荐 · ${new Date().toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' })}</p>
      </div>
      ${cardsHtml}
    </body>
    </html>
  `;
}

async function renderHtmlToImage(html: string, apiId: string, apiKey: string): Promise<string | null> {
  const auth = btoa(`${apiId}:${apiKey}`);
  try {
    const response = await fetch("https://hcti.io/v1/image", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ html: html, css: "", google_fonts: "PingFang SC" })
    });

    const result: any = await response.json();
    return result.url;
  } catch (err) {
    console.error("请求 HCTI 截图失败:", err);
    return null;
  }
}

async function sendPhotoToTelegram(photoUrl: string, caption: string, env: Env): Promise<void> {
  const tgUrl = `https://api.telegram.org/bot${env.TG_BOT_TOKEN}/sendPhoto`;
  try {
    const res = await fetch(tgUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: env.TG_CHAT_ID,
        photo: photoUrl,
        caption: caption,
        parse_mode: "HTML"
      })
    });

    if (res.ok) {
      console.log(`✅ 图片推送至 TG 成功: ${photoUrl}`);
    } else {
      const errJson = await res.json();
      console.error("TG 推送失败:", errJson);
    }
  } catch (err) {
    console.error("请求 TG API 异常:", err);
  }
}

// ==========================================
// 主流程
// ==========================================

async function processAllBanks(env: Env): Promise<void> {
  for (const bank of TARGET_BANKS) {
    try {
      console.log(`正在处理榜单: ${bank.name}`);

      // 1. 抓取榜单数据 (TMDB 或 豆瓣)
      const items = await fetchBankData(bank, env);
      if (items.length === 0) continue;

      // 2. 并发请求 TMDB 补全详情
      const hydratedItems = await Promise.all(items.map(async (item) => {
        let tmdbId = item.tmdb_id;
        const itemType = item.media_type || bank.type || "movie";

        // 如果是豆瓣来源没有 tmdb_id，通过标题搜索获取
        if (!tmdbId && item.title) {
          tmdbId = (await searchTmdbByTitle(item.title, itemType, env.TMDB_API_KEY)) || undefined;
        }

        // 抓取详情
        if (tmdbId) {
          const tmdbDetails = await fetchTmdbDetails(tmdbId, itemType, env.TMDB_API_KEY);
          return { ...item, tmdbDetails };
        } else {
           // 无法匹配 TMDB 时使用空详情
          return { ...item, tmdbDetails: { actors: "暂无", companies: "暂无", date: "未知", poster: "" } };
        }
      }));

      // 3. 构建精美的 HTML
      const htmlContent = buildHtml(bank.name, hydratedItems);

      // 4. 调用 HCTI 渲染长图
      const imageUrl = await renderHtmlToImage(htmlContent, env.HCTI_API_ID, env.HCTI_API_KEY);

      if (imageUrl) {
        // 5. 将生成的长图推送到 Telegram
        await sendPhotoToTelegram(imageUrl, `<b>【${bank.name}】</b> 今日 Top 20 更新啦！`, env);
      }

    } catch (e) {
      console.error(`处理榜单 ${bank.name} 发生异常:`, e);
    }
  }
  console.log("所有榜单处理完毕！");
}

async function runBotTask(env: Env): Promise<void> {
  console.log("启动抓取任务，正在从环境变量加载配置...");

  if (!env.TMDB_API_KEY || !env.TG_BOT_TOKEN || !env.HCTI_API_ID) {
    console.error("环境变量配置不完整，请配置 TMDB, TG, HCTI 变量。");
    return;
  }

  await processAllBanks(env);
}

// ==========================================
// 诊断检测函数
// ==========================================

interface CheckResult {
  name: string;
  icon: string;
  ok: boolean;
  detail: string;
  latency: number;
}

function checkEnvVars(env: Env): CheckResult {
  const vars = [
    { key: "TMDB_API_KEY", label: "TMDB API Key" },
    { key: "HCTI_API_ID", label: "HCTI API ID" },
    { key: "HCTI_API_KEY", label: "HCTI API Key" },
    { key: "TG_BOT_TOKEN", label: "TG Bot Token" },
    { key: "TG_CHAT_ID", label: "TG Chat ID" },
  ];

  const missing: string[] = [];
  for (const v of vars) {
    if (!(env as any)[v.key]) {
      missing.push(v.label);
    }
  }

  if (missing.length === 0) {
    return { name: "环境变量", icon: "⚙️", ok: true, detail: `全部 ${vars.length} 项已配置`, latency: 0 };
  } else {
    return { name: "环境变量", icon: "⚙️", ok: false, detail: `缺失: ${missing.join(", ")}`, latency: 0 };
  }
}

async function checkTelegram(env: Env): Promise<CheckResult> {
  if (!env.TG_BOT_TOKEN) return { name: "Telegram Bot", icon: "🤖", ok: false, detail: "未配置", latency: 0 };
  const start = Date.now();
  try {
    const res = await fetch(`https://api.telegram.org/bot${env.TG_BOT_TOKEN}/getMe`);
    const json: any = await res.json();
    if (json.ok) return { name: "Telegram Bot", icon: "🤖", ok: true, detail: `@${json.result.username}`, latency: Date.now() - start };
    return { name: "Telegram Bot", icon: "🤖", ok: false, detail: `API 错误: ${json.description}`, latency: Date.now() - start };
  } catch (e: any) {
    return { name: "Telegram Bot", icon: "🤖", ok: false, detail: `连接失败: ${e.message}`, latency: Date.now() - start };
  }
}

async function checkTelegramChat(env: Env): Promise<CheckResult> {
  if (!env.TG_BOT_TOKEN || !env.TG_CHAT_ID) return { name: "Telegram Chat", icon: "💬", ok: false, detail: "未配置", latency: 0 };
  const start = Date.now();
  try {
    const res = await fetch(`https://api.telegram.org/bot${env.TG_BOT_TOKEN}/getChat`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: env.TG_CHAT_ID })
    });
    const json: any = await res.json();
    if (json.ok) return { name: "Telegram Chat", icon: "💬", ok: true, detail: `${json.result.type}: ${json.result.title || json.result.username || env.TG_CHAT_ID}`, latency: Date.now() - start };
    return { name: "Telegram Chat", icon: "💬", ok: false, detail: `无法访问: ${json.description}`, latency: Date.now() - start };
  } catch (e: any) {
    return { name: "Telegram Chat", icon: "💬", ok: false, detail: `连接失败: ${e.message}`, latency: Date.now() - start };
  }
}

async function checkTmdb(env: Env): Promise<CheckResult> {
  if (!env.TMDB_API_KEY) return { name: "TMDB API", icon: "🎥", ok: false, detail: "未配置", latency: 0 };
  const start = Date.now();
  try {
    const res = await fetch(`https://api.themoviedb.org/3/movie/550?api_key=${env.TMDB_API_KEY}&language=zh-CN`);
    if (res.ok) return { name: "TMDB API", icon: "🎥", ok: true, detail: `连接正常`, latency: Date.now() - start };
    return { name: "TMDB API", icon: "🎥", ok: false, detail: `HTTP ${res.status}`, latency: Date.now() - start };
  } catch (e: any) {
    return { name: "TMDB API", icon: "🎥", ok: false, detail: `连接失败: ${e.message}`, latency: Date.now() - start };
  }
}

async function checkDouban(): Promise<CheckResult> {
  const start = Date.now();
  try {
    const res = await fetch("https://movie.douban.com/j/search_subjects?type=movie&tag=%E7%83%AD%E9%97%A8&page_limit=1&page_start=0", {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36" }
    });
    if (res.ok) return { name: "豆瓣 API", icon: "🟢", ok: true, detail: `连接正常`, latency: Date.now() - start };
    return { name: "豆瓣 API", icon: "🟢", ok: false, detail: `HTTP ${res.status}`, latency: Date.now() - start };
  } catch (e: any) {
    return { name: "豆瓣 API", icon: "🟢", ok: false, detail: `连接失败: ${e.message}`, latency: Date.now() - start };
  }
}

async function checkHcti(env: Env): Promise<CheckResult> {
  if (!env.HCTI_API_ID || !env.HCTI_API_KEY) return { name: "HCTI 截图", icon: "🖼️", ok: false, detail: "未配置", latency: 0 };
  const start = Date.now();
  try {
    const res = await fetch("https://hcti.io/v1/image", {
      method: "POST",
      headers: { "Authorization": `Basic ${btoa(`${env.HCTI_API_ID}:${env.HCTI_API_KEY}`)}`, "Content-Type": "application/json" },
      body: JSON.stringify({ html: "<div>OK</div>", css: "" })
    });
    if (res.ok) return { name: "HCTI 截图", icon: "🖼️", ok: true, detail: `渲染成功`, latency: Date.now() - start };
    return { name: "HCTI 截图", icon: "🖼️", ok: false, detail: `HTTP ${res.status}`, latency: Date.now() - start };
  } catch (e: any) {
    return { name: "HCTI 截图", icon: "🖼️", ok: false, detail: `连接失败: ${e.message}`, latency: Date.now() - start };
  }
}

function buildStatusHtml(results: CheckResult[]): string {
  const passCount = results.filter(r => r.ok).length;
  const totalCount = results.length;
  const allPass = passCount === totalCount;
  const rows = results.map(r => `
      <tr>
        <td style="padding:14px 24px;font-weight:600">${r.icon} ${r.name}</td>
        <td style="padding:14px 24px">${r.ok ? '<span style="color:#68d391">✅ 正常</span>' : '<span style="color:#fc8181">❌ 异常</span>'}</td>
        <td style="padding:14px 24px;color:#8b949e;font-size:13px">${r.detail}</td>
        <td style="padding:14px 24px;color:#8b949e;text-align:right">${r.latency > 0 ? r.latency + 'ms' : '-'}</td>
      </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>RMBD 系统诊断</title>
<style>body{font-family:system-ui,sans-serif;background:#0f1117;color:#e1e4e8;padding:40px 20px;} .container{max-width:800px;margin:0 auto;}
table{width:100%;border-collapse:collapse;background:#161b22;border-radius:12px;overflow:hidden;}
th{text-align:left;padding:12px 24px;color:#8b949e;border-bottom:1px solid #30363d;}
td{border-bottom:1px solid #21262d;} .btn{display:inline-block;padding:12px 28px;border-radius:8px;font-weight:600;text-decoration:none;color:white;margin:0 6px;}
</style></head>
<body><div class="container">
<div style="text-align:center;margin-bottom:40px"><h2>🎬 RMBD 系统诊断</h2><p style="color:#8b949e">影视榜单推送机器人 · 连通性检测</p></div>
<table><thead><tr><th>服务</th><th>状态</th><th>详情</th><th style="text-align:right">延迟</th></tr></thead><tbody>${rows}</tbody></table>
<div style="text-align:center;margin-top:40px">
  <a href="/status" class="btn" style="background:#21262d;border:1px solid #30363d">🔄 重新检测</a>
  ${allPass ? '<a href="/run" class="btn" style="background:#38a169">🚀 立即推送</a>' : ''}
  <a href="/test-tg" class="btn" style="background:#667eea">📨 发送 TG 测试消息</a>
</div></div></body></html>`;
}

// 发送 TG 测试文本消息
async function sendTestTelegramMessage(env: Env): Promise<{ ok: boolean; detail: string }> {
  if (!env.TG_BOT_TOKEN || !env.TG_CHAT_ID) return { ok: false, detail: "未配置 TG Token/ChatID" };
  try {
    const res = await fetch(`https://api.telegram.org/bot${env.TG_BOT_TOKEN}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: env.TG_CHAT_ID, text: `✅ <b>RMBD 测试成功</b>\n🤖 消息推送通道畅通！`, parse_mode: "HTML" })
    });
    const json: any = await res.json();
    return json.ok ? { ok: true, detail: "发送成功" } : { ok: false, detail: json.description };
  } catch (e: any) { return { ok: false, detail: e.message }; }
}

// ==========================================
// Worker 导出
// ==========================================
export default {
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runBotTask(env));
  },
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/status") {
      const results = await Promise.all([
        Promise.resolve(checkEnvVars(env)), checkTelegram(env), checkTelegramChat(env), checkTmdb(env), checkDouban(), checkHcti(env)
      ]);
      return new Response(buildStatusHtml(results), { headers: { "Content-Type": "text/html;charset=UTF-8" } });
    }

    if (request.method === "GET" && url.pathname === "/test-tg") {
      const result = await sendTestTelegramMessage(env);
      return new Response(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta http-equiv="refresh" content="3;url=/status">
        <style>body{font-family:system-ui;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#0f1117;color:#e1e4e8;margin:0;}</style></head>
        <body><div style="text-align:center"><h2>${result.ok ? '✅' : '❌'} ${result.detail}</h2><p>3 秒后返回...</p></div></body></html>`, 
        { headers: { "Content-Type": "text/html;charset=UTF-8" } });
    }

    if (request.method === "GET" && url.pathname === "/run") {
      ctx.waitUntil(runBotTask(env).catch(console.error));
      return new Response(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta http-equiv="refresh" content="3;url=/status">
        <style>body{font-family:system-ui;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#0f1117;color:#e1e4e8;margin:0;}</style></head>
        <body><div style="text-align:center"><h2>🚀 推送任务已在后台启动</h2><p>请稍后查看 Telegram</p></div></body></html>`, 
        { headers: { "Content-Type": "text/html;charset=UTF-8" } });
    }

    return Response.redirect(new URL("/status", request.url).toString(), 302);
  }
} satisfies ExportedHandler<Env>;
