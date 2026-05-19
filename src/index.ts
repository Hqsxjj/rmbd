// ==========================================
// 全局常量配置
// ==========================================

interface TargetBank {
  id: string;
  name: string;
  source: "tmdb" | "douban" | "maoyan";
  path?: string;
  type: "movie" | "tv" | "mixed";
  tag?: string;
  sort?: "recommend" | "time" | "rank";
  collection_id?: string;
}

// 目标榜单配置 (直接访问 TMDB 和 豆瓣 API)
const TARGET_BANKS: TargetBank[] = [
  { id: "tmdb_trending", name: "🎬 TMDB 流行趋势", source: "tmdb", path: "/trending/all/day", type: "mixed" },
  { id: "tmdb_movie_popular", name: "🎥 TMDB 热门电影", source: "tmdb", path: "/movie/popular", type: "movie" },
  { id: "tmdb_movie_now_playing", name: "🍿 TMDB 正在热映", source: "tmdb", path: "/movie/now_playing", type: "movie" },
  { id: "tmdb_tv_popular", name: "📺 TMDB 热门剧集", source: "tmdb", path: "/tv/popular", type: "tv" },
  { id: "douban_movie_hot", name: "🔥 豆瓣热门电影", source: "douban", type: "movie", tag: "热门" },
  { id: "douban_movie_latest", name: "🆕 豆瓣最新电影", source: "douban", type: "movie", tag: "最新" },
  { id: "maoyan_movie_hot", name: "🐱 猫眼热映电影", source: "maoyan", type: "movie" },
  { id: "douban_tv_hot", name: "📡 豆瓣热门剧集", source: "douban", type: "tv", tag: "热门" },
  { id: "douban_tv_latest", name: "✨ 豆瓣最新剧集", source: "douban", type: "tv", tag: "热门", sort: "time" },
  { id: "douban_tv_realtime_hot", name: "📈 豆瓣实时热门剧集", source: "douban", type: "tv", collection_id: "tv_real_time_hotest" },
  { id: "douban_tv_chinese_best", name: "📺 豆瓣华语口碑剧集", source: "douban", type: "tv", collection_id: "tv_chinese_best_weekly" },
  { id: "douban_tv_global_best", name: "🌍 豆瓣全球口碑剧集", source: "douban", type: "tv", collection_id: "tv_global_best_weekly" },
  { id: "douban_show_chinese_best", name: "🎤 豆瓣国内口碑综艺", source: "douban", type: "tv", collection_id: "show_chinese_best_weekly" },
  { id: "douban_movie_weekly_best", name: "🏅 豆瓣一周口碑电影", source: "douban", type: "movie", collection_id: "movie_weekly_best" },
  { id: "douban_mixed_ecqm", name: "🌟 豆瓣精选合集", source: "douban", type: "mixed", collection_id: "ECQM7YUOQ" }
];

let MANUAL_PUSH_PIN = "4321";

function sanitizeMaoyanShowInfo(showInfo: string): { display: string; boxOffice?: string } {
  let display = (showInfo || "").trim();
  if (!display) return { display: "" };

  const boxOfficeMatch = display.match(/票房[:：]?\s*([\d.,]+(?:万|亿)?元?)/);
  const boxOffice = boxOfficeMatch ? boxOfficeMatch[1] : undefined;

  display = display.replace(/今天\s*\d+家影院\s*/g, "今天 ");
  display = display.replace(/\d+家影院\s*/g, "");
  display = display.replace(/\s+/g, " ").trim();
  return { display, boxOffice };
}

// ==========================================
// 类型定义
// ==========================================

interface Env {
  TMDB_API_KEY: string;
  TG_BOT_TOKEN: string;
  TG_CHAT_ID: string;
  WECOM_WEBHOOK_URL: string;
}

interface TmdbDetails {
  actors: string;
  companies: string;
  date: string;
  poster: string;
  overview?: string;
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
  douban_poster?: string;
  maoyan_actors?: string;
  maoyan_rt?: string;
  maoyan_showInfo?: string;
  maoyan_boxOffice?: string;
}

// ==========================================
// 辅助函数: 标题清理 & TMDB API
// ==========================================

function cleanTitle(title: string): string {
  if (!title) return "";
  return title
    .replace(/第[一二三四五六七八九十\d]+[季部]/g, '') // 去除“第一季”、“第2部”等
    .replace(/\s\d{4}$/, '') // 去除结尾的年份
    .replace(/[·：: \-].*$/, '') // 去除副标题 (如 狐妖小红娘·月红篇 -> 狐妖小红娘)
    .trim();
}

// 通过标题搜索 TMDB 获取 ID
async function searchTmdbByTitle(title: string, type: string, apiKey: string): Promise<number | null> {
  if (!title || !apiKey) return null;
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
    
    if (json.overview) {
      result.overview = json.overview;
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
    const url = `https://api.themoviedb.org/3${bank.path}?api_key=${env.TMDB_API_KEY}&language=zh-CN&page=1`;
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`TMDB 榜单获取失败: ${bank.name}`);
      return [];
    }
    const data: any = await res.json();
    const results = data.results || [];
    
    for (const r of results.slice(0, 20)) {
      items.push({
        tmdb_id: r.id,
        media_type: bank.type === "mixed" ? r.media_type : bank.type,
        title: r.title || r.name,
        overview: r.overview,
        vote_average: r.vote_average
      });
    }

  } else if (bank.source === "douban") {
    let url = "";
    if (bank.collection_id) {
      url = `https://m.douban.com/rexxar/api/v2/subject_collection/${bank.collection_id}/items?start=0&count=20`;
    } else if (bank.tag) {
      const sortParam = bank.sort || "recommend";
      url = `https://movie.douban.com/j/search_subjects?type=${bank.type}&tag=${encodeURIComponent(bank.tag)}&sort=${sortParam}&page_limit=20&page_start=0`;
    }

    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": "https://m.douban.com/subject_collection/" + (bank.collection_id || "")
      }
    });
    
    if (!res.ok) {
      console.error(`豆瓣榜单获取失败: ${bank.name}`);
      return [];
    }
    const data: any = await res.json();

    if (bank.collection_id) {
      const subjects = data.subject_collection_items || [];
      for (const s of subjects.slice(0, 20)) {
        let poster = "";
        if (typeof s.cover === "string") poster = s.cover;
        else if (s.cover?.url) poster = s.cover.url;
        else if (s.pic?.normal) poster = s.pic.normal;
        else if (s.pic?.large) poster = s.pic.large;

        items.push({
          id: s.id,
          media_type: s.type || bank.type,
          title: s.title,
          overview: s.description || s.info || "", 
          rating: s.rating ? parseFloat(s.rating.value || "0") : 0,
          douban_poster: poster
        });
      }
    } else {
      const subjects = data.subjects || [];
      for (const s of subjects.slice(0, 20)) {
        let poster = "";
        if (typeof s.cover === "string") poster = s.cover;
        else if (s.cover?.url) poster = s.cover.url;
        else if (s.cover_url) poster = s.cover_url;
        else if (s.pic?.normal) poster = s.pic.normal;

        items.push({
          id: s.id,
          media_type: bank.type,
          title: s.title,
          overview: "", 
          rating: parseFloat(s.rate || "0"),
          douban_poster: poster
        });
      }
    }
  } else if (bank.source === "maoyan") {
    const url = 'https://m.maoyan.com/ajax/movieOnInfoList';
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
        "Referer": "https://m.maoyan.com/"
      }
    });
    if (!res.ok) {
      console.error(`猫眼榜单获取失败: ${bank.name}`);
      return [];
    }
    const data: any = await res.json();
    const movieList = data.movieList || [];
    for (const m of movieList.slice(0, 20)) {
      let poster = m.img ? m.img.replace('w.h', '140.200') : '';
      items.push({
        id: m.id,
        media_type: "movie",
        title: m.nm,
        overview: "", 
        rating: m.sc || 0,
        douban_poster: poster,
        maoyan_actors: m.star || '',
        maoyan_rt: m.rt || '',
        maoyan_showInfo: m.showInfo || ''
      });
    }
  }

  return items;
}

// ==========================================
// HTML 网页渲染
// ==========================================

function buildHtml(bankName: string, items: BankItem[]): string {
  let cardsHtml = '';

  items.forEach((item, index) => {
    let rankClass = 'normal-rank';
    if (index === 0) rankClass = 'top1';
    else if (index === 1) rankClass = 'top2';
    else if (index === 2) rankClass = 'top3';

    const title = item.title || item.name || '未知影视';
    const year = item.tmdbDetails?.date && item.tmdbDetails.date !== '未知' ? item.tmdbDetails.date : (item.maoyan_rt || '未知');
    const overviewText = item.overview || item.tmdbDetails?.overview || '';
    const desc = overviewText ? overviewText.substring(0, 100) + '...' : '暂无详细简介';
    const score = item.vote_average || item.rating || 'N/A';
    
    let posterSrc = item.tmdbDetails?.poster;
    if (!posterSrc && item.douban_poster) {
      posterSrc = item.douban_poster; // 依赖 <meta name="referrer" content="no-referrer"> 直接加载
    }
    if (!posterSrc) {
      posterSrc = 'https://placehold.co/140x200/cccccc/ffffff?text=No+Poster';
    }

    const actors = (item.tmdbDetails?.actors && item.tmdbDetails.actors !== '暂无演员信息') ? item.tmdbDetails.actors : (item.maoyan_actors || '暂无演员信息');
    const companies = item.tmdbDetails?.companies || '暂无';

    const maoyanInfo = sanitizeMaoyanShowInfo(item.maoyan_showInfo || '');
    const showInfoHtml = maoyanInfo.display ? `<div style="color:#FF5722; font-size: 14px; font-weight: 600; margin-top: 8px;">🔥 ${maoyanInfo.display}</div>` : '';
    const boxOfficeHtml = maoyanInfo.boxOffice ? `<div style="color:#4CAF50; font-size: 14px; font-weight: 600; margin-top: 4px;">💰 今日票房：${maoyanInfo.boxOffice}</div>` : '';

    cardsHtml += `
      <div class="movie-card">
        <div class="rank-badge ${rankClass}">${index + 1}</div>
        <img class="poster" src="${posterSrc}" alt="${title}" loading="lazy" />
        <div class="info-area">
          <h2 class="title">${title}</h2>
          <div class="meta-tags">${year} / ${companies}</div>
          <div class="description">${desc}</div>
          <div class="cast">👥 ${actors}</div>
          ${showInfoHtml}
          ${boxOfficeHtml}
        </div>
        <div class="rating-area">
          <div class="rating-label">综合评分</div>
          <div class="score">${typeof score === 'number' ? score.toFixed(1) : score}</div>
        </div>
      </div>
    `;
  });

  const topItem = items[0];
  let ogImage = 'https://placehold.co/1200x630/cccccc/ffffff?text=RMBD';
  if (topItem) {
    if (topItem.tmdbDetails?.poster) {
      ogImage = topItem.tmdbDetails.poster;
    } else if (topItem.douban_poster) {
      ogImage = `https://wsrv.nl/?url=${encodeURIComponent(topItem.douban_poster)}`;
    }
  }
  const top3Names = items.slice(0, 3).map(i => i.title || i.name).filter(Boolean).join(' / ');
  const ogDesc = `今日 TOP3: ${top3Names}。点击查看完整榜单！`;

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="referrer" content="no-referrer">
  <title>${bankName} - RMBD 每日推荐</title>
  <meta property="og:title" content="${bankName} - RMBD 每日推荐">
  <meta property="og:description" content="${ogDesc}">
  <meta property="og:image" content="${ogImage}">
  <meta property="og:type" content="website">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${bankName} - RMBD 每日推荐">
  <meta name="twitter:description" content="${ogDesc}">
  <meta name="twitter:image" content="${ogImage}">
  <style>
    body { background-color: #F8F3ED; font-family: "PingFang SC", "Microsoft YaHei", sans-serif; padding: 20px; margin: 0; color: #333; }
    .container { max-width: 850px; margin: 0 auto; }
    .header { background: linear-gradient(135deg, #1f1c2c, #928DAB); border-radius: 20px; padding: 40px 20px; margin-bottom: 40px; color: white; text-align: center; box-shadow: 0 10px 30px rgba(0,0,0,0.15); }
    .header h1 { margin: 0; font-size: clamp(32px, 5vw, 52px); font-weight: bold; text-shadow: 2px 2px 4px rgba(0,0,0,0.3); }
    .header p { color: #eee; font-size: 16px; margin-top: 15px; letter-spacing: 1px; opacity: 0.9; }
    .movie-card { display: flex; background: #FFF; border-radius: 16px; padding: 24px; margin-bottom: 28px; box-shadow: 0 8px 24px rgba(0,0,0,0.06); position: relative; border: 1px solid rgba(0,0,0,0.02); transition: transform 0.2s ease; }
    .movie-card:hover { transform: translateY(-3px); box-shadow: 0 12px 32px rgba(0,0,0,0.1); }
    .rank-badge { position: absolute; top: -12px; left: -12px; width: 48px; height: 60px; border-radius: 8px 8px 16px 8px; color: white; font-size: 28px; font-weight: bold; text-align: center; line-height: 54px; box-shadow: 2px 4px 10px rgba(0,0,0,0.2); z-index: 10; }
    .top1 { background: linear-gradient(135deg, #FF416C, #FF4B2B); }
    .top2 { background: linear-gradient(135deg, #F37335, #FDC830); }
    .top3 { background: linear-gradient(135deg, #fceabb, #f8b500); color: #a67c00; }
    .normal-rank { background: #9E9E9E; }
    .poster { width: 140px; height: 200px; border-radius: 8px; object-fit: cover; margin-right: 24px; box-shadow: 0 4px 10px rgba(0,0,0,0.1); background-color: #f5f5f5; flex-shrink: 0; }
    .info-area { flex: 1; display: flex; flex-direction: column; min-width: 0; justify-content: center; }
    .title { font-size: 28px; margin: 0 0 8px 0; color: #222; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .meta-tags { color: #666; font-size: 15px; margin-bottom: 12px; font-weight: 500; }
    .description { color: #555; font-size: 15px; line-height: 1.6; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
    .cast { font-size: 14px; color: #444; margin-top: auto; padding-top: 12px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .rating-area { width: 120px; text-align: center; border-left: 2px dashed #E0E0E0; margin-left: 20px; display: flex; flex-direction: column; justify-content: center; flex-shrink: 0; }
    .rating-label { color: #888; font-size: 14px; margin-bottom: 4px; font-weight: 500; }
    .score { font-size: 48px; font-weight: bold; color: #FF9800; font-family: "Impact", sans-serif; letter-spacing: 1px; }
    
    @media (max-width: 640px) {
      .movie-card { flex-direction: column; padding: 16px; align-items: center; text-align: center; }
      .poster { margin: 10px 0 20px 0; width: 160px; height: 230px; }
      .rating-area { width: 100%; border-left: none; border-top: 2px dashed #E0E0E0; margin-left: 0; margin-top: 16px; padding-top: 16px; flex-direction: row; align-items: center; justify-content: center; gap: 12px; }
      .score { font-size: 36px; }
      .title { white-space: normal; }
      .description { -webkit-line-clamp: 4; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${bankName}</h1>
      <p>每日 TOP 20 推荐 · ${new Date().toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' })}</p>
    </div>
    ${cardsHtml}
    <div style="text-align:center; padding: 20px; color: #888; font-size: 14px;">
      Powered by RMBD Cloudflare Worker
    </div>
  </div>
</body>
</html>`;
}

// ==========================================
// 主流程
// ==========================================

async function sendSummaryToTelegram(env: Env, baseUrl: string): Promise<void> {
  const tgUrl = `https://api.telegram.org/bot${env.TG_BOT_TOKEN}/sendMessage`;
  const now = new Date().toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' });
  
  // 1. 发送开场白
  const introText = `🎬 <b>RMBD 每日影视榜单已更新</b> (${now})\n\n正在为您推送 ${TARGET_BANKS.length} 个精选榜单...`;
  try {
    await fetch(tgUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: env.TG_CHAT_ID, text: introText, parse_mode: "HTML", disable_web_page_preview: true })
    });
  } catch (err) {
    console.error("发送 TG 开场白异常:", err);
  }

  // 2. 依次发送每个榜单，允许预览
  for (let index = 0; index < TARGET_BANKS.length; index++) {
    const bank = TARGET_BANKS[index];
    const targetUrl = `${baseUrl}/view/${bank.id}?t=${Date.now()}`;
    const text = `👉 <b><a href="${targetUrl}">${bank.name}</a></b>`;
    
    try {
      const res = await fetch(tgUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: env.TG_CHAT_ID,
          text: text,
          parse_mode: "HTML",
          link_preview_options: {
            is_disabled: false,
            url: targetUrl
          }
        })
      });
      if (!res.ok) console.error(`TG 推送失败: ${bank.name}`, await res.text());
    } catch (err) {
      console.error(`请求 TG API 异常: ${bank.name}`, err);
    }
    
    // 增加限流延迟，给 Telegram 爬虫足够的时间抓取网页，防止丢弃预览
    await new Promise(r => setTimeout(r, 1000));
  }
}

// ==========================================
// 企业微信 Webhook 推送
// ==========================================

async function sendSummaryToWecom(env: Env, baseUrl: string): Promise<void> {
  if (!env.WECOM_WEBHOOK_URL) {
    console.log("未配置 WECOM_WEBHOOK_URL，跳过企业微信推送");
    return;
  }

  const now = new Date().toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' });

  // 1. 发送开场消息
  const introContent = `## 🎬 RMBD 每日影视榜单已更新 (${now})\n正在为您推送 **${TARGET_BANKS.length}** 个精选榜单，请查收 👇`;
  try {
    await fetch(env.WECOM_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ msgtype: "markdown", markdown: { content: introContent } })
    });
  } catch (err) {
    console.error("发送企业微信开场消息异常:", err);
  }

  // 2. 依次发送每个榜单
  for (const bank of TARGET_BANKS) {
    const targetUrl = `${baseUrl}/view/${bank.id}?t=${Date.now()}`;
    const content = `**${bank.name}**\n> [📋 查看完整榜单](${targetUrl})`;
    try {
      const res = await fetch(env.WECOM_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ msgtype: "markdown", markdown: { content } })
      });
      if (!res.ok) console.error(`企业微信推送失败: ${bank.name}`, await res.text());
    } catch (err) {
      console.error(`企业微信推送异常: ${bank.name}`, err);
    }
    // 企业微信限流：20条/分钟，间隔 3s 保险
    await new Promise(r => setTimeout(r, 3000));
  }
}

async function runBotTask(env: Env, requestUrl: string): Promise<void> {
  console.log("启动定时汇总任务...");

  if (!env.TMDB_API_KEY || !env.TG_BOT_TOKEN) {
    console.error("环境变量配置不完整，请配置 TMDB, TG 变量。");
    return;
  }

  const urlObj = new URL(requestUrl);
  const baseUrl = `${urlObj.protocol}//${urlObj.host}`;

  // 并发推送 Telegram 和企业微信
  await Promise.all([
    sendSummaryToTelegram(env, baseUrl),
    sendSummaryToWecom(env, baseUrl)
  ]);
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
    { key: "TG_BOT_TOKEN", label: "TG Bot Token" },
    { key: "TG_CHAT_ID", label: "TG Chat ID" },
    { key: "WECOM_WEBHOOK_URL", label: "WeCom Webhook URL" },
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

async function checkWecom(env: Env): Promise<CheckResult> {
  if (!env.WECOM_WEBHOOK_URL) return { name: "企业微信 Webhook", icon: "💼", ok: false, detail: "未配置", latency: 0 };
  const start = Date.now();
  try {
    // 发送一个空 body 触发格式错误响应，只要 HTTP 通则 URL 可达
    const res = await fetch(env.WECOM_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ msgtype: "text", text: { content: "" } })
    });
    const json: any = await res.json();
    // errcode=0 表示成功；其他 errcode 说明 URL 可达但参数有误
    if (json.errcode === 0) {
      return { name: "企业微信 Webhook", icon: "💼", ok: true, detail: "连接正常", latency: Date.now() - start };
    }
    // content 为空时企业微信返回 errcode=93000，URL 依然可达
    if (res.ok) {
      return { name: "企业微信 Webhook", icon: "💼", ok: true, detail: `URL 可达 (errcode=${json.errcode})`, latency: Date.now() - start };
    }
    return { name: "企业微信 Webhook", icon: "💼", ok: false, detail: `HTTP ${res.status}`, latency: Date.now() - start };
  } catch (e: any) {
    return { name: "企业微信 Webhook", icon: "💼", ok: false, detail: `连接失败: ${e.message}`, latency: Date.now() - start };
  }
}

function buildStatusHtml(results: CheckResult[]): string {
  const passCount = results.filter(r => r.ok).length;
  const totalCount = results.length;
  const allPass = passCount === totalCount;

  const cards = results.map(r => `
    <div class="card">
      <div class="card-left">
        <span class="card-icon">${r.icon}</span>
        <div>
          <div class="card-name">${r.name}</div>
          <div class="card-detail">${r.detail}</div>
        </div>
      </div>
      <div class="card-right">
        ${r.latency > 0 ? `<span class="latency">${r.latency}ms</span>` : ''}
        <span class="dot ${r.ok ? 'dot-ok' : 'dot-err'}"></span>
      </div>
    </div>`).join('');

  const badgeColor = allPass ? '#34d399' : '#f87171';
  const badgeBg = allPass ? 'rgba(52,211,153,0.12)' : 'rgba(248,113,113,0.12)';
  const badgeBorder = allPass ? 'rgba(52,211,153,0.3)' : 'rgba(248,113,113,0.3)';

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>RMBD 控制台</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:"PingFang SC","Microsoft YaHei",system-ui,sans-serif;background:#070a14;color:#e2e8f0;min-height:100vh;padding:32px 16px}
.wrap{max-width:660px;margin:0 auto}
.header{text-align:center;margin-bottom:36px}
.header h1{font-size:clamp(22px,5vw,34px);font-weight:800;background:linear-gradient(135deg,#a78bfa,#60a5fa,#34d399);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.header p{color:#64748b;font-size:14px;margin-top:8px}
.badge{display:inline-flex;align-items:center;gap:6px;background:${badgeBg};border:1px solid ${badgeBorder};color:${badgeColor};border-radius:999px;padding:4px 14px;font-size:13px;font-weight:600;margin-top:12px}
.badge-dot{width:7px;height:7px;border-radius:50%;background:currentColor;animation:pulse 1.5s infinite}
.section-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#334155;margin-bottom:10px;padding-left:2px}
.cards{display:flex;flex-direction:column;gap:8px;margin-bottom:28px}
.card{display:flex;align-items:center;justify-content:space-between;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07);border-radius:14px;padding:14px 18px;transition:background .2s}
.card:hover{background:rgba(255,255,255,0.07)}
.card-left{display:flex;align-items:center;gap:12px}
.card-icon{font-size:20px;width:28px;text-align:center}
.card-name{font-weight:600;font-size:14px;color:#cbd5e1}
.card-detail{font-size:12px;color:#475569;margin-top:2px}
.card-right{display:flex;align-items:center;gap:10px}
.latency{font-size:12px;color:#334155;font-variant-numeric:tabular-nums}
.dot{width:10px;height:10px;border-radius:50%;flex-shrink:0}
.dot-ok{background:#34d399;box-shadow:0 0 8px rgba(52,211,153,0.6);animation:pulse 2s infinite}
.dot-err{background:#f87171;box-shadow:0 0 8px rgba(248,113,113,0.5)}
.panel{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:20px;padding:24px;margin-bottom:16px}
.panel-title{font-size:14px;font-weight:700;color:#64748b;margin-bottom:18px;display:flex;align-items:center;gap:6px}
.pin-wrap{position:relative;margin-bottom:12px}
.pin-wrap input{width:100%;background:rgba(0,0,0,0.35);border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:13px 16px;color:#e2e8f0;font-size:16px;outline:none;transition:border-color .2s,box-shadow .2s;font-family:monospace;letter-spacing:3px}
.pin-wrap input::placeholder{letter-spacing:0;font-family:inherit;color:#334155;font-size:14px}
.pin-wrap input:focus{border-color:rgba(167,139,250,0.5);box-shadow:0 0 0 3px rgba(167,139,250,0.1)}
.toggle-newpin{font-size:12px;color:#334155;cursor:pointer;margin-bottom:10px;text-align:right;transition:color .2s;user-select:none}
.toggle-newpin:hover{color:#64748b}
.newpin-wrap{display:none;margin-bottom:12px}
.newpin-wrap.show{display:block}
.newpin-wrap input{width:100%;background:rgba(0,0,0,0.35);border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:13px 16px;color:#e2e8f0;font-size:15px;outline:none;font-family:monospace;letter-spacing:2px}
.newpin-wrap input::placeholder{letter-spacing:0;font-family:inherit;color:#334155;font-size:14px}
.btn-row{display:grid;gap:10px;margin-bottom:10px}
.btn-row.grid3{grid-template-columns:1fr 1fr 1fr}
button.btn,a.btn{border:none;border-radius:12px;padding:13px 8px;font-size:13px;font-weight:700;cursor:pointer;transition:all .2s;color:white;display:flex;align-items:center;justify-content:center;gap:5px;text-decoration:none;line-height:1}
button.btn:hover,a.btn:hover{transform:translateY(-2px);filter:brightness(1.15)}
button.btn:active,a.btn:active{transform:scale(0.97)}
.btn-push{background:linear-gradient(135deg,#6d28d9,#2563eb)}
.btn-tg{background:linear-gradient(135deg,#1d4ed8,#0284c7)}
.btn-wecom{background:linear-gradient(135deg,#065f46,#059669)}
.btn-reload{background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1)!important;color:#64748b}
.btn-reload:hover{background:rgba(255,255,255,0.1)}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.45}}
@media(max-width:480px){.btn-row.grid3{grid-template-columns:1fr 1fr}}
</style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <h1>🎬 RMBD 控制台</h1>
    <p>影视榜单推送机器人 · 系统诊断与控制</p>
    <div class="badge"><span class="badge-dot"></span>${passCount} / ${totalCount} 服务正常</div>
  </div>

  <div class="section-label">服务状态</div>
  <div class="cards">${cards}</div>

  <div class="section-label">操作中心</div>
  <div class="panel">
    <div class="panel-title">🔐 PIN 验证</div>
    <div class="pin-wrap">
      <input id="pinVal" type="password" placeholder="输入 PIN 码以执行操作" autocomplete="off" />
    </div>
    <div class="toggle-newpin" onclick="document.getElementById('npw').classList.toggle('show');this.textContent=document.getElementById('npw').classList.contains('show')?'− 取消修改 PIN':'＋ 同时修改 PIN 码'">＋ 同时修改 PIN 码</div>
    <div class="newpin-wrap" id="npw">
      <input id="npVal" type="password" placeholder="新 PIN 码（留空则不修改）" autocomplete="off" />
    </div>

    <div class="btn-row" style="grid-template-columns:1fr;margin-bottom:10px">
      <button class="btn btn-push" onclick="doPush()">🚀 推送全部 ${TARGET_BANKS.length} 个榜单</button>
    </div>
    <div class="btn-row grid3">
      <button class="btn btn-tg"     onclick="doTest('/test-tg')">📨 TG 测试</button>
      <button class="btn btn-wecom"  onclick="doTest('/test-wecom')">💼 企微测试</button>
      <a     class="btn btn-reload"  href="/status">🔄 重新检测</a>
    </div>
  </div>
</div>
<script>
function pin(){const v=document.getElementById('pinVal').value.trim();if(!v){document.getElementById('pinVal').style.borderColor='rgba(248,113,113,0.6)';setTimeout(()=>document.getElementById('pinVal').style.borderColor='',1500);return null;}return v;}
function doPush(){const p=pin();if(!p)return;const np=document.getElementById('npVal')?.value.trim()||'';const f=document.createElement('form');f.method='POST';f.action='/run';const a=document.createElement('input');a.name='pin';a.value=p;f.appendChild(a);if(np){const b=document.createElement('input');b.name='new_pin';b.value=np;f.appendChild(b);}document.body.appendChild(f);f.submit();}
function doTest(path){const p=pin();if(!p)return;location.href=path+'?pin='+encodeURIComponent(p);}
</script>
</body>
</html>`;
}

function buildRunResultHtml(message: string, success = true): string {
  const color = success ? '#34d399' : '#f87171';
  const glow  = success ? 'rgba(52,211,153,0.35)' : 'rgba(248,113,113,0.35)';
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta http-equiv="refresh" content="3;url=/status">
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:"PingFang SC",system-ui,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#070a14;color:#e2e8f0}.box{text-align:center;padding:40px 32px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:24px;max-width:360px;width:90%}.ico{font-size:54px;margin-bottom:16px;filter:drop-shadow(0 0 18px ${glow})}.ttl{font-size:20px;font-weight:700;color:${color};margin-bottom:8px}.sub{color:#475569;font-size:14px}.bar{height:3px;border-radius:2px;margin-top:20px;background:linear-gradient(90deg,${color},transparent);animation:sh 3s linear forwards}@keyframes sh{from{width:100%}to{width:0}}</style>
</head><body><div class="box"><div class="ico">${success ? '✅' : '❌'}</div><div class="ttl">${message}</div><div class="sub">3 秒后返回控制台...</div><div class="bar"></div></div></body></html>`;
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

// 发送企业微信测试消息
async function sendTestWecomMessage(env: Env): Promise<{ ok: boolean; detail: string }> {
  if (!env.WECOM_WEBHOOK_URL) return { ok: false, detail: "未配置 WECOM_WEBHOOK_URL" };
  try {
    const res = await fetch(env.WECOM_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        msgtype: "markdown",
        markdown: { content: `## ✅ RMBD 企业微信测试成功\n> 💼 消息推送通道畅通！` }
      })
    });
    const json: any = await res.json();
    return json.errcode === 0 ? { ok: true, detail: "发送成功" } : { ok: false, detail: `errcode=${json.errcode}: ${json.errmsg}` };
  } catch (e: any) { return { ok: false, detail: e.message }; }
}

// ==========================================
// Worker 导出
// ==========================================
export default {
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    // 默认提供一个伪造的基础 URL 供定时任务使用
    ctx.waitUntil(runBotTask(env, "https://rmbd.workers.dev"));
  },
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // 路由：动态渲染指定榜单的网页
    if (request.method === "GET" && url.pathname.startsWith("/view/")) {
      const parts = url.pathname.split("/");
      const bankId = parts[2];
      
      const bank = TARGET_BANKS.find(b => b.id === bankId);
      
      if (!bank) {
        return new Response("❌ 找不到对应的榜单", { status: 404, headers: { "Content-Type": "text/plain;charset=UTF-8" } });
      }
      
      try {
        // 1. 抓取该榜单的 20 条数据
        const items = await fetchBankData(bank, env);
        if (items.length === 0) {
          return new Response("❌ 获取榜单数据为空", { status: 500, headers: { "Content-Type": "text/plain;charset=UTF-8" } });
        }

        // 2. 并发请求 TMDB 补全详情
        const hydratedItems = await Promise.all(items.map(async (item) => {
          let tmdbId = item.tmdb_id;
          const itemType = item.media_type || bank.type || "movie";

          if (!tmdbId && item.title) {
            const cleanedTitle = cleanTitle(item.title);
            tmdbId = (await searchTmdbByTitle(cleanedTitle, itemType, env.TMDB_API_KEY)) || undefined;
          }

          if (tmdbId) {
            const tmdbDetails = await fetchTmdbDetails(tmdbId, itemType, env.TMDB_API_KEY);
            return { ...item, tmdbDetails };
          } else {
            return { ...item, tmdbDetails: { actors: "暂无", companies: "暂无", date: "未知", poster: "" } };
          }
        }));

        // 3. 构建网页并返回
        const htmlContent = buildHtml(bank.name, hydratedItems);
        return new Response(htmlContent, { headers: { "Content-Type": "text/html;charset=UTF-8" } });

      } catch (e: any) {
        return new Response(`❌ 渲染网页发生异常: ${e.message}`, { status: 500, headers: { "Content-Type": "text/plain;charset=UTF-8" } });
      }
    }

    // 路由：系统诊断页面
    if (request.method === "GET" && url.pathname === "/status") {
      const results = await Promise.all([
        Promise.resolve(checkEnvVars(env)), checkTelegram(env), checkTelegramChat(env), checkTmdb(env), checkDouban(), checkWecom(env)
      ]);
      return new Response(buildStatusHtml(results), { headers: { "Content-Type": "text/html;charset=UTF-8" } });
    }

    // 路由：发送 TG 测试消息（需要 ?pin=xxx 验证）
    if (request.method === "GET" && url.pathname === "/test-tg") {
      const pin = url.searchParams.get("pin") || "";
      if (!pin || pin !== MANUAL_PUSH_PIN) {
        return new Response(buildRunResultHtml("PIN 错误，拒绝访问", false), { status: 403, headers: { "Content-Type": "text/html;charset=UTF-8" } });
      }
      const result = await sendTestTelegramMessage(env);
      return new Response(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta http-equiv="refresh" content="3;url=/status">
        <style>body{font-family:system-ui;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#0f1117;color:#e1e4e8;margin:0;}</style></head>
        <body><div style="text-align:center"><h2>${result.ok ? '✅' : '❌'} ${result.detail}</h2><p>3 秒后返回...</p></div></body></html>`,
        { headers: { "Content-Type": "text/html;charset=UTF-8" } });
    }

    // 路由：发送企业微信测试消息（需要 ?pin=xxx 验证）
    if (request.method === "GET" && url.pathname === "/test-wecom") {
      const pin = url.searchParams.get("pin") || "";
      if (!pin || pin !== MANUAL_PUSH_PIN) {
        return new Response(buildRunResultHtml("PIN 错误，拒绝访问", false), { status: 403, headers: { "Content-Type": "text/html;charset=UTF-8" } });
      }
      const result = await sendTestWecomMessage(env);
      return new Response(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta http-equiv="refresh" content="3;url=/status">
        <style>body{font-family:system-ui;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#0f1117;color:#e1e4e8;margin:0;}</style></head>
        <body><div style="text-align:center"><h2>${result.ok ? '✅' : '❌'} ${result.detail}</h2><p>3 秒后返回...</p></div></body></html>`,
        { headers: { "Content-Type": "text/html;charset=UTF-8" } });
    }

    // 路由：手动触发推送任务
    if (url.pathname === "/run") {
      if (request.method === "GET") {
        return Response.redirect(new URL("/status", request.url).toString(), 302);
      }

      if (request.method === "POST") {
        const formData = await request.formData();
        const pin = (formData.get("pin") || "").toString().trim();
        const newPin = (formData.get("new_pin") || "").toString().trim();

        if (!pin) {
          return new Response(buildRunResultHtml("请输入 PIN", false), { headers: { "Content-Type": "text/html;charset=UTF-8" } });
        }

        if (pin !== MANUAL_PUSH_PIN) {
          return new Response(buildRunResultHtml("PIN 错误，无法触发推送", false), { headers: { "Content-Type": "text/html;charset=UTF-8" } });
        }

        if (newPin) {
          MANUAL_PUSH_PIN = newPin;
        }

        const message = newPin ? `🚀 推送已触发；PIN 已更新为 ${newPin}` : "🚀 推送已触发";
        ctx.waitUntil(runBotTask(env, request.url).catch(console.error));
        return new Response(buildRunResultHtml(message, true), { headers: { "Content-Type": "text/html;charset=UTF-8" } });
      }
    }

    return Response.redirect(new URL("/status", request.url).toString(), 302);
  }
} satisfies ExportedHandler<Env>;
