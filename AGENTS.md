# 🛠️ Developer & AI Agent Manual: Movie Recommendation Bot Project (RMBD)

Welcome to the **Movie Recommendation Bot (RMBD)** developer and agent-oriented technical manual. This document is specifically structured to help both human developers and autonomous AI coding agents (such as Antigravity) immediately comprehend the architecture, code execution flow, API integration quirks, local debugging techniques, and Cloudflare Workers runtime requirements.

---

## 📂 Directory Structure

```text
rmbd_hqsxjj/
├── .github/                  # GitHub Action workflow files
├── src/
│   └── index.ts              # Core entry point (Router, API orchestrator & H5 Render)
├── wrangler.jsonc            # Cloudflare Worker configuration, KV bindings & Cron triggers
├── package.json              # Compilation scripts & Dev dependencies
├── tsconfig.json             # TypeScript compiler settings
├── check_douban.js           # Lightweight standalone script to test Douban request headers
├── test_douban.js            # Offline Node.js simulation for fetching Douban film APIs
├── test_maoyan.js            # Offline Node.js scraper simulation for Maoyan Box Office API
├── worker-configuration.d.ts  # Types generated from wrangler bindings (do not edit manually)
└── README.md                 # User-facing installation and deployment guide
```

---

## ⚙️ Core Developer Toolchain

Use these standard commands inside the active workspace directory (`C:\Users\Administrator\.gemini\antigravity\scratch\rmbd_hqsxjj`):

| Command | Purpose |
| :--- | :--- |
| `npm run cf-typegen` | Synchronizes wrangler bindings into `worker-configuration.d.ts` for absolute type safety. |
| `npm run dev` | Spins up a local Wrangler dev server. Simulates local KV and cron events. |
| `npm run deploy` | Bundles, compiles, and deploys the production codebase directly to the Cloudflare Edge network. |
| `npx tsc --noEmit` | Runs the TypeScript compiler in syntax-checking mode to catch type mismatches before staging. |

> [!IMPORTANT]
> **KV Namespace Mocking in Dev**: When running `npm run dev`, Wrangler automatically spins up a local miniflare instance. The `BOT_CONFIG` namespace will be simulated locally under the `.wrangler` directory. You can test saving configurations via `/admin` and they will persist locally across restarts.

---

## 🧪 Node.js Offline Diagnostic Scripts

Three standalone JS scripts are situated in the project root to inspect and diagnose upstream API availability without deploying to a Cloudflare Worker:

1. **`test_douban.js`**: Fetches real-time lists from the Douban mobile backend using the mobile client Frodo keys. Run via `node test_douban.js`.
2. **`test_maoyan.js`**: Scrapes Maoyan Cinema movie entries, box office figures, and poster coordinates. Run via `node test_maoyan.js`.
3. **`check_douban.js`**: Quick endpoint check checking if the current network environment is being blocked by Douban's CDN WAF. Run via `node check_douban.js`.

---

## 🧠 Key Codebase Logic & Edge Hacks

When editing `src/index.ts`, pay close attention to these architectural constraints and edge-native hacks:

### 1. The Dynamic Dual-Config Engine (`getMergedConfig`)
To balance deployment speed and dynamic configurability, `src/index.ts` employs a unified helper function `getMergedConfig(env)` to retrieve runtime parameters:
- **Priority**: Query the Cloudflare KV database bound under `env.BOT_CONFIG`.
- **Fallback**: If the KV binding is missing or the database keys are empty, fall back seamlessly to standard environment variables (`env.TMDB_API_KEY`, `env.TG_BOT_TOKEN`, etc.).
- **Formatting Hygiene**: All strings retrieved are automatically cleaned using `.trim()` to prevent trailing blank spaces from causing invalid API connection attempts.

### 2. Douban Frodo WAF Bypass
Cloudflare Workers IP ranges are often heavily rate-limited by Douban. To maintain connection stability:
- Inject the hardcoded mobile apikey: `apikey=0ac9c5dfb7e2434199558a741fd9ab22`
- Spoof mobile iOS UA strings:
  ```text
  User-Agent: Rexxar-Mobile/1.2.0-beta ... iOS Safari ...
  ```
- Send authentic browser reference headers (`Referer: https://m.douban.com/`, `Accept`, etc.).

### 3. Anti-Hotlinking Poster Proxy
Both Douban and Maoyan enforce strict, referrer-based hotlinking blocks on poster images, throwing `403 Forbidden` on standard browsers.
- **Solution**: We detect raw image paths, ensure they are complete protocols, and route them through the `wsrv.nl` image CDN:
  ```typescript
  const proxiedPoster = `https://wsrv.nl/?url=${encodeURIComponent(originalPosterUrl)}`;
  ```

### 4. Edge Hashing & Binary base64 Transforms (Web Crypto API)
Enterprise WeChat (WeCom) webhooks require raw binary image files to be parsed, with the MD5 hex digest and Base64-encoded strings uploaded inside the payload:
- **Edge Native Cryptography**: Cloudflare Workers do not natively include the Node `crypto` library unless compat flags are enabled. We use high-performance Web Crypto APIs instead:
  ```typescript
  const arrayBuffer = await response.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("MD5", arrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const md5Hex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  ```
- We then manually encode the array buffer to Base64 on the fly for the robot payload.

### 5. Double-Tier Cache Architecture
- **HTML Router Cache**: `/view/:id` is cached using `caches.default` for 1 hour. Requests with `?nocache=true` bypass the cache and force an immediate reload from upstream.
- **Subrequest API Cache**: Fetch calls targeting TMDB and other upstream REST structures include `cf: { cacheTtl: 86400, cacheEverything: true }` to keep static payloads fresh on the edge, reducing external roundtrips.

### 6. Interactive Secure `/admin` Dashboard & Session Cookie Flow
The admin dashboard operates on a lightweight, secure cookie session flow:
- **Authentication Check**: The `/admin` GET router inspects incoming `Cookie` headers for `admin_pin`. If the cookie value matches the active PIN (either KV stored or environment fallback), the config page is fully compiled and sent.
- **Lock Screen fallback**: If unauthorized, it renders a glassmorphic password prompt.
- **Persistent Sessions**: Valid credentials write an `admin_pin` cookie with a `Max-Age` of 30 days (`2592000` seconds) and `Path=/`.
- **Dynamic Configuration Endpoint (`/api/save`)**:
  - Accepts POST payloads containing configuration properties.
  - Authenticates the current action using the provided PIN parameter.
  - Writes valid properties sequentially to the `BOT_CONFIG` KV Namespace.
  - Rewrites the `admin_pin` cookie to match the newly submitted PIN if the PIN was updated, preventing accidental lockouts.

---

## 📈 Quality Checklist for Autonomous Agents and Pull Requests

Before committing and pushing code changes, ensure the following checklist is completed:

1. **Wrangler Type Generation**:
   Run `npm run cf-typegen` and verify that no changes are missing from the `Env` declaration.
2. **TypeScript Compilation Check**:
   Ensure `npx tsc --noEmit` yields **zero** errors.
3. **Local Dry-Run**:
   Run `npm run dev` to test routing and ensure `/admin` and `/status` respond appropriately.
4. **Connectivity & Self-Test Verification**:
   Navigate to `/status` on a preview deployment or local server, authenticate, and run standard connectivity tests (latency, Telegram connection, WeCom connection) to ensure zero regressions occur on upstream channels.
