// Shared types. Every number shown in the UI lives in one of these shapes and
// comes from a Qloo response, never from the LLM.

export type EntityKind =
  | "brand"
  | "podcast"
  | "person"
  | "artist"
  | "place"
  | "tv_show"
  | "movie"
  | "destination"
  | "book"
  | "video_game";

export const ENTITY_URN = (k: EntityKind) => `urn:entity:${k}`;

export type Budget = "bootstrapped" | "growing" | "funded";

/** Qloo's signal.demographics.age buckets. */
export type AgeBand = "35_and_younger" | "36_to_55" | "55_and_older";

export interface Tag {
  id: string;
  name: string;
  type?: string;
}

export interface Entity {
  id: string;
  name: string;
  kind: EntityKind | string;
  /** query.affinity from /v2/insights, 0..1. Null when the call had no signal (e.g. /search). */
  affinity: number | null;
  /** Popularity percentile, 0..1. */
  popularity: number | null;
  tags: Tag[];
  description?: string;
  address?: string;
  lat?: number;
  lng?: number;
  url?: string;
}

export interface Pick extends Entity {
  valueScore: number;
  rankRaw: number;
  rankValue: number;
  why: string;
}

export interface Demographics {
  /** Age bucket -> affinity, roughly -1..1. */
  age: Record<string, number>;
  /** male/female -> affinity, roughly -1..1. */
  gender: Record<string, number>;
}

export interface HeatPoint {
  lat: number;
  lng: number;
  geohash: string;
  affinity: number;
  affinityRank: number;
  popularity: number;
}

export interface Neighbourhood {
  name: string;
  lat: number;
  lng: number;
  affinityRank: number;
  affinity: number;
  popularity: number;
  points: number;
}

export interface CityResult {
  query: string;
  center: [number, number] | null;
  points: HeatPoint[];
  neighbourhoods: Neighbourhood[];
  partners: Pick[];
}

export interface RunInput {
  brandQuery: string;
  /** Resolved and confirmed brand entity, if Qloo knows the brand. */
  brand: { id: string; name: string } | null;
  /** Fallback "brands like us" picks. */
  lookalikes: { id: string; name: string }[];
  /** Vibe tags from /v2/tags. */
  tags: Tag[];
  city?: string;
  budget: Budget;
  age?: AgeBand;
}

export interface TraceStep {
  id: string;
  tool: string;
  label: string;
  input: string;
  status: "running" | "done" | "empty" | "error";
  count?: number;
  ms?: number;
  note?: string;
}

export type SponsorKind = "podcast" | "person" | "artist";

export interface Report {
  id: string;
  createdAt: string;
  mode: "live" | "mock";
  agent: "gemini" | "scripted";
  input: RunInput;
  seed: { entities: { id: string; name: string }[]; tags: Tag[]; categoryTags: Tag[] };
  audience: {
    demographics: Demographics | null;
    top: Partial<Record<EntityKind, Entity[]>>;
  };
  sponsors: Partial<Record<SponsorKind, Pick[]>>;
  city: CityResult | null;
  collabs: Pick[];
  summary: string;
  notes: string[];
  trace: TraceStep[];
  withoutQloo?: string;
  /** The agent's own summary when the number check rejected it (kept for debugging, not shown). */
  rejectedSummary?: string;
}

export interface Evidence {
  pick: Pick;
  overlap: { score: number | null; sharedTags: string[] };
  demographics: Demographics | null;
  audienceDemographics: Demographics | null;
}
