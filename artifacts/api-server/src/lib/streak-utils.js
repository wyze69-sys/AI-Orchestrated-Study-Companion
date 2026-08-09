/**
 * UTC Date string helper (YYYY-MM-DD)
 */
export function getUtcDateStr(input) {
  try {
    const d = new Date(input);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

export function getUtcDateDiffDays(dateStrA, dateStrB) {
  const tA = Date.parse(dateStrA + "T00:00:00.000Z");
  const tB = Date.parse(dateStrB + "T00:00:00.000Z");
  return Math.round((tB - tA) / (86400 * 1000));
}

export function addUtcDays(dateStr, days) {
  const t = Date.parse(dateStr + "T00:00:00.000Z");
  const d = new Date(t + days * 86400 * 1000);
  return d.toISOString().slice(0, 10);
}

export function createEmptyStreakMetrics() {
  return {
    currentStreak: 0,
    longestStreak: 0,
    activeStudyDays: 0,
    lastStudyDate: null,
    streakDates: []
  };
}

/**
 * Pure calculation logic for study streak metrics based on UTC calendar dates.
 *
 * @param {Array<Date|string|number>} timestamps - Raw activity timestamps from completed quizzes or flashcards
 * @param {Date|string|number} [nowInput] - Reference current date (defaults to Date.now())
 */
export function calculateStreakMetrics(timestamps = [], nowInput = new Date()) {
  const nowUtcDateStr = getUtcDateStr(nowInput);
  if (!nowUtcDateStr) {
    return createEmptyStreakMetrics();
  }

  const validDates = [];
  for (const ts of timestamps) {
    if (!ts) continue;
    const dateStr = getUtcDateStr(ts);
    if (!dateStr) continue;
    // Exclude future dates
    if (dateStr > nowUtcDateStr) continue;
    validDates.push(dateStr);
  }

  if (validDates.length === 0) {
    return createEmptyStreakMetrics();
  }

  const uniqueDateSet = new Set(validDates);
  const sortedDates = Array.from(uniqueDateSet).sort();

  const activeStudyDays = sortedDates.length;
  const lastStudyDate = sortedDates[sortedDates.length - 1];

  let longestStreak = 0;
  let currentRun = 0;
  let prevDate = null;

  for (const dateStr of sortedDates) {
    if (!prevDate) {
      currentRun = 1;
    } else {
      const diffDays = getUtcDateDiffDays(prevDate, dateStr);
      if (diffDays === 1) {
        currentRun += 1;
      } else {
        currentRun = 1;
      }
    }
    if (currentRun > longestStreak) {
      longestStreak = currentRun;
    }
    prevDate = dateStr;
  }

  const yesterdayUtcStr = addUtcDays(nowUtcDateStr, -1);
  let currentStreak = 0;

  let startSearchDate = null;
  if (uniqueDateSet.has(nowUtcDateStr)) {
    startSearchDate = nowUtcDateStr;
  } else if (uniqueDateSet.has(yesterdayUtcStr)) {
    startSearchDate = yesterdayUtcStr;
  }

  if (startSearchDate) {
    let curr = startSearchDate;
    while (uniqueDateSet.has(curr)) {
      currentStreak += 1;
      curr = addUtcDays(curr, -1);
    }
  }

  return {
    currentStreak,
    longestStreak,
    activeStudyDays,
    lastStudyDate,
    streakDates: sortedDates
  };
}
