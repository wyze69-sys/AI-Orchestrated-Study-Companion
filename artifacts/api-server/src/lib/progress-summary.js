import { db, studySessionsTable, quizResultsTable, flashcardProgressTable, documentsTable } from "@workspace/db";
import { eq, and, isNull, desc, sql } from "drizzle-orm";
import { calculateStreakMetrics } from "./streak-utils.js";
import { aggregateWeakTopics } from "./weak-topics.js";

export { calculateStreakMetrics };
export { aggregateWeakTopics };

export async function getProgressSummary(userId) {
  if (!userId) {
    throw new Error("userId is required for progress summary");
  }

  // 1. Total active sessions count for user
  const [sessionCountRow] = await db
    .select({ cnt: sql`COUNT(*)` })
    .from(studySessionsTable)
    .where(
      and(
        eq(studySessionsTable.userId, userId),
        isNull(studySessionsTable.deletedAt)
      )
    );
  const totalSessions = Number(sessionCountRow?.cnt ?? 0);

  // 2. Quiz results aggregation for user (excluding soft-deleted sessions)
  const [quizAggRow] = await db
    .select({
      totalQuizzes: sql`COUNT(*)`,
      avgPct: sql`AVG(${quizResultsTable.percentage})`,
      bestPct: sql`MAX(${quizResultsTable.percentage})`
    })
    .from(quizResultsTable)
    .innerJoin(
      studySessionsTable,
      eq(quizResultsTable.sessionId, studySessionsTable.id)
    )
    .where(
      and(
        eq(quizResultsTable.userId, userId),
        eq(studySessionsTable.userId, userId),
        isNull(studySessionsTable.deletedAt)
      )
    );

  const totalCompletedQuizzes = Number(quizAggRow?.totalQuizzes ?? 0);
  const averageQuizPercentage = totalCompletedQuizzes > 0
    ? Math.round(Number(quizAggRow?.avgPct ?? 0))
    : 0;
  const bestQuizPercentage = totalCompletedQuizzes > 0
    ? Number(quizAggRow?.bestPct ?? 0)
    : 0;

  // 3. Flashcard progress aggregation for user (excluding soft-deleted sessions)
  const [fcAggRow] = await db
    .select({
      totalReviewed: sql`COUNT(*)`,
      knownCount: sql`COUNT(*) FILTER (WHERE ${flashcardProgressTable.status} = 'known')`,
      reviewCount: sql`COUNT(*) FILTER (WHERE ${flashcardProgressTable.status} = 'review')`
    })
    .from(flashcardProgressTable)
    .innerJoin(
      studySessionsTable,
      eq(flashcardProgressTable.sessionId, studySessionsTable.id)
    )
    .where(
      and(
        eq(flashcardProgressTable.userId, userId),
        eq(studySessionsTable.userId, userId),
        isNull(studySessionsTable.deletedAt)
      )
    );

  const totalFlashcardsReviewed = Number(fcAggRow?.totalReviewed ?? 0);
  const knownFlashcardsCount = Number(fcAggRow?.knownCount ?? 0);
  const reviewAgainFlashcardsCount = Number(fcAggRow?.reviewCount ?? 0);

  // 4. Activity timestamps for streak calculation (quiz completion & flashcard reviews)
  const [quizTimestamps, fcTimestamps] = await Promise.all([
    db
      .select({ completedAt: quizResultsTable.completedAt, updatedAt: quizResultsTable.updatedAt })
      .from(quizResultsTable)
      .innerJoin(
        studySessionsTable,
        eq(quizResultsTable.sessionId, studySessionsTable.id)
      )
      .where(
        and(
          eq(quizResultsTable.userId, userId),
          eq(studySessionsTable.userId, userId),
          isNull(studySessionsTable.deletedAt)
        )
      ),
    db
      .select({ updatedAt: flashcardProgressTable.updatedAt, createdAt: flashcardProgressTable.createdAt })
      .from(flashcardProgressTable)
      .innerJoin(
        studySessionsTable,
        eq(flashcardProgressTable.sessionId, studySessionsTable.id)
      )
      .where(
        and(
          eq(flashcardProgressTable.userId, userId),
          eq(studySessionsTable.userId, userId),
          isNull(studySessionsTable.deletedAt)
        )
      )
  ]);

  const activityTimestamps = [
    ...quizTimestamps.map((q) => q.completedAt || q.updatedAt),
    ...fcTimestamps.map((f) => f.updatedAt || f.createdAt)
  ];

  const streakMetrics = calculateStreakMetrics(activityTimestamps);

  // 5. Latest completed quiz activity
  const [latestQuizRow] = await db
    .select()
    .from(quizResultsTable)
    .innerJoin(
      studySessionsTable,
      eq(quizResultsTable.sessionId, studySessionsTable.id)
    )
    .where(
      and(
        eq(quizResultsTable.userId, userId),
        eq(studySessionsTable.userId, userId),
        isNull(studySessionsTable.deletedAt)
      )
    )
    .orderBy(desc(quizResultsTable.completedAt), desc(quizResultsTable.updatedAt))
    .limit(1);

  const qResult = latestQuizRow?.quiz_results;
  const latestQuiz = qResult
    ? {
        id: qResult.id,
        quizId: qResult.quizId,
        sessionId: qResult.sessionId,
        documentId: qResult.documentId ?? null,
        messageId: qResult.messageId ?? null,
        totalQuestions: qResult.totalQuestions,
        score: qResult.score,
        percentage: qResult.percentage,
        completedAt: qResult.completedAt
      }
    : null;

  // 6. Latest flashcard activity
  const [latestFcRow] = await db
    .select()
    .from(flashcardProgressTable)
    .innerJoin(
      studySessionsTable,
      eq(flashcardProgressTable.sessionId, studySessionsTable.id)
    )
    .where(
      and(
        eq(flashcardProgressTable.userId, userId),
        eq(studySessionsTable.userId, userId),
        isNull(studySessionsTable.deletedAt)
      )
    )
    .orderBy(desc(flashcardProgressTable.updatedAt), desc(flashcardProgressTable.createdAt))
    .limit(1);

  const fcProgress = latestFcRow?.flashcard_progress;
  const latestFlashcardActivity = fcProgress
    ? {
        id: fcProgress.id,
        cardId: fcProgress.cardId,
        sessionId: fcProgress.sessionId,
        status: fcProgress.status,
        updatedAt: fcProgress.updatedAt
      }
    : null;

  // 7. Weak topics from quiz results + document metadata (excluding soft-deleted sessions)
  const weakTopicRows = await db
    .select({
      totalQuestions: quizResultsTable.totalQuestions,
      score: quizResultsTable.score,
      percentage: quizResultsTable.percentage,
      completedAt: quizResultsTable.completedAt,
      documentFilename: documentsTable.filename,
      sessionTitle: studySessionsTable.title
    })
    .from(quizResultsTable)
    .innerJoin(
      studySessionsTable,
      eq(quizResultsTable.sessionId, studySessionsTable.id)
    )
    .leftJoin(
      documentsTable,
      eq(quizResultsTable.documentId, documentsTable.id)
    )
    .where(
      and(
        eq(quizResultsTable.userId, userId),
        eq(studySessionsTable.userId, userId),
        isNull(studySessionsTable.deletedAt)
      )
    );

  const weakTopics = aggregateWeakTopics(weakTopicRows);

  return {
    totalSessions,
    totalCompletedQuizzes,
    averageQuizPercentage,
    bestQuizPercentage,
    totalFlashcardsReviewed,
    knownFlashcardsCount,
    reviewAgainFlashcardsCount,
    ...streakMetrics,
    weakTopics,
    recentActivity: {
      latestQuiz,
      latestFlashcardActivity
    }
  };
}
