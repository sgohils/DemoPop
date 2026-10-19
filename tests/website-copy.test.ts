import test from "node:test";
import assert from "node:assert/strict";
import { websiteCopy } from "../src/server/website-import";

const metadata = {
  siteName: "",
  title: "",
  h1: "",
  description: "",
  headings: [] as { text: string; summary: string; y: number }[],
  cta: "",
  colors: [],
  font: "sans-serif",
};

test("website copy uses published copy, keeps useful sections, and removes duplicate headings", () => {
  const copy = websiteCopy(
    {
      ...metadata,
      title: "Internal page | Product marketing",
      siteName: "Orbit",
      h1: "A calmer place to manage your projects.",
      description:
        "Bring tasks, notes, and schedules into one shared workspace.",
      headings: [
        {
          text: "Plan with your team",
          summary: "Keep your shared tasks together.",
          y: 900,
        },
        { text: "PLAN WITH YOUR TEAM", summary: "Same section", y: 1200 },
        {
          text: "Keep schedules in view",
          summary: "Calendar views for upcoming work.",
          y: 1600,
        },
      ],
      cta: "Start your free trial",
    },
    "www.orbit.test",
  );
  assert.equal(copy.name, "Orbit");
  assert.equal(copy.opening, "A calmer place to manage your projects.");
  assert.equal(copy.cta, "Start your free trial");
  assert.equal(copy.sections.length, 2);
  assert.equal(copy.sections[0].summary, "Keep your shared tasks together.");
});

test("website copy uses factual fallbacks instead of invented benefits", () => {
  const copy = websiteCopy(metadata, "www.example.com");
  assert.deepEqual(copy, {
    name: "example.com",
    opening: "Explore example.com.",
    cta: "Explore example.com.",
    description: "",
    sections: [],
  });
  assert.equal(
    websiteCopy(
      {
        ...metadata,
        title: "Tempo — Project planning",
        description: "See your upcoming work.",
      },
      "tempo.test",
    ).opening,
    "See your upcoming work.",
  );
  assert.equal(
    websiteCopy(
      { ...metadata, title: "Tempo — Project planning" },
      "tempo.test",
    ).name,
    "Tempo",
  );
});

test("website copy remains bounded and does not split a unicode grapheme", () => {
  const copy = websiteCopy(
    {
      ...metadata,
      siteName: "Launch ".repeat(20),
      h1: `${"a".repeat(68)}👨‍👩‍👧‍👦`,
      description: "Description ".repeat(60),
      cta: "Explore your new workspace with our team today",
      headings: [
        {
          text: "Heading ".repeat(30),
          summary: "Summary ".repeat(40),
          y: 1000,
        },
      ],
    },
    "example.com",
  );
  assert.ok(copy.name.length <= 60);
  assert.equal(copy.opening, "a".repeat(68));
  assert.ok(copy.description.length <= 280);
  assert.ok(copy.cta.length <= 36);
  assert.ok(copy.sections[0].heading.length <= 70);
  assert.ok(copy.sections[0].summary.length <= 180);
});
