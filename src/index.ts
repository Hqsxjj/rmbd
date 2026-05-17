// ==========================================
// 全局常量配置
// ==========================================

// 目标榜单配置
const TARGET_BANKS = [
  { name: "🎬 TMDB 流行趋势", url: "/api/v1/recommend/tmdb_trending", type: "mixed" },
  { name: "🎥 TMDB 热门电影", url: "/api/v1/recommend/tmdb_movies", type: "movie" },
  { name: "📺 TMDB 热门剧集", url: "/api/v1/recommend/tmdb_tvs", type: "tv" },
  { name: "🍿 豆瓣正在热映", url: "/api/v1/recommend/douban_movie_showing", type: "movie" },
  { name: "🔥 豆瓣热门电影", url: "/api/v1/recommend/douban_movie_hot", type: "movie" },
  { name: "🆕 豆瓣最新电影", url: "/api/v1/recommend/douban_movies", type: "movie" },
  { name: "📡 豆瓣热门剧集", url: "/api/v1/recommend/douban_tv_hot", type: "tv" },
  { name: "✨ 豆瓣最新剧集", url: "/api/v1/recommend/douban_tvs", type: "tv" }
];

// ==========================================
// 类型定义
// ==========================================

// 所有配置均通过 Cloudflare 环境变量 / Secrets 注入
interface Env {
  MOVIE_PILOT_URL: string;
  MOVIE_PILOT_TOKEN: string;
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
  tmdb_id?: number;
  id?: number;
  media_type?: string;
  title?: string;
  name?: string;
  overview?: string;
  vote_average?: number;
  rating?: number;
  items?: BankItem[];
  tmdbDetails: TmdbDetails;
}

// ==========================================
// 辅助函数
// ==========================================

async function fetchTmdbDetails(tmdbId: number, type: string, apiKey: string): Promise<TmdbDetails> {
  const result: TmdbDetails = { actors: "暂无演员信息", companies: "暂无", date: "未知", poster: "" };
  if (!tmdbId || isNaN(tmdbId) || !apiKey) return result;

  try {
    const url = `https://api.themoviedb.org/3/${type}/${tmdbId}?api_key=${apiKey}&append_to_response=credits&language=zh-CN`;
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

function buildHtml(bankName: string, items: BankItem[]): string {
  let cardsHtml = '';

  items.forEach((item, index) => {
    let rankClass = 'normal-rank';
    if (index === 0) rankClass = 'top1';
    else if (index === 1) rankClass = 'top2';
    else if (index === 2) rankClass = 'top3';

    const title = item.title || item.name || '未知影视';
    const year = item.tmdbDetails.date;
    const desc = item.overview ? item.overview.substring(0, 60) + '...' : '暂无详细简介';
    const score = item.vote_average || item.rating || 'N/A';
    const posterSrc = item.tmdbDetails.poster || 'https://via.placeholder.com/140x200/cccccc/ffffff?text=No+Poster';

    cardsHtml += `
      <div class="movie-card">
        <div class="rank-badge ${rankClass}">${index + 1}</div>
        <img class="poster" src="${posterSrc}" />
        <div class="info-area">
          <h2 class="title">${title}</h2>
          <div class="meta-tags">${year} / ${item.tmdbDetails.companies}</div>
          <div class="description">${desc}</div>
          <div class="cast">👥 ${item.tmdbDetails.actors}</div>
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

async function processAllBanks(env: Env): Promise<void> {
  for (const bank of TARGET_BANKS) {
    try {
      console.log(`正在处理榜单: ${bank.name}`);

      // 1. 获取 Movie-Pilot 榜单基础数据
      const apiUrl = `${env.MOVIE_PILOT_URL}${bank.url}`;
      const res = await fetch(apiUrl, {
        headers: { "Authorization": `Bearer ${env.MOVIE_PILOT_TOKEN}` }
      });

      if (!res.ok) {
        console.error(`请求 Movie-Pilot 失败: ${res.status}`);
        continue;
      }

      const data: any = await res.json();
      const items: BankItem[] = (Array.isArray(data) ? data : data.items || []).slice(0, 20);

      if (items.length === 0) continue;

      // 2. 并发请求 TMDB 补全海报、发行方和演员信息
      const hydratedItems = await Promise.all(items.map(async (item) => {
        const tmdbId = item.tmdb_id || item.id;
        const itemType = bank.type === "mixed" ? (item.media_type || "movie") : bank.type;
        const tmdbDetails = await fetchTmdbDetails(tmdbId!, itemType, env.TMDB_API_KEY);
        return { ...item, tmdbDetails };
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

  // 检查核心配置是否完整
  if (!env.MOVIE_PILOT_URL || !env.TG_BOT_TOKEN || !env.HCTI_API_ID) {
    console.error("环境变量配置不完整，请在 Cloudflare Dashboard → Worker → Settings → Variables 中填写所有必需变量");
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

// 检测环境变量是否已配置
function checkEnvVars(env: Env): CheckResult {
  const vars = [
    { key: "MOVIE_PILOT_URL", label: "Movie-Pilot URL" },
    { key: "MOVIE_PILOT_TOKEN", label: "Movie-Pilot Token" },
    { key: "TMDB_API_KEY", label: "TMDB API Key" },
    { key: "HCTI_API_ID", label: "HCTI API ID" },
    { key: "HCTI_API_KEY", label: "HCTI API Key" },
    { key: "TG_BOT_TOKEN", label: "TG Bot Token" },
    { key: "TG_CHAT_ID", label: "TG Chat ID" },
  ];

  const missing: string[] = [];
  const configured: string[] = [];

  for (const v of vars) {
    if ((env as any)[v.key]) {
      configured.push(v.label);
    } else {
      missing.push(v.label);
    }
  }

  if (missing.length === 0) {
    return { name: "环境变量", icon: "⚙️", ok: true, detail: `全部 ${vars.length} 项已配置`, latency: 0 };
  } else {
    return { name: "环境变量", icon: "⚙️", ok: false, detail: `缺失: ${missing.join(", ")}`, latency: 0 };
  }
}

// 检测 Telegram Bot 连通性 (调用 getMe)
async function checkTelegram(env: Env): Promise<CheckResult> {
  if (!env.TG_BOT_TOKEN) {
    return { name: "Telegram Bot", icon: "🤖", ok: false, detail: "TG_BOT_TOKEN 未配置", latency: 0 };
  }
  const start = Date.now();
  try {
    const res = await fetch(`https://api.telegram.org/bot${env.TG_BOT_TOKEN}/getMe`);
    const latency = Date.now() - start;
    const json: any = await res.json();
    if (json.ok) {
      return { name: "Telegram Bot", icon: "🤖", ok: true, detail: `@${json.result.username} (${json.result.first_name})`, latency };
    }
    return { name: "Telegram Bot", icon: "🤖", ok: false, detail: `API 返回错误: ${json.description}`, latency };
  } catch (e: any) {
    return { name: "Telegram Bot", icon: "🤖", ok: false, detail: `连接失败: ${e.message}`, latency: Date.now() - start };
  }
}

// 检测 Telegram Chat 可达性 (调用 getChat)
async function checkTelegramChat(env: Env): Promise<CheckResult> {
  if (!env.TG_BOT_TOKEN || !env.TG_CHAT_ID) {
    return { name: "Telegram Chat", icon: "💬", ok: false, detail: "TG_BOT_TOKEN 或 TG_CHAT_ID 未配置", latency: 0 };
  }
  const start = Date.now();
  try {
    const res = await fetch(`https://api.telegram.org/bot${env.TG_BOT_TOKEN}/getChat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: env.TG_CHAT_ID })
    });
    const latency = Date.now() - start;
    const json: any = await res.json();
    if (json.ok) {
      const chat = json.result;
      const chatName = chat.title || chat.first_name || chat.username || env.TG_CHAT_ID;
      return { name: "Telegram Chat", icon: "💬", ok: true, detail: `${chat.type}: ${chatName}`, latency };
    }
    return { name: "Telegram Chat", icon: "💬", ok: false, detail: `无法访问目标 Chat: ${json.description}`, latency };
  } catch (e: any) {
    return { name: "Telegram Chat", icon: "💬", ok: false, detail: `连接失败: ${e.message}`, latency: Date.now() - start };
  }
}

// 检测 Movie-Pilot 连通性
async function checkMoviePilot(env: Env): Promise<CheckResult> {
  if (!env.MOVIE_PILOT_URL) {
    return { name: "Movie-Pilot", icon: "🎬", ok: false, detail: "MOVIE_PILOT_URL 未配置", latency: 0 };
  }
  const start = Date.now();
  try {
    // 尝试请求第一个榜单来检测连通性
    const headers: Record<string, string> = {};
    if (env.MOVIE_PILOT_TOKEN) {
      headers["Authorization"] = `Bearer ${env.MOVIE_PILOT_TOKEN}`;
    }
    const res = await fetch(`${env.MOVIE_PILOT_URL}/api/v1/recommend/tmdb_trending`, { headers });
    const latency = Date.now() - start;

    if (res.ok) {
      const data: any = await res.json();
      const count = Array.isArray(data) ? data.length : (data.items?.length || 0);
      return { name: "Movie-Pilot", icon: "🎬", ok: true, detail: `连接正常，获取到 ${count} 条数据`, latency };
    }
    if (res.status === 401 || res.status === 403) {
      return { name: "Movie-Pilot", icon: "🎬", ok: false, detail: `认证失败 (${res.status})，请检查 Token`, latency };
    }
    return { name: "Movie-Pilot", icon: "🎬", ok: false, detail: `HTTP ${res.status}: ${res.statusText}`, latency };
  } catch (e: any) {
    return { name: "Movie-Pilot", icon: "🎬", ok: false, detail: `连接失败: ${e.message}`, latency: Date.now() - start };
  }
}

// 检测 TMDB API 连通性
async function checkTmdb(env: Env): Promise<CheckResult> {
  if (!env.TMDB_API_KEY) {
    return { name: "TMDB API", icon: "🎥", ok: false, detail: "TMDB_API_KEY 未配置", latency: 0 };
  }
  const start = Date.now();
  try {
    const res = await fetch(`https://api.themoviedb.org/3/movie/550?api_key=${env.TMDB_API_KEY}&language=zh-CN`);
    const latency = Date.now() - start;

    if (res.ok) {
      const json: any = await res.json();
      return { name: "TMDB API", icon: "🎥", ok: true, detail: `连接正常 (测试: ${json.title || json.original_title})`, latency };
    }
    if (res.status === 401) {
      return { name: "TMDB API", icon: "🎥", ok: false, detail: "API Key 无效", latency };
    }
    return { name: "TMDB API", icon: "🎥", ok: false, detail: `HTTP ${res.status}`, latency };
  } catch (e: any) {
    return { name: "TMDB API", icon: "🎥", ok: false, detail: `连接失败: ${e.message}`, latency: Date.now() - start };
  }
}

// 检测 HCTI API 连通性
async function checkHcti(env: Env): Promise<CheckResult> {
  if (!env.HCTI_API_ID || !env.HCTI_API_KEY) {
    return { name: "HCTI 截图", icon: "🖼️", ok: false, detail: "HCTI_API_ID 或 HCTI_API_KEY 未配置", latency: 0 };
  }
  const start = Date.now();
  try {
    const auth = btoa(`${env.HCTI_API_ID}:${env.HCTI_API_KEY}`);
    const res = await fetch("https://hcti.io/v1/image", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        html: "<div style='padding:20px;font-size:24px;color:#333;'>RMBD 连通性测试 ✅</div>",
        css: ""
      })
    });
    const latency = Date.now() - start;

    if (res.ok) {
      const json: any = await res.json();
      if (json.url) {
        return { name: "HCTI 截图", icon: "🖼️", ok: true, detail: `渲染成功`, latency };
      }
    }
    if (res.status === 401 || res.status === 403) {
      return { name: "HCTI 截图", icon: "🖼️", ok: false, detail: "API 认证失败，请检查 ID 和 Key", latency };
    }
    return { name: "HCTI 截图", icon: "🖼️", ok: false, detail: `HTTP ${res.status}`, latency };
  } catch (e: any) {
    return { name: "HCTI 截图", icon: "🖼️", ok: false, detail: `连接失败: ${e.message}`, latency: Date.now() - start };
  }
}

// 构建诊断结果 HTML 页面
function buildStatusHtml(results: CheckResult[]): string {
  const passCount = results.filter(r => r.ok).length;
  const totalCount = results.length;
  const allPass = passCount === totalCount;

  const rows = results.map(r => {
    const statusBadge = r.ok
      ? '<span class="badge pass">✅ 正常</span>'
      : '<span class="badge fail">❌ 异常</span>';
    const latencyText = r.latency > 0 ? `${r.latency}ms` : '-';
    return `
      <tr>
        <td class="svc-name">${r.icon} ${r.name}</td>
        <td>${statusBadge}</td>
        <td class="detail">${r.detail}</td>
        <td class="latency">${latencyText}</td>
      </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>RMBD 系统诊断</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      background: #0f1117;
      color: #e1e4e8;
      min-height: 100vh;
      padding: 40px 20px;
    }
    .container { max-width: 800px; margin: 0 auto; }
    .header {
      text-align: center;
      margin-bottom: 40px;
    }
    .header h1 {
      font-size: 28px;
      font-weight: 700;
      background: linear-gradient(135deg, #667eea, #764ba2);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 8px;
    }
    .header p { color: #8b949e; font-size: 14px; }

    .summary {
      display: flex;
      justify-content: center;
      gap: 16px;
      margin-bottom: 32px;
    }
    .summary-card {
      background: ${allPass ? 'rgba(56, 161, 105, 0.1)' : 'rgba(229, 62, 62, 0.1)'};
      border: 1px solid ${allPass ? 'rgba(56, 161, 105, 0.3)' : 'rgba(229, 62, 62, 0.3)'};
      border-radius: 12px;
      padding: 20px 40px;
      text-align: center;
    }
    .summary-card .big {
      font-size: 36px;
      font-weight: 700;
      color: ${allPass ? '#38a169' : '#e53e3e'};
    }
    .summary-card .label { color: #8b949e; font-size: 13px; margin-top: 4px; }

    .card {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 12px;
      overflow: hidden;
      margin-bottom: 24px;
    }
    .card-title {
      padding: 16px 24px;
      font-size: 15px;
      font-weight: 600;
      color: #c9d1d9;
      border-bottom: 1px solid #21262d;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    table { width: 100%; border-collapse: collapse; }
    th {
      text-align: left;
      padding: 12px 24px;
      font-size: 12px;
      font-weight: 600;
      color: #8b949e;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border-bottom: 1px solid #21262d;
    }
    td {
      padding: 14px 24px;
      font-size: 14px;
      border-bottom: 1px solid #21262d;
    }
    tr:last-child td { border-bottom: none; }
    tr:hover { background: rgba(255,255,255,0.02); }

    .svc-name { font-weight: 600; white-space: nowrap; }
    .detail { color: #8b949e; font-size: 13px; max-width: 300px; word-break: break-word; }
    .latency { color: #8b949e; font-size: 13px; text-align: right; font-family: monospace; }

    .badge {
      display: inline-block;
      padding: 3px 10px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      white-space: nowrap;
    }
    .badge.pass { background: rgba(56, 161, 105, 0.15); color: #68d391; }
    .badge.fail { background: rgba(229, 62, 62, 0.15); color: #fc8181; }

    .actions {
      display: flex;
      gap: 12px;
      justify-content: center;
      margin-top: 32px;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 12px 28px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      text-decoration: none;
      transition: all 0.2s;
      cursor: pointer;
      border: none;
    }
    .btn-primary {
      background: linear-gradient(135deg, #667eea, #764ba2);
      color: white;
    }
    .btn-primary:hover { opacity: 0.9; transform: translateY(-1px); }
    .btn-secondary {
      background: #21262d;
      color: #c9d1d9;
      border: 1px solid #30363d;
    }
    .btn-secondary:hover { background: #30363d; }
    .btn-success {
      background: linear-gradient(135deg, #38a169, #2f855a);
      color: white;
    }
    .btn-success:hover { opacity: 0.9; transform: translateY(-1px); }

    .footer {
      text-align: center;
      margin-top: 40px;
      color: #484f58;
      font-size: 12px;
    }

    @media (max-width: 640px) {
      th:nth-child(4), td.latency { display: none; }
      td { padding: 10px 14px; }
      th { padding: 10px 14px; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎬 RMBD 系统诊断</h1>
      <p>影视榜单推送机器人 · 连通性检测</p>
    </div>

    <div class="summary">
      <div class="summary-card">
        <div class="big">${passCount} / ${totalCount}</div>
        <div class="label">${allPass ? '🎉 全部服务正常' : '⚠️ 部分服务异常'}</div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">📡 服务连通性检测结果</div>
      <table>
        <thead>
          <tr>
            <th>服务</th>
            <th>状态</th>
            <th>详情</th>
            <th style="text-align:right">延迟</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>

    <div class="actions">
      <a href="/status" class="btn btn-secondary">🔄 重新检测</a>
      ${allPass ? '<a href="/run" class="btn btn-success">🚀 立即推送</a>' : ''}
      <a href="/test-tg" class="btn btn-primary">📨 发送 TG 测试消息</a>
    </div>

    <div class="footer">
      检测时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })} · Powered by Cloudflare Workers
    </div>
  </div>
</body>
</html>`;
}

// 发送 TG 测试文本消息
async function sendTestTelegramMessage(env: Env): Promise<{ ok: boolean; detail: string }> {
  if (!env.TG_BOT_TOKEN || !env.TG_CHAT_ID) {
    return { ok: false, detail: "TG_BOT_TOKEN 或 TG_CHAT_ID 未配置" };
  }
  try {
    const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
    const res = await fetch(`https://api.telegram.org/bot${env.TG_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: env.TG_CHAT_ID,
        text: `✅ <b>RMBD 连通性测试成功</b>\n\n🕐 时间: ${now}\n🤖 Bot 运行正常，消息推送通道畅通！`,
        parse_mode: "HTML"
      })
    });
    const json: any = await res.json();
    if (json.ok) {
      return { ok: true, detail: `消息已成功发送至 Chat ${env.TG_CHAT_ID}` };
    }
    return { ok: false, detail: `发送失败: ${json.description}` };
  } catch (e: any) {
    return { ok: false, detail: `请求异常: ${e.message}` };
  }
}

// ==========================================
// Worker 导出
// ==========================================
export default {
  // 定时任务入口 (Cron Triggers)
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runBotTask(env));
  },

  // HTTP 请求入口
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // 路由：系统诊断页面
    if (request.method === "GET" && url.pathname === "/status") {
      // 并发执行所有检测
      const results = await Promise.all([
        Promise.resolve(checkEnvVars(env)),
        checkTelegram(env),
        checkTelegramChat(env),
        checkMoviePilot(env),
        checkTmdb(env),
        checkHcti(env),
      ]);
      const html = buildStatusHtml(results);
      return new Response(html, { headers: { "Content-Type": "text/html;charset=UTF-8" } });
    }

    // 路由：发送 TG 测试消息
    if (request.method === "GET" && url.pathname === "/test-tg") {
      const result = await sendTestTelegramMessage(env);
      const emoji = result.ok ? "✅" : "❌";
      const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta http-equiv="refresh" content="3;url=/status">
        <style>body{font-family:system-ui;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#0f1117;color:#e1e4e8;margin:0;}
        .msg{text-align:center;padding:40px;background:#161b22;border:1px solid #30363d;border-radius:16px;}
        h2{margin:0 0 12px;font-size:20px;}p{color:#8b949e;font-size:14px;margin:8px 0 0;}</style></head>
        <body><div class="msg"><h2>${emoji} ${result.ok ? 'TG 测试消息已发送' : 'TG 测试消息发送失败'}</h2>
        <p>${result.detail}</p><p>3 秒后返回诊断页面...</p></div></body></html>`;
      return new Response(html, { headers: { "Content-Type": "text/html;charset=UTF-8" } });
    }

    // 路由：手动触发推送任务
    if (request.method === "GET" && url.pathname === "/run") {
      runBotTask(env).catch(console.error);
      const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta http-equiv="refresh" content="5;url=/status">
        <style>body{font-family:system-ui;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#0f1117;color:#e1e4e8;margin:0;}
        .msg{text-align:center;padding:40px;background:#161b22;border:1px solid #30363d;border-radius:16px;}
        h2{margin:0 0 12px;font-size:20px;}p{color:#8b949e;font-size:14px;margin:8px 0 0;}</style></head>
        <body><div class="msg"><h2>🚀 推送任务已启动</h2><p>任务已在后台运行，请稍后查看 Telegram 频道。</p>
        <p>5 秒后返回诊断页面...</p></div></body></html>`;
      return new Response(html, { headers: { "Content-Type": "text/html;charset=UTF-8" } });
    }

    // 默认路由：重定向到诊断页
    return Response.redirect(new URL("/status", request.url).toString(), 302);
  }
} satisfies ExportedHandler<Env>;
