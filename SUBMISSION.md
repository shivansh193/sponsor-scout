# Devpost submission text

Paste-ready text for the Devpost form.

**Tagline (one line):** An agent that uses Qloo taste data to show small DTC brands which podcasts, creators, neighbourhoods and collab partners their customers already love, ranked by how affordable each one is.

**Try it:** https://sponsor-scout.vercel.app (no login; click an example)
**Code:** https://github.com/shivansh193/sponsor-scout (MIT)

---

## Inspiration

A small coffee roaster or skincare label spends real money every month on podcast ads, creator deals, pop-ups and collabs. Most pick where by guessing, or by copying what bigger brands do. That sends them to the most famous shows and creators, which are the most expensive and the least likely to pay back for a small brand.

## What it does

You enter your brand. An agent works out who your customers are by taste, then gives you a media plan:

- **Who to sponsor.** Podcasts, creators and artists your audience loves, ranked two ways: by raw affinity, and by value.
- **Where to show up.** A heatmap of a chosen city showing the neighbourhoods that over-index on your audience, with readable names, plus local cafés, venues and stores whose audience matches yours, as partner candidates.
- **Who to collab with.** Non-competing brands your customers already love. Your own category is excluded.
- **Why each pick.** Every card shows affinity, popularity and the value score. One click drafts a pitch email to that podcast, creator or venue, built only from the evidence on the card: affinity, audience overlap, shared taste signals and demographic fit.
- **A shareable report.** Each plan has a permalink a founder can send to a co-founder.

If Qloo doesn't know your brand yet (likely for a small brand), you pick two to four "brands like us" and a few vibe tags, and the agent works from those instead. The trace says so.

## The insight: rank by value, not fame

Famous sponsorships are overpriced for small brands. Qloo returns both an affinity score and a popularity percentile for every entity, so we can find what your audience loves that nobody else is bidding on:

`value = affinity × (1 − popularity)^k`

`k` comes from the budget you choose: bootstrapped 1.0, growing 0.5, funded 0 (pure affinity). Bootstrapped and growing budgets also cap `filter.popularity.max`. The UI shows both rankings side by side, and how many places each pick climbed. For Little Hill Tea (a tea brand Qloo doesn't know, planned through Twinings and Clipper Teas), the #1 value artist, Girls@Play, was #14 by raw affinity, at the 28th popularity percentile.

## Why it needs Qloo

Ask an LLM alone which podcasts a coffee roaster should sponsor and where to hold a pop-up in New York. You get the famous shows everyone names, the obvious neighbourhoods, and no evidence for any of it. Every report has a **Without Qloo** panel that asks the same question to the same model with no tools, next to the Qloo-grounded answer. The difference is the point of the product: cross-domain affinity (a coffee brand's audience → podcasts, artists, places), popularity percentiles, location heatmaps and demographics are not something a language model can make up honestly.

**Every number in the UI comes from a Qloo response.** The LLM plans the steps, explains, and writes pitches. Scoring and ranking are deterministic code. If the agent's summary cites a number that no tool returned, the app throws the summary away and builds one from the data instead.

## How we built it

- **Agent:** Gemini function calling (Flash) drives a tool loop: `resolve_brand`, `resolve_lookalikes`, `audience_profile`, `find_sponsors`, `map_city`, `find_partners`, `find_collab_brands`, `explain_pick`. Each step streams to the UI over server-sent events, with its tool, input, result count and duration, so you can watch the agent work. If the model skips a step, the server runs it and says so in the trace.
- **Qloo endpoints:**
  - `GET /search`: resolve the brand and lookalike brands to entity IDs.
  - `GET /v2/tags`: vibe tags for brands Qloo doesn't know.
  - `GET /v2/insights` with `filter.type=urn:entity:podcast|person|artist` and `filter.popularity.max`: sponsor shortlists.
  - `GET /v2/insights` with `filter.type=urn:entity:artist|podcast|tv_show|brand|destination`: the audience's taste profile.
  - `GET /v2/insights` with `filter.type=urn:demographics`: age and gender affinity, for the audience and for each pick.
  - `GET /v2/insights` with `filter.type=urn:heatmap` and `filter.location.query`: where in a city the audience over-indexes.
  - `GET /v2/insights` with `filter.type=urn:entity:place`, `filter.location` (a point at the geocoded city centre) and `filter.location.radius`, minus hotels: local partner places.
  - `GET /v2/insights` with `filter.type=urn:entity:brand`, `filter.exclude.tags` and `filter.exclude.entities`: non-competing collab brands.
  - `GET /v2/analysis/compare`: audience overlap between the brand and a pick, used in the pitch email.
- **Stack:** Next.js on Vercel, TypeScript, Upstash Redis (24-hour cache of Qloo calls, permalinks, per-IP rate limits), Leaflet with OpenStreetMap tiles for the heatmap, Nominatim for neighbourhood names.

## Challenges

- Qloo silently ignores parameters that don't apply to a `filter.type`, so an empty 200 often means a wrong parameter, not missing data. The client logs a warning on empty results, and competitor exclusion is applied again in code rather than trusted to the API.
- A bare city name can be ambiguous: "New York" first returned inns across New York State. Partner search now runs around the geocoded city centre instead.
- Small brands often aren't in Qloo. The "brands like us" fallback makes the product usable for exactly the people it's for.
- Keeping the LLM honest: tool results are the only source of numbers, and the summary check enforces it.

## What's next

- A "rising now" badge from Qloo's trending endpoint, to catch creators before their prices go up.
- Tracking which pitches got replies, to tune the value score per category.
- More cities, and comparing two cities for a pop-up tour.

## Built with

Qloo Insights API · Gemini · Next.js · TypeScript · Vercel · Upstash Redis · Leaflet · OpenStreetMap
