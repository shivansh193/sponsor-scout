# Sponsor Scout

**Live:** https://sponsor-scout.vercel.app · **Demo video (2:54):** https://youtu.be/YR31NnS1aGg

Small direct-to-consumer brands spend money every month on podcast ads, creator deals, pop-ups and collabs, and they choose where by guessing or by copying bigger brands. Sponsor Scout is an agent that works out who your customers are by taste, using Qloo, and then gives you a media plan:

- **Who to sponsor:** podcasts, creators and artists your audience loves, ranked by affinity and by **value**: loved by your audience but not famous, so you can afford them.
- **Where to show up:** the neighbourhoods in a city that over-index on your audience (from Qloo heatmaps), plus local cafés, venues and stores whose audience matches yours.
- **Who to collab with:** non-competing brands your customers already love.
- **Why each pick:** affinity, popularity, audience overlap and demographic fit, and a draft pitch email built from that evidence.

If your brand isn't in Qloo yet (likely for a small brand), pick 2–4 "brands like us" and a few vibe tags instead.

## Why it needs Qloo

Ask an LLM which podcasts a coffee roaster should sponsor and you get the famous shows every brand already names, with no evidence and no geography. Qloo supplies cross-domain affinity (a coffee brand's audience → podcasts, artists, places), popularity percentiles, location heatmaps and demographics. The report has a **Without Qloo** panel that asks the LLM the same question with no tools, next to the Qloo-grounded answer.

**The value score.** Famous sponsorships are overpriced for small brands. Each pick gets
`value = affinity × (1 − popularity)^k`, with `k` set by budget (bootstrapped 1.0, growing 0.5, funded 0), and bootstrapped and growing budgets also cap `filter.popularity.max`. The UI shows both the value ranking and the raw affinity ranking.

## How it works

```
Browser ──POST /api/run (SSE)──▶ Agent loop (Gemini function calling, or scripted plan)
   ▲  live step trace                │ calls tools
   │                                 ▼
   │                        Tools (src/lib/agent/tools.ts)
   │                          │            │
   │                Qloo client (src/lib/qloo.ts)   Scoring (src/lib/score.ts, deterministic)
   │                  │  cache (Redis, 24h)          Nominatim reverse geocoding (cached)
   │                  ▼
   │          hackathon.api.qloo.com
   │
   └── /r/[id] permalink ◀── report saved to Redis
```

- The LLM only plans tool calls, explains and writes pitches. **Every number in the UI comes from a Qloo response.** The agent's final summary is checked: if it contains a number that no tool returned, it is replaced with a summary generated from the data.
- If the LLM skips a step, the server runs it so the report is complete, and says so in the trace.
- Without `GEMINI_API_KEY` the same tools run as a fixed plan.

### Qloo endpoints used

| Endpoint | Used for |
| --- | --- |
| `GET /search` | Resolve the brand and lookalike brands to entity IDs |
| `GET /v2/tags` | Vibe tags for brands Qloo doesn't know |
| `GET /v2/insights` `filter.type=urn:entity:{podcast,person,artist}` | Sponsor shortlists, with `filter.popularity.max` per budget |
| `GET /v2/insights` `filter.type=urn:entity:{artist,podcast,tv_show,brand,destination}` | Audience taste profile |
| `GET /v2/insights` `filter.type=urn:demographics` | Age and gender affinity of the audience and of each pick |
| `GET /v2/insights` `filter.type=urn:heatmap` + `filter.location.query` | Neighbourhoods that over-index on the audience |
| `GET /v2/insights` `filter.type=urn:entity:place` + `filter.location.query` | Local partner places |
| `GET /v2/insights` `filter.type=urn:entity:brand` + `filter.exclude.tags` / `filter.exclude.entities` | Non-competing collab brands |
| `GET /v2/analysis/compare` | Audience overlap between the brand and a pick, for the pitch |

## Run locally

```bash
npm install
cp .env.example .env.local   # all keys optional
npm run dev
```

With no keys it runs on synthetic data (`src/lib/mock.ts`, all names invented) and a scripted agent. Add `QLOO_API_KEY` for live data and `GEMINI_API_KEY` for the Gemini agent, pitch emails and the Without Qloo panel.

```bash
npm test                                   # scoring unit tests
npx tsx scripts/probe.mts "Brand A" "Brand B"   # Qloo coverage probe (writes git-ignored probe-output/)
npx tsx scripts/warm.mts https://your-app.vercel.app   # precompute the landing-page examples
```

## Deploy

Vercel, with `QLOO_API_KEY`, `GEMINI_API_KEY` and an Upstash Redis store (`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, or the Vercel KV equivalents). Without Redis, permalinks don't survive across serverless instances. New runs are rate-limited per IP (`RUNS_PER_HOUR`); repeated inputs within 24h replay the cached report.

## Data

Qloo responses are cached server-side only. No Qloo response data is committed to this repo; the fixtures are generated synthetically.

## Licence

MIT
