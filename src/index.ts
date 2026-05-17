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
// Worker 导出
// ==========================================
export default {
  // 定时任务入口 (Cron Triggers)
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runBotTask(env));
  },

  // HTTP 请求入口 (手动触发 & 状态检查)
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // 路由：手动触发推送任务进行测试
    if (request.method === "GET" && url.pathname === "/run") {
      runBotTask(env).catch(console.error);
      return new Response("🚀 抓取与图文生成任务已在后台启动！请稍后查看 Telegram。", {
        status: 200,
        headers: { "Content-Type": "text/plain;charset=UTF-8" }
      });
    }

    // 默认路由：状态页
    return new Response(
      "✅ RMBD Bot is running.\n\n👉 访问 /run 手动触发一次推送\n📋 环境变量请在 Cloudflare Dashboard 中配置",
      { status: 200, headers: { "Content-Type": "text/plain;charset=UTF-8" } }
    );
  }
} satisfies ExportedHandler<Env>;
