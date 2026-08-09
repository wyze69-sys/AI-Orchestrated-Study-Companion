/**
 * Weak-topic aggregation derived from completed quiz results.
 * Kept dependency-free so it can be unit-tested without a database.
 */

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Aggregates completed quiz rows into per-topic weakness rankings.
 *
 * Each row:
 *   { totalQuestions, score, percentage, completedAt,
 *     documentFilename?, sessionTitle? }
 *
 * Topic is derived from the source document filename (extension stripped),
 * falling back to the session title, then "Untitled quiz".
 * Only topics with at least one incorrect answer are returned, ranked by
 * most incorrect answers first, then lowest accuracy, then most recent.
 */
export function aggregateWeakTopics(quizRows) {
  if (!Array.isArray(quizRows)) return [];

  const byTopic = new Map();
  const now = Date.now();

  for (const row of quizRows) {
    if (!row || typeof row !== "object") continue;
    const total = Number(row.totalQuestions);
    const score = Number(row.score);
    if (!Number.isInteger(total) || !Number.isInteger(score)) continue;

    const incorrect = Math.max(0, total - score);
    const filename = typeof row.documentFilename === "string" ? row.documentFilename.trim() : "";
    const baseName = filename.split(/[\\/]/).pop() || "";
    const topicName = baseName.replace(/\.[^.]+$/, "") || String(row.sessionTitle ?? "").trim() || "Untitled quiz";

    const key = topicName.toLowerCase();
    let entry = byTopic.get(key);
    if (!entry) {
      entry = {
        topic: topicName,
        attempts: 0,
        incorrectTotal: 0,
        accuracySum: 0,
        recentIncorrectCount: 0,
        lastCompletedAt: null
      };
      byTopic.set(key, entry);
    }

    entry.attempts += 1;
    entry.incorrectTotal += incorrect;
    if (Number.isFinite(Number(row.percentage))) {
      entry.accuracySum += Number(row.percentage);
    }

    const completedAt = row.completedAt ? new Date(row.completedAt).getTime() : NaN;
    if (Number.isFinite(completedAt) && !Number.isNaN(completedAt)) {
      if (entry.lastCompletedAt == null || completedAt > entry.lastCompletedAt) {
        entry.lastCompletedAt = completedAt;
      }
      if (completedAt >= now - WEEK_MS) {
        entry.recentIncorrectCount += incorrect;
      }
    }
  }

  return [...byTopic.values()]
    .map((t) => ({
      topic: t.topic,
      attempts: t.attempts,
      incorrectTotal: t.incorrectTotal,
      recentIncorrectCount: t.recentIncorrectCount,
      accuracy: t.attempts > 0 ? Math.round(t.accuracySum / t.attempts) : 0,
      lastActivity: t.lastCompletedAt ? new Date(t.lastCompletedAt).toISOString() : null
    }))
    .filter((t) => t.incorrectTotal > 0)
    .sort(
      (a, b) =>
        b.incorrectTotal - a.incorrectTotal ||
        a.accuracy - b.accuracy ||
        (b.lastActivity || "").localeCompare(a.lastActivity || "")
    );
}