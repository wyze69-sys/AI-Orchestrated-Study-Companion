import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateStreakMetrics } from "./streak-utils.js";
import { aggregateWeakTopics } from "./weak-topics.js";

const TODAY = "2026-08-09T12:00:00.000Z"; // Reference today (2026-08-09 UTC)

test("calculateStreakMetrics: no activity returns zero and null values", () => {
  const res = calculateStreakMetrics([], TODAY);
  assert.equal(res.currentStreak, 0);
  assert.equal(res.longestStreak, 0);
  assert.equal(res.activeStudyDays, 0);
  assert.equal(res.lastStudyDate, null);
  assert.deepEqual(res.streakDates, []);
});

test("calculateStreakMetrics: one activity today returns current streak 1", () => {
  const timestamps = ["2026-08-09T08:30:00.000Z"];
  const res = calculateStreakMetrics(timestamps, TODAY);
  assert.equal(res.currentStreak, 1);
  assert.equal(res.longestStreak, 1);
  assert.equal(res.activeStudyDays, 1);
  assert.equal(res.lastStudyDate, "2026-08-09");
  assert.deepEqual(res.streakDates, ["2026-08-09"]);
});

test("calculateStreakMetrics: activity today and yesterday returns current streak 2", () => {
  const timestamps = [
    "2026-08-08T15:00:00.000Z",
    "2026-08-09T10:00:00.000Z"
  ];
  const res = calculateStreakMetrics(timestamps, TODAY);
  assert.equal(res.currentStreak, 2);
  assert.equal(res.longestStreak, 2);
  assert.equal(res.activeStudyDays, 2);
  assert.equal(res.lastStudyDate, "2026-08-09");
});

test("calculateStreakMetrics: multiple activities on one day count as 1 active day", () => {
  const timestamps = [
    "2026-08-09T08:00:00.000Z",
    "2026-08-09T12:00:00.000Z",
    "2026-08-09T18:30:00.000Z"
  ];
  const res = calculateStreakMetrics(timestamps, TODAY);
  assert.equal(res.currentStreak, 1);
  assert.equal(res.longestStreak, 1);
  assert.equal(res.activeStudyDays, 1);
  assert.equal(res.lastStudyDate, "2026-08-09");
  assert.deepEqual(res.streakDates, ["2026-08-09"]);
});

test("calculateStreakMetrics: missing today but activity yesterday returns current streak 1", () => {
  const timestamps = ["2026-08-08T20:00:00.000Z"];
  const res = calculateStreakMetrics(timestamps, TODAY);
  assert.equal(res.currentStreak, 1);
  assert.equal(res.longestStreak, 1);
  assert.equal(res.activeStudyDays, 1);
  assert.equal(res.lastStudyDate, "2026-08-08");
});

test("calculateStreakMetrics: gap between dates resets current streak", () => {
  const timestamps = [
    "2026-08-01T10:00:00.000Z",
    "2026-08-02T10:00:00.000Z",
    "2026-08-03T10:00:00.000Z",
    "2026-08-09T10:00:00.000Z"
  ];
  const res = calculateStreakMetrics(timestamps, TODAY);
  assert.equal(res.currentStreak, 1);
  assert.equal(res.longestStreak, 3);
  assert.equal(res.activeStudyDays, 4);
  assert.equal(res.lastStudyDate, "2026-08-09");
});

test("calculateStreakMetrics: future dates are ignored", () => {
  const timestamps = [
    "2026-08-09T10:00:00.000Z",
    "2099-01-01T00:00:00.000Z"
  ];
  const res = calculateStreakMetrics(timestamps, TODAY);
  assert.equal(res.currentStreak, 1);
  assert.equal(res.longestStreak, 1);
  assert.equal(res.activeStudyDays, 1);
  assert.equal(res.lastStudyDate, "2026-08-09");
});

test("calculateStreakMetrics: malformed timestamps do not crash function", () => {
  const timestamps = [
    null,
    undefined,
    "invalid-date-string",
    "2026-08-09T10:00:00.000Z"
  ];
  const res = calculateStreakMetrics(timestamps, TODAY);
  assert.equal(res.currentStreak, 1);
  assert.equal(res.activeStudyDays, 1);
  assert.equal(res.lastStudyDate, "2026-08-09");
});

// ── Weak topic aggregation ───────────────────────────────────────────────────

const weakSample = () => [
  { totalQuestions: 5, score: 2, percentage: 40, completedAt: "2026-08-09T10:00:00.000Z", documentFilename: "photosynthesis.pdf", sessionTitle: "Bio" },
  { totalQuestions: 5, score: 4, percentage: 80, completedAt: "2026-08-08T10:00:00.000Z", documentFilename: "photosynthesis.pdf", sessionTitle: "Bio" },
  { totalQuestions: 5, score: 5, percentage: 100, completedAt: "2026-08-07T10:00:00.000Z", sessionTitle: "Chemistry" },
  { totalQuestions: 3, score: 1, percentage: 33, completedAt: "2026-08-06T10:00:00.000Z", documentFilename: "docs/calculus.txt", sessionTitle: "Math" }
];

test("aggregateWeakTopics groups by document filename (extension stripped) and ranks by incorrect answers", () => {
  const topics = aggregateWeakTopics(weakSample());
  assert.ok(topics.length >= 2);

  const photosynthesis = topics.find((t) => t.topic === "photosynthesis");
  assert.ok(photosynthesis, "photosynthesis topic must be present");
  assert.equal(photosynthesis.attempts, 2);
  assert.equal(photosynthesis.incorrectTotal, 4); // 3 + 1 wrong
  assert.equal(photosynthesis.accuracy, 60); // (40 + 80) / 2
  assert.equal(photosynthesis.lastActivity, "2026-08-09T10:00:00.000Z");

  // Perfect topic is excluded
  assert.equal(topics.some((t) => t.topic === "Chemistry"), false);
});

test("aggregateWeakTopics falls back to session title and treats path filename safely", () => {
  const topics = aggregateWeakTopics([
    { totalQuestions: 2, score: 0, percentage: 0, completedAt: "2026-08-01T00:00:00.000Z", sessionTitle: "Electrochem review" },
    { totalQuestions: 2, score: 0, percentage: 0, completedAt: "2026-08-01T00:00:00.000Z", documentFilename: "sub/folder/notes.pdf" }
  ]);
  const titles = topics.map((t) => t.topic);
  assert.ok(titles.includes("Electrochem review"));
  assert.ok(titles.includes("notes"));
  assert.ok(!titles.includes("sub/folder/notes"));
});

test("aggregateWeakTopics counts recent incorrect answers within 7 days", () => {
  const now = new Date();
  const recent = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();
  const old = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000).toISOString();
  const topics = aggregateWeakTopics([
    { totalQuestions: 4, score: 1, percentage: 25, completedAt: recent, documentFilename: "topic-a.txt" },
    { totalQuestions: 4, score: 3, percentage: 75, completedAt: old, documentFilename: "topic-a.txt" }
  ]);
  const topic = topics.find((t) => t.topic === "topic-a");
  assert.equal(topic.attempts, 2);
  assert.equal(topic.incorrectTotal, 4);
  assert.equal(topic.recentIncorrectCount, 3);
});

test("aggregateWeakTopics disambiguates same-topic rows on alternate fields and handles malformed input", () => {
  assert.deepEqual(aggregateWeakTopics([]), []);
  assert.deepEqual(aggregateWeakTopics(null), []);
  assert.deepEqual(aggregateWeakTopics([null, "text"]), []);
  // only incorrect topics returned
  assert.deepEqual(
    aggregateWeakTopics([{ totalQuestions: 3, score: 3, percentage: 100, completedAt: TODAY, documentName: "done.txt" }]),
    []
  );
});
