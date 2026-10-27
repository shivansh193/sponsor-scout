import type { RunInput } from "./types";

// Product name is not final; change it in one place (or via env).
export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? "Sponsor Scout";

export interface Example {
  title: string;
  blurb: string;
  input: RunInput;
}

// Synthetic brands from src/lib/mock.ts, used while QLOO_MOCK is on.
export const MOCK_EXAMPLES: Example[] = [
  {
    title: "Ember & Oak Coffee",
    blurb: "Specialty roaster, bootstrapped, pop-up in New York",
    input: { brandQuery: "Ember & Oak Coffee", brand: { id: "mock-brand-ember-oak-coffee", name: "Ember & Oak Coffee" }, lookalikes: [], tags: [], city: "New York", budget: "bootstrapped" },
  },
  {
    title: "Little Hill Tea",
    blurb: "Not in Qloo yet, so it borrows two lookalike brands. London",
    input: {
      brandQuery: "Little Hill Tea",
      brand: null,
      lookalikes: [
        { id: "mock-brand-quiet-hours-tea", name: "Quiet Hours Tea" },
        { id: "mock-brand-paper-kite-teahouse", name: "Paper Kite Teahouse" },
      ],
      tags: [{ id: "urn:tag:keyword:qloo:slow_living", name: "Slow living" }],
      city: "London",
      budget: "bootstrapped",
    },
  },
  {
    title: "Kerbside Sneakers",
    blurb: "Sneaker shop with a growing budget, Los Angeles",
    input: { brandQuery: "Kerbside Sneakers", brand: { id: "mock-brand-kerbside-sneakers", name: "Kerbside Sneakers" }, lookalikes: [], tags: [], city: "Los Angeles", budget: "growing" },
  },
];

// Fill in after the coverage probe (scripts/probe.mts) with real Qloo entity IDs.
export const LIVE_EXAMPLES: Example[] = [];
