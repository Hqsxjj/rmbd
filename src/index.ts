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
  { id: "douban_movie_hot", name: "🔥 豆瓣热门电影", source: "douban", type: "movie", collection_id: "movie_hot_gaia" },
  { id: "douban_movie_latest", name: "🆕 豆瓣最新电影", source: "douban", type: "movie", collection_id: "movie_latest" },
  { id: "maoyan_movie_hot", name: "🐱 猫眼热映电影", source: "maoyan", type: "movie" },
  { id: "douban_tv_hot", name: "📡 豆瓣热门剧集", source: "douban", type: "tv", collection_id: "tv_hot" },
  { id: "douban_tv_latest", name: "✨ 豆瓣最新剧集", source: "douban", type: "tv", collection_id: "tv_domestic" },
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
  HCTI_API_ID?: string;
  HCTI_API_KEY?: string;
  PIN?: string;
}

interface TmdbDetails {
  actors: string;
  companies: string;
  date: string;
  poster: string;
  overview?: string;
  genres?: string;
  countries?: string;
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
  douban_actors?: string;
  douban_meta?: string;
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
    .replace(/特别篇/g, '') // 去除特别篇
    .replace(/\s+/g, ' ') // 合并连续空格
    .trim();
}

// 通过标题搜索 TMDB 获取 ID 并进行年份/标题相似度/流行度多维评分匹配
async function searchTmdbByTitle(title: string, type: string, apiKey: string, year?: string | null): Promise<{ id: number; media_type: "movie" | "tv" } | null> {
  if (!title || !apiKey) return null;
  const searchType = type === "mixed" ? "multi" : type;
  try {
    let url = `https://api.themoviedb.org/3/search/${searchType}?api_key=${apiKey}&query=${encodeURIComponent(title)}&language=zh-CN&page=1`;
    if (year) {
      if (searchType === "movie") {
        url += `&primary_release_year=${year}`;
      } else if (searchType === "tv") {
        url += `&first_air_date_year=${year}`;
      }
    }
    const res = await fetch(url, {
      cf: { cacheTtl: 86400, cacheEverything: true }
    } as any);
    if (!res.ok) return null;
    const json: any = await res.json();
    if (json.results && json.results.length > 0) {
      // 评分系统选择最佳匹配
      let bestResult = json.results[0];
      let maxScore = -1;

      for (const result of json.results) {
        let score = 0;
        
        // 标题匹配
        const rTitle = result.title || result.name || "";
        const rOriginalTitle = result.original_title || result.original_name || "";
        const cleanSearch = title.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]/g, "");
        const cleanRTitle = rTitle.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]/g, "");
        const cleanROrig = rOriginalTitle.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]/g, "");

        if (cleanSearch && (cleanRTitle.includes(cleanSearch) || cleanSearch.includes(cleanRTitle))) {
          score += 10;
          if (cleanRTitle === cleanSearch) {
            score += 10; // 精确匹配
          }
        }
        if (cleanSearch && (cleanROrig.includes(cleanSearch) || cleanSearch.includes(cleanROrig))) {
          score += 5;
        }

        // 年份匹配
        if (year) {
          const yearNum = parseInt(year);
          const rDate = result.release_date || result.first_air_date || "";
          const rYearMatch = rDate.match(/\b(19\d{2}|20\d{2})\b/);
          if (rYearMatch) {
            const rYear = parseInt(rYearMatch[1]);
            if (rYear === yearNum) {
              score += 15; // 年份完全相同
            } else if (Math.abs(rYear - yearNum) === 1) {
              score += 8; // 相差一年
            } else {
              score -= 5; // 年份相差较大
            }
          }
        }

        // 流行度加成
        if (result.popularity) {
          score += Math.min(result.popularity / 50, 5); 
        }

        if (score > maxScore) {
          maxScore = score;
          bestResult = result;
        }
      }

      const media_type = bestResult.media_type === "tv" ? "tv" : "movie";
      return { id: bestResult.id, media_type };
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
    const url = `https://api.themoviedb.org/3/${type}/${tmdbId}?api_key=${apiKey}&append_to_response=credits&language=zh-CN`;
    const res = await fetch(url, {
      cf: { cacheTtl: 86400, cacheEverything: true }
    } as any);
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

    if (json.genres) {
      result.genres = json.genres.map((g: any) => g.name).join(" / ");
    }

    if (json.production_countries) {
      result.countries = json.production_countries.map((c: any) => c.name).join(" / ");
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
    const res = await fetch(url, {
      cf: { cacheTtl: 3600, cacheEverything: true }
    } as any);
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
      url = `https://m.douban.com/rexxar/api/v2/subject_collection/${bank.collection_id}/items?start=0&count=20&for_mobile=1`;
    } else if (bank.tag) {
      const sortParam = bank.sort || "recommend";
      url = `https://movie.douban.com/j/search_subjects?type=${bank.type}&tag=${encodeURIComponent(bank.tag)}&sort=${sortParam}&page_limit=20&page_start=0`;
    }

    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
        "Referer": "https://m.douban.com/subject_collection/" + (bank.collection_id || "")
      },
      cf: { cacheTtl: 3600, cacheEverything: true }
    } as any);
    
    if (!res.ok) {
      console.error(`豆瓣榜单获取失败: ${bank.name}`);
      return [];
    }
    const data: any = await res.json();

    if (bank.collection_id) {
      const subjects = data.subject_collection_items || [];
      for (const s of subjects.slice(0, 20)) {
        const target = s.target;
        let poster = "";
        
        // 兼容外层直接定义或内层 target 包裹结构，确保海报 100% 正确抓取
        if (typeof s.cover === "string") poster = s.cover;
        else if (s.cover?.url) poster = s.cover.url;
        else if (s.cover_url) poster = s.cover_url;
        else if (s.pic?.normal) poster = s.pic.normal;
        else if (s.pic?.large) poster = s.pic.large;

        if (!poster && target) {
          if (typeof target.cover === "string") poster = target.cover;
          else if (target.cover?.url) poster = target.cover.url;
          else if (target.cover_url) poster = target.cover_url;
          else if (target.pic?.normal) poster = target.pic.normal;
          else if (target.pic?.large) poster = target.pic.large;
        }

        const info = s.info || target?.info || "";
        const parts = info.split(" / ");
        let doubanActors = "";
        let doubanMeta = "";
        if (parts.length >= 4) {
          doubanActors = parts[parts.length - 1].trim().replace(/\s+/g, " / ");
          doubanMeta = parts.slice(0, 3).join(" / ");
        } else if (parts.length === 3) {
          doubanActors = parts[2].trim().replace(/\s+/g, " / ");
          doubanMeta = parts.slice(0, 2).join(" / ");
        } else {
          doubanMeta = info;
        }

        items.push({
          id: s.id || target?.id,
          media_type: s.type || target?.type || bank.type,
          title: s.title || target?.title,
          overview: s.comment || s.description || target?.description || s.info || target?.info || "", 
          rating: s.rating ? parseFloat(s.rating.value || "0") : (target?.rating ? parseFloat(target.rating.value || "0") : 0),
          douban_poster: poster,
          douban_actors: doubanActors,
          douban_meta: doubanMeta
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
      },
      cf: { cacheTtl: 3600, cacheEverything: true }
    } as any);
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

function buildHtml(bankName: string, items: BankItem[], baseUrl: string): string {
  let cardsHtml = '';

  items.forEach((item, index) => {
    let rankClass = 'normal-rank';
    if (index === 0) rankClass = 'top1';
    else if (index === 1) rankClass = 'top2';
    else if (index === 2) rankClass = 'top3';

    const title = item.title || item.name || '未知影视';
    
    // 构造中文的 meta-tags
    let metaText = '';
    const year = item.tmdbDetails?.date && item.tmdbDetails.date !== '未知' ? item.tmdbDetails.date : (item.maoyan_rt ? item.maoyan_rt.split('-')[0] : '未知');
    if (item.douban_meta) {
      metaText = item.douban_meta;
    } else {
      const genres = item.tmdbDetails?.genres || '';
      const countries = item.tmdbDetails?.countries || '';
      metaText = year;
      if (countries) metaText += ` / ${countries}`;
      if (genres) metaText += ` / ${genres}`;
    }

    // 优先使用源平台自带的海报（100% 准确），只有在源平台没有海报时才回退使用 TMDB 模糊匹配的海报，防止匹配到错误图
    let posterSrc = item.douban_poster || item.tmdbDetails?.poster;
    if (posterSrc) {
      if (posterSrc.startsWith("//")) {
        posterSrc = "https:" + posterSrc;
      }
      // 使用我们 Worker 自身的本地图片代理，100% 绕过防盗链并确保极速加载
      posterSrc = `${baseUrl}/imgproxy?url=${encodeURIComponent(posterSrc)}`;
    } else {
      posterSrc = 'https://placehold.co/140x200/cccccc/ffffff?text=No+Poster';
    }

    // 优先使用源平台自带的简介与描述，避免 TMDB 模糊匹配错误时显示不相干的电影介绍
    const overviewText = item.overview || item.tmdbDetails?.overview || '';
    const desc = overviewText ? overviewText.substring(0, 100) + '...' : '暂无详细简介';
    const score = item.vote_average || item.rating || 'N/A';

    // 优先使用中文演员名字
    let actors = '暂无演员信息';
    if (item.maoyan_actors) {
      actors = item.maoyan_actors.replace(/,/g, " / ");
    } else if (item.douban_actors) {
      actors = item.douban_actors;
    } else if (item.tmdbDetails?.actors && item.tmdbDetails.actors !== '暂无演员信息') {
      actors = item.tmdbDetails.actors;
    }

    const maoyanInfo = sanitizeMaoyanShowInfo(item.maoyan_showInfo || '');
    const showInfoHtml = maoyanInfo.display ? `<div style="color:#FF5722; font-size: 14px; font-weight: 600; margin-top: 8px;">🔥 ${maoyanInfo.display}</div>` : '';
    const boxOfficeHtml = maoyanInfo.boxOffice ? `<div style="color:#4CAF50; font-size: 14px; font-weight: 600; margin-top: 4px;">💰 今日票房：${maoyanInfo.boxOffice}</div>` : '';

    cardsHtml += `
      <div class="movie-card">
        <div class="rank-badge ${rankClass}">${index + 1}</div>
        <img class="poster" src="${posterSrc}" alt="${title}" loading="lazy" />
        <div class="info-area">
          <h2 class="title">${title}</h2>
          <div class="meta-tags">${metaText}</div>
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
    let topPoster = topItem.tmdbDetails?.poster || topItem.douban_poster;
    if (topPoster) {
      if (topPoster.startsWith("//")) {
        topPoster = "https:" + topPoster;
      }
      ogImage = `${baseUrl}/imgproxy?url=${encodeURIComponent(topPoster)}`;
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

// 从榜单获取并渲染完整的 HTML
async function getBankHtml(bank: TargetBank, env: Env, baseUrl: string): Promise<string> {
  const items = await fetchBankData(bank, env);
  if (items.length === 0) {
    throw new Error("获取榜单数据为空");
  }

  const hydratedItems = await Promise.all(items.map(async (item) => {
    let tmdbId = item.tmdb_id;
    let itemType = item.media_type || bank.type || "movie";

    // 提取年份，用于 TMDB 关联的二次校验
    let year: string | null = null;
    if (item.douban_meta) {
      const ym = item.douban_meta.match(/\b(19\d{2}|20\d{2})\b/);
      if (ym) year = ym[1];
    }
    if (!year && item.maoyan_rt) {
      const ym = item.maoyan_rt.match(/\b(19\d{2}|20\d{2})\b/);
      if (ym) year = ym[1];
    }

    if (!tmdbId && item.title) {
      const cleanedTitle = cleanTitle(item.title);
      const searchResult = await searchTmdbByTitle(cleanedTitle, itemType, env.TMDB_API_KEY, year);
      if (searchResult) {
        tmdbId = searchResult.id;
        itemType = searchResult.media_type;
      }
    }

    if (itemType === "mixed") {
      itemType = "movie";
    }

    if (tmdbId) {
      const tmdbDetails = await fetchTmdbDetails(tmdbId, itemType, env.TMDB_API_KEY);
      return { ...item, media_type: itemType, tmdbDetails };
    } else {
      return { ...item, media_type: itemType, tmdbDetails: { actors: "暂无", companies: "暂无", date: "未知", poster: "" } };
    }
  }));

  return buildHtml(bank.name, hydratedItems, baseUrl);
}

interface RenderResult {
  url: string | null;
  error?: string;
}

// 调用 HtmlCssToImage API 渲染 HTML 为图片 URL
async function renderHtmlToImage(htmlContent: string, apiId: string, apiKey: string, selector?: string): Promise<RenderResult> {
  try {
    const url = "https://hcti.io/v1/image";
    const auth = btoa(`${apiId}:${apiKey}`);
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Basic ${auth}`
      },
      body: JSON.stringify({
        html: htmlContent,
        selector: selector,
        format: "jpeg"
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`HCTI API 错误: ${response.status}`, errText);
      return { url: null, error: `HTTP ${response.status}: ${errText}` };
    }

    const data: any = await response.json();
    return { url: data.url || null, error: data.url ? undefined : "API 返回没有图片 URL 字段" };
  } catch (err: any) {
    console.error("调用 HCTI API 异常:", err);
    return { url: null, error: `异常: ${err.message}` };
  }
}

// 下载图片，计算 MD5 和 Base64，并发送到企业微信 Webhook
async function processAndSendImage(env: Env, imageUrl: string): Promise<boolean> {
  try {
    const res = await fetch(imageUrl);
    if (!res.ok) {
      console.error(`下载 HCTI 渲染图片失败: ${res.status}`);
      return false;
    }

    const arrayBuffer = await res.arrayBuffer();
    const sizeInBytes = arrayBuffer.byteLength;
    const sizeInMB = sizeInBytes / (1024 * 1024);
    console.log(`已成功下载 HCTI 渲染图片，大小为: ${sizeInMB.toFixed(3)} MB`);
    if (sizeInBytes > 2 * 1024 * 1024) {
      console.error(`⚠️ 警告: 下载的图片大小为 ${sizeInMB.toFixed(3)} MB，已超过企业微信 Webhook 的 2MB 限制，可能导致发送失败！`);
    }

    // 1. 计算 raw binary 数据的 MD5
    const md5Buffer = await crypto.subtle.digest("MD5", arrayBuffer);
    const md5Hex = Array.from(new Uint8Array(md5Buffer))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");

    // 2. 使用 nodejs_compat Buffer 编码为 Base64
    const base64Data = Buffer.from(arrayBuffer).toString("base64");

    // 3. 发送给企业微信
    const wecomRes = await fetch(env.WECOM_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        msgtype: "image",
        image: {
          base64: base64Data,
          md5: md5Hex
        }
      })
    });

    if (!wecomRes.ok) {
      console.error("企微发送图片消息失败:", await wecomRes.text());
      return false;
    }

    const wecomJson: any = await wecomRes.json();
    if (wecomJson.errcode !== 0) {
      console.error(`企微发送图片消息 API 错误: errcode=${wecomJson.errcode}, errmsg=${wecomJson.errmsg}`);
      return false;
    }

    return true;
  } catch (err) {
    console.error("下载/处理并发送企微图片发生异常:", err);
    return false;
  }
}

// ==========================================
// 主流程
// ==========================================

async function sendSummaryToTelegram(env: Env, baseUrl: string): Promise<void> {
  const tgUrl = `https://api.telegram.org/bot${env.TG_BOT_TOKEN}/sendMessage`;
  const now = new Date().toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' });
  const activePin = env.PIN || MANUAL_PUSH_PIN;
  
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
    const targetUrl = `${baseUrl}/view/${bank.id}?pin=${encodeURIComponent(activePin)}&t=${Date.now()}`;
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
  const activePin = env.PIN || MANUAL_PUSH_PIN;

  // 1. 并发获取所有榜单的数据
  console.log("开始并发获取企微推送榜单数据...");
  const bankDataList = await Promise.all(
    TARGET_BANKS.map(async (bank) => {
      try {
        const items = await fetchBankData(bank, env);
        return { bank, items, success: true };
      } catch (e) {
        console.error(`获取榜单 ${bank.name} 数据失败:`, e);
        return { bank, items: [], success: false };
      }
    })
  );

  // 2. 将 15 个榜单分批组合发送，防止单条消息超过企业微信 4096 字符限制
  // 建议分为 2 批发送，第一批 8 个，第二批 7 个，这样排版极度优雅且绝对不会超限
  const BATCH_SIZE = 8;
  const batches = [];
  for (let i = 0; i < bankDataList.length; i += BATCH_SIZE) {
    batches.push(bankDataList.slice(i, i + BATCH_SIZE));
  }

  // 发送每一批
  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const batch = batches[batchIdx];
    let content = `## 🎬 RMBD 每日影视榜单 (${batchIdx + 1}/${batches.length}) · ${now}\n`;
    if (batchIdx === 0) {
      content += `> 今日精选 **${TARGET_BANKS.length}** 个影视榜单已全部更新！点击链接可直接查看完整网页版（含海报、演员及详细简介）👇\n\n`;
    } else {
      content += `\n`;
    }

    for (const { bank, items, success } of batch) {
      const targetUrl = `${baseUrl}/view/${bank.id}?pin=${encodeURIComponent(activePin)}&t=${Date.now()}`;
      let top3Text = "";

      if (success && items.length > 0) {
        const top3 = items.slice(0, 3);
        const top3Parts = top3.map((item, i) => {
          const title = item.title || item.name || "未知";
          const score = item.vote_average || item.rating || 0;
          const scoreText = score > 0 ? ` (${score.toFixed(1)}分)` : "";
          return `**${title}**${scoreText}`;
        });
        top3Text = `> TOP 3: ${top3Parts.join("  |  ")}`;
      } else {
        top3Text = `> ⚠️ 榜单数据暂不可用`;
      }

      content += `### [📊 ${bank.name}](${targetUrl})\n${top3Text}\n\n`;
    }

    try {
      const res = await fetch(env.WECOM_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ msgtype: "markdown", markdown: { content: content.trim() } })
      });
      if (!res.ok) {
        console.error(`企业微信发送批次 ${batchIdx + 1} 失败:`, await res.text());
      }
    } catch (err) {
      console.error(`企业微信发送批次 ${batchIdx + 1} 异常:`, err);
    }

    // 批次发送间隔 1s，防限流且无需长久等待
    if (batchIdx < batches.length - 1) {
      await new Promise(r => setTimeout(r, 1000));
    }
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
    const res = await fetch("https://m.douban.com/rexxar/api/v2/subject_collection/movie_weekly_best/items?start=0&count=1&for_mobile=1", {
      headers: {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
        "Referer": "https://m.douban.com/subject_collection/movie_weekly_best"
      }
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

function buildStatusHtml(results: CheckResult[], activePin: string): string {
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
.section-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#475569;margin-bottom:10px;padding-left:2px}
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
.panel{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:20px;padding:24px;margin-bottom:24px}
.pin-input-wrap{position:relative;margin-bottom:12px}
.pin-input-wrap input{width:100%;background:rgba(0,0,0,0.35);border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:13px 16px;color:#e2e8f0;font-size:16px;outline:none;transition:border-color .2s,box-shadow .2s;font-family:monospace;letter-spacing:3px;text-align:center}
.pin-input-wrap input::placeholder{letter-spacing:0;font-family:inherit;color:#334155;font-size:14px}
.pin-input-wrap input:focus{border-color:rgba(167,139,250,0.5);box-shadow:0 0 0 3px rgba(167,139,250,0.1)}
.btn-row{display:grid;gap:10px;margin-bottom:10px}
.btn-row.grid3{grid-template-columns:1fr 1fr 1fr}
button.btn,a.btn{border:none;border-radius:12px;padding:13px 8px;font-size:13px;font-weight:700;cursor:pointer;transition:all .2s;color:white;display:flex;align-items:center;justify-content:center;gap:5px;text-decoration:none;line-height:1}
button.btn:hover,a.btn:hover{transform:translateY(-2px);filter:brightness(1.15)}
button.btn:active,a.btn:active{transform:scale(0.97)}
.btn-push{background:linear-gradient(135deg,#6d28d9,#2563eb)}
.btn-tg{background:linear-gradient(135deg,#1d4ed8,#0284c7)}
.btn-wecom{background:linear-gradient(135deg,#065f46,#059669)}
.btn-save-pin{background:linear-gradient(135deg,#f59e0b,#d97706)}
.btn-reload{background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1)!important;color:#cbd5e1}
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
    <div class="btn-row" style="grid-template-columns:1fr;margin-bottom:10px">
      <button class="btn btn-push" onclick="doPush()">🚀 推送全部 ${TARGET_BANKS.length} 个榜单</button>
    </div>
    <div class="btn-row grid3">
      <button class="btn btn-tg"     onclick="doTest('/test-tg')">📨 TG 测试</button>
      <button class="btn btn-wecom"  onclick="doTest('/test-wecom')">💼 企微测试</button>
      <a     class="btn btn-reload"  href="/status">🔄 重新检测</a>
    </div>
  </div>

  <div class="section-label">修改安全 PIN 码</div>
  <div class="panel">
    <div class="pin-input-wrap">
      <input id="npVal" type="password" placeholder="输入新的 4 位安全 PIN 码" autocomplete="off" />
    </div>
    <div class="btn-row" style="grid-template-columns:1fr;">
      <button class="btn btn-save-pin" onclick="doChangePin()">💾 保存修改</button>
    </div>
  </div>
</div>
<script>
function doPush(){
  const f=document.createElement('form');
  f.method='POST';
  f.action='/run';
  document.body.appendChild(f);
  f.submit();
}
function doChangePin(){
  const np=document.getElementById('npVal').value.trim();
  if(!np){
    document.getElementById('npVal').style.borderColor='rgba(248,113,113,0.6)';
    setTimeout(()=>document.getElementById('npVal').style.borderColor='',1500);
    return;
  }
  const f=document.createElement('form');
  f.method='POST';
  f.action='/run';
  const b=document.createElement('input');
  b.name='new_pin';
  b.value=np;
  f.appendChild(b);
  const c=document.createElement('input');
  c.name='change_pin_only';
  c.value='true';
  f.appendChild(c);
  document.body.appendChild(f);
  f.submit();
}
function doTest(path){
  location.href=path;
}
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

async function sendTestWecomMessage(env: Env): Promise<{ ok: boolean; detail: string }> {
  if (!env.WECOM_WEBHOOK_URL) return { ok: false, detail: "未配置 WECOM_WEBHOOK_URL" };
  try {
    const res = await fetch(env.WECOM_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        msgtype: "markdown",
        markdown: { content: `## ✅ RMBD 企业微信测试成功\n> 💼 消息推送通道畅通！网页版预览链接已全部打通。` }
      })
    });
    const json: any = await res.json();
    return json.errcode === 0 ? { ok: true, detail: "测试消息发送成功" } : { ok: false, detail: `errcode=${json.errcode}: ${json.errmsg}` };
  } catch (e: any) { return { ok: false, detail: e.message }; }
}

function buildLockScreenHtml(errorMsg: string = ""): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>安全验证 - RMBD</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: "PingFang SC", "Microsoft YaHei", sans-serif;
    background: #070a14;
    color: #e2e8f0;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    overflow: hidden;
  }
  .bg-glow {
    position: absolute;
    width: 600px;
    height: 600px;
    background: radial-gradient(circle, rgba(139, 92, 246, 0.15) 0%, rgba(0, 0, 0, 0) 70%);
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 1;
    pointer-events: none;
  }
  .card {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border-radius: 24px;
    width: 100%;
    max-width: 400px;
    padding: 40px 30px;
    text-align: center;
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
    z-index: 10;
    animation: fadeIn 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .icon-wrapper {
    width: 72px;
    height: 72px;
    background: rgba(139, 92, 246, 0.1);
    border: 1px solid rgba(139, 92, 246, 0.2);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 24px;
    box-shadow: 0 0 20px rgba(139, 92, 246, 0.2);
  }
  .icon-wrapper svg {
    width: 32px;
    height: 32px;
    fill: #a78bfa;
  }
  h1 {
    font-size: 24px;
    font-weight: 800;
    margin-bottom: 8px;
    background: linear-gradient(135deg, #a78bfa, #60a5fa);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  p {
    font-size: 14px;
    color: #64748b;
    margin-bottom: 30px;
    line-height: 1.5;
  }
  .input-wrap {
    position: relative;
    margin-bottom: 16px;
  }
  input {
    width: 100%;
    background: rgba(0, 0, 0, 0.4);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    padding: 14px 16px;
    color: #fff;
    font-size: 18px;
    outline: none;
    text-align: center;
    font-family: monospace;
    letter-spacing: 6px;
    transition: all 0.3s ease;
  }
  input:focus {
    border-color: rgba(139, 92, 246, 0.5);
    box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.15);
  }
  input::placeholder {
    letter-spacing: 0;
    font-family: inherit;
    font-size: 14px;
    color: #475569;
  }
  button {
    width: 100%;
    background: linear-gradient(135deg, #7c3aed, #2563eb);
    border: none;
    border-radius: 12px;
    padding: 14px;
    color: #fff;
    font-size: 15px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.2s ease;
    box-shadow: 0 4px 15px rgba(124, 58, 237, 0.3);
  }
  button:hover {
    transform: translateY(-2px);
    filter: brightness(1.1);
    box-shadow: 0 6px 20px rgba(124, 58, 237, 0.4);
  }
  button:active {
    transform: scale(0.98);
  }
  .error-msg {
    color: #f87171;
    font-size: 13px;
    margin-top: 12px;
    font-weight: 500;
    animation: shake 0.4s ease;
  }
  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    25% { transform: translateX(-6px); }
    75% { transform: translateX(6px); }
  }
</style>
</head>
<body>
<div class="bg-glow"></div>
<div class="card">
  <div class="icon-wrapper">
    <svg viewBox="0 0 24 24">
      <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
    </svg>
  </div>
  <h1>访问受限</h1>
  <p>该页面属于私有资源，请提供正确的安全 PIN 码以继续访问。</p>
  <div class="input-wrap">
    <input type="password" id="pinInput" placeholder="输入 4 位安全 PIN 码" autocomplete="off" onkeydown="if(event.key==='Enter')verify()" />
  </div>
  <button onclick="verify()">验证并访问</button>
  ${errorMsg ? `<div class="error-msg">${errorMsg}</div>` : ""}
</div>
<script>
  function verify() {
    const val = document.getElementById("pinInput").value.trim();
    if (!val) {
      document.getElementById("pinInput").focus();
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.set("pin", val);
    window.location.href = url.toString();
  }
  document.getElementById("pinInput").focus();
</script>
</body>
</html>`;
}

// ==========================================
// Worker 导出
// ==========================================
export default {
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runBotTask(env, "https://rmbd.workers.dev"));
  },
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // 路由：防盗链本地图片代理，绕过豆瓣/猫眼图片拦截，内置强缓存加速页面渲染
    if (request.method === "GET" && url.pathname === "/imgproxy") {
      const targetUrl = url.searchParams.get("url");
      if (!targetUrl) {
        return new Response("Missing url parameter", { status: 400 });
      }
      try {
        const headers: any = {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        };
        if (targetUrl.includes("doubanio.com")) {
          headers["Referer"] = "https://m.douban.com/";
        } else if (targetUrl.includes("meituan.net") || targetUrl.includes("maoyan.com")) {
          headers["Referer"] = "https://m.maoyan.com/";
        }
        const imgRes = await fetch(targetUrl, { headers });
        if (!imgRes.ok) {
          return new Response(`Failed to fetch image: ${imgRes.status}`, { status: imgRes.status });
        }
        const response = new Response(imgRes.body, {
          headers: {
            "Content-Type": imgRes.headers.get("Content-Type") || "image/jpeg",
            "Cache-Control": "public, max-age=604800, s-maxage=604800"
          }
        });
        return response;
      } catch (err: any) {
        return new Response(`Error proxying image: ${err.message}`, { status: 500 });
      }
    }

    const activePin = env.PIN || MANUAL_PUSH_PIN;

    // 从 Cookie 中获取 PIN
    const cookieHeader = request.headers.get("Cookie") || "";
    const cookieMatch = cookieHeader.match(/rmbd_pin=([^;]+)/);
    const cookiePin = cookieMatch ? decodeURIComponent(cookieMatch[1]).trim() : "";

    // 从 Query 参数中获取 PIN
    const urlPin = url.searchParams.get("pin") || "";

    // 校验身份
    const isAuthed = (urlPin === activePin) || (cookiePin === activePin);
    const isWrongPin = urlPin !== "" && urlPin !== activePin;

    // 1. GET 安全拦截
    if (request.method === "GET") {
      if (!isAuthed) {
        const errorMsg = isWrongPin ? "⚠️ PIN 码输入错误，请重新输入" : "";
        return new Response(buildLockScreenHtml(errorMsg), {
          status: isWrongPin ? 403 : 401,
          headers: { "Content-Type": "text/html;charset=UTF-8" }
        });
      }
    }

    // 路由：动态渲染指定榜单的网页
    if (request.method === "GET" && url.pathname.startsWith("/view/")) {
      const cache = caches.default;
      const nocache = url.searchParams.get("nocache") === "true";
      if (!nocache) {
        const cachedResponse = await cache.match(request);
        if (cachedResponse) {
          return cachedResponse;
        }
      }

      const parts = url.pathname.split("/");
      const bankId = parts[2];
      
      const bank = TARGET_BANKS.find(b => b.id === bankId);
      
      if (!bank) {
        return new Response("❌ 找不到对应的榜单", { status: 404, headers: { "Content-Type": "text/plain;charset=UTF-8" } });
      }
      
      try {
        const urlObj = new URL(request.url);
        const baseUrl = `${urlObj.protocol}//${urlObj.host}`;
        const htmlContent = await getBankHtml(bank, env, baseUrl);
        const response = new Response(htmlContent, {
          headers: {
            "Content-Type": "text/html;charset=UTF-8",
            "Cache-Control": "public, s-maxage=3600, max-age=3600"
          }
        });

        // 写入安全 Cookie，方便后续流畅访问
        if (urlPin === activePin) {
          response.headers.append("Set-Cookie", `rmbd_pin=${encodeURIComponent(activePin)}; Path=/; Max-Age=2592000; SameSite=Lax; Secure`);
        }

        if (!nocache) {
          ctx.waitUntil(cache.put(request, response.clone()));
        }

        return response;

      } catch (e: any) {
        return new Response(`❌ 渲染网页发生异常: ${e.message}`, { status: 500, headers: { "Content-Type": "text/plain;charset=UTF-8" } });
      }
    }

    // 路由：系统诊断页面
    if (request.method === "GET" && url.pathname === "/status") {
      const results = await Promise.all([
        Promise.resolve(checkEnvVars(env)), checkTelegram(env), checkTelegramChat(env), checkTmdb(env), checkDouban(), checkWecom(env)
      ]);
      const response = new Response(buildStatusHtml(results, activePin), { headers: { "Content-Type": "text/html;charset=UTF-8" } });
      if (urlPin === activePin) {
        response.headers.append("Set-Cookie", `rmbd_pin=${encodeURIComponent(activePin)}; Path=/; Max-Age=2592000; SameSite=Lax; Secure`);
      }
      return response;
    }

    // 路由：发送 TG 测试消息（需要 ?pin=xxx 验证）
    if (request.method === "GET" && url.pathname === "/test-tg") {
      const pin = url.searchParams.get("pin") || cookiePin;
      if (!pin || pin !== activePin) {
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
      const pin = url.searchParams.get("pin") || cookiePin;
      if (!pin || pin !== activePin) {
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
        return Response.redirect(new URL(`/status?pin=${encodeURIComponent(activePin)}`, request.url).toString(), 302);
      }

      if (request.method === "POST") {
        const formData = await request.formData();
        const pin = (formData.get("pin") || "").toString().trim();
        const newPin = (formData.get("new_pin") || "").toString().trim();
        const changePinOnly = formData.get("change_pin_only") === "true";

        const isAuthed = (pin === activePin) || (cookiePin === activePin);
        if (!isAuthed) {
          return new Response(buildRunResultHtml("安全验证失败，拒绝操作", false), { status: 403, headers: { "Content-Type": "text/html;charset=UTF-8" } });
        }

        if (newPin) {
          MANUAL_PUSH_PIN = newPin;
        }

        if (changePinOnly) {
          const nextPin = newPin || activePin;
          const message = `✅ PIN 码修改成功，新 PIN 码为 ${nextPin}`;
          const response = new Response(buildRunResultHtml(message, true), { headers: { "Content-Type": "text/html;charset=UTF-8" } });
          response.headers.append("Set-Cookie", `rmbd_pin=${encodeURIComponent(nextPin)}; Path=/; Max-Age=2592000; SameSite=Lax; Secure`);
          return response;
        }

        const message = "🚀 推送已触发";
        ctx.waitUntil(runBotTask(env, request.url).catch(console.error));
        
        const nextPin = activePin;
        const response = new Response(buildRunResultHtml(message, true), { headers: { "Content-Type": "text/html;charset=UTF-8" } });
        response.headers.append("Set-Cookie", `rmbd_pin=${encodeURIComponent(nextPin)}; Path=/; Max-Age=2592000; SameSite=Lax; Secure`);
        return response;
      }
    }

    return Response.redirect(new URL(`/status?pin=${encodeURIComponent(activePin)}`, request.url).toString(), 302);
  }
} satisfies ExportedHandler<Env>;
