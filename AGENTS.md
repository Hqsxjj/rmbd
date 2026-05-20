# 🛠️ Developer & AI Agent Manual: RMBD Project

Welcome to the **RMBD** developer guide. This document is designed for both human developers and agentic AIs (like Antigravity) to rapidly understand the repository structure, codebase logic, test procedures, compilation steps, and edge-computing specific constraints.

---

## 📂 Directory Structure

```text
rmbd/
├── .github/                # GitHub Action workflows
├── src/
│   └── index.ts            # Core entry point (Worker Router & Main Logic)
├── wrangler.jsonc          # Cloudflare Worker configuration & Cron triggers
├── package.json            # Dependencies & Scripts
├── tsconfig.json           # TypeScript configuration
├── check_douban.js         # Raw diagnostic testing script for Douban WAF
├── test_douban.js          # Douban API fetch testing script
├── test_maoyan.js          # Maoyan API fetch testing script
├── worker-configuration.d.ts # TypeScript definitions generated from wrangler bindings
└── README.md               # User-facing project documentation
```

---

## ⚙️ Core Developer Commands

| Command | Purpose |
| :--- | :--- |
| `npm run cf-typegen` | Generates `worker-configuration.d.ts` matching the bindings configured in `wrangler.jsonc` |
| `npx wrangler dev` | Starts a local Cloudflare Worker development environment |
| `npx wrangler deploy` | Compiles, bundles, and publishes the Worker to Cloudflare Edge |
| `npx tsc --noEmit` | Checks the project codebase for compilation and TypeScript syntax errors |

> [!IMPORTANT]
> **Always run `npm run cf-typegen`** immediately after modifying `wrangler.jsonc` to update type declarations and prevent compiler errors in TypeScript.

---

## 🧪 Local Testing & Verification Scripts

The repository contains three diagnostic scripts that run locally with Node.js to verify upstream API status without deploying the worker:

### 1. `test_douban.js`
Tests fetching the Douban Hot Movie list using Frodo spoofing parameters.
- **Run command**: `node test_douban.js`
- **Verification**: It should output raw list JSON objects if the Douban API is healthy.

### 2. `test_maoyan.js`
Tests scraping Maoyan cinema movie data directly from the Maoyan mobile portal.
- **Run command**: `node test_maoyan.js`
- **Verification**: It should output list titles, today's box office numbers, and poster URLs.

### 3. `check_douban.js`
A basic request response code validator for the Douban mobile endpoint.
- **Run command**: `node check_douban.js`
- **Verification**: Verifies that requests are bypassing the 403 WAF blocks successfully.

---

## 🧠 Key Codebase Logic & Edge Hacks

When modifying `src/index.ts`, keep the following constraints and design decisions in mind:

### 1. Douban Frodo WAF Bypass
Cloudflare Workers IP ranges are heavily rate-limited or blocked by Douban. To bypass:
- Inject a static apikey into query parameters: `apikey=0ac9c5dfb7e2434199558a741fd9ab22`
- Spoof mobile User-Agent header: `User-Agent: Rexxar-Mobile/1.2.0-beta ... iOS Safari ...`
- Set standard browser headers (`Accept`, `Referer: https://m.douban.com/`, etc.).

### 2. Hotlink 403 Bypassing & wsrv.nl Proxy
Both Douban and Maoyan enforce strict Referer checks on poster image domains, throwing `403 Forbidden` on standard browsers.
- **Solution**: Prepend relative image protocol schemas (e.g. `//img9.doubanio.com` to `https://img9.doubanio.com`) and rewrite standard image URLs to pass through the `wsrv.nl` image CDN:
  ```javascript
  const proxiedUrl = `https://wsrv.nl/?url=${encodeURIComponent(originalUrl)}`;
  ```

### 3. Edge MD5 Hashing (Web Crypto API)
In Cloudflare Workers, standard Node `crypto` hashes are available under compatibility banners, but high-performance, native Web Crypto is preferred. WeCom's image webhook requires a standard MD5 hex checksum computed over the raw binary payload:
```typescript
const arrayBuffer = await response.arrayBuffer();
const hashBuffer = await crypto.subtle.digest("MD5", arrayBuffer);
const hashArray = Array.from(new Uint8Array(hashBuffer));
const md5Hex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
```

### 4. Cloudflare Caching API
To optimize load times and stay within upper limits, cache responses:
- **Router Cache**: `/view/:id` relies on `caches.default` to cache fully-rendered HTML lists for 1 hour. It automatically honors `nocache=true` request parameters for testing/purging:
  ```typescript
  const cacheKey = new Request(request.url.split('?')[0], request);
  const cache = caches.default;
  ```
- **Subrequest Cache**: Fetch calls to TMDB API and upstream endpoints include `cf: { cacheTtl: 86400 }` to cache JSON metadata on the edge for up to 24 hours.

---

## 📈 Quality Checklist for Pull Requests

Before committing changes, run this workflow:
1. Run `npx wrangler types` to sync bindings.
2. Run `npx tsc --noEmit` to verify type safety.
3. Access `/status` on a preview deployment or locally using wrangler dev to check that:
   - Environment variables are defined.
   - Upstream API latencies are within healthy limits (below 2000ms).
   - "企微测试" and "TG测试" execute cleanly.
