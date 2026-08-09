import "../env.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { db, usersTable, studySessionsTable, quizResultsTable, flashcardProgressTable } from "@workspace/db";

async function verifyStreakApiHttp() {
  console.log("Starting Live Study Streak HTTP API Verification...");
  await fetch("http://localhost:5000/api/test/reset-rate-limits", { method: "POST" }).catch(() => {});

  const user1Id = "streak-qa-" + Date.now() + "-1";
  const user2Id = "streak-qa-" + Date.now() + "-2";
  const hash = await bcrypt.hash("TestPassword123!", 10);

  const email1 = "streak-qa1-" + Date.now() + "@example.com";
  const email2 = "streak-qa2-" + Date.now() + "@example.com";
  await db.insert(usersTable).values([
    { id: user1Id, email: email1, passwordHash: hash },
    { id: user2Id, email: email2, passwordHash: hash }
  ]);

  const token1 = jwt.sign({ id: user1Id, email: email1 }, process.env.JWT_SECRET);
  const token2 = jwt.sign({ id: user2Id, email: email2 }, process.env.JWT_SECRET);

  // 1. Authenticate as User 1 with no activity -> confirm all zeros/null
  const emptyRes = await fetch("http://localhost:5000/api/progress/summary", {
    headers: { Authorization: "Bearer " + token1 }
  });
  const emptyData = await emptyRes.json();
  console.log("1. User 1 empty streak metrics:", emptyRes.status, {
    currentStreak: emptyData.currentStreak,
    longestStreak: emptyData.longestStreak,
    activeStudyDays: emptyData.activeStudyDays,
    lastStudyDate: emptyData.lastStudyDate,
    streakDates: emptyData.streakDates
  });

  // 2. Create active session for User 1
  const sess1 = await fetch("http://localhost:5000/api/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token1 },
    body: JSON.stringify({ title: "Streak Verification Active Session" })
  }).then((r) => r.json());

  // Post quiz result today (User 1)
  await fetch("http://localhost:5000/api/sessions/" + sess1.id + "/quizzes/results", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token1 },
    body: JSON.stringify({
      quizId: "quiz-streak-1",
      totalQuestions: 3,
      score: 3,
      percentage: 100,
      answerState: { 1: "A", 2: "B", 3: "C" }
    })
  });

  // Post 2 flashcard activities today (User 1) -> multiple activities on same day
  await fetch("http://localhost:5000/api/sessions/" + sess1.id + "/flashcards/progress", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token1 },
    body: JSON.stringify({
      progress: [
        { cardId: "sc1", status: "known" },
        { cardId: "sc2", status: "review" }
      ]
    })
  });

  // 3. Verify User 1 summary metrics (deduplication on today)
  const todayRes = await fetch("http://localhost:5000/api/progress/summary", {
    headers: { Authorization: "Bearer " + token1 }
  });
  const todayData = await todayRes.json();
  console.log("2. User 1 streak metrics after today's multiple activities:", todayRes.status, {
    currentStreak: todayData.currentStreak,
    longestStreak: todayData.longestStreak,
    activeStudyDays: todayData.activeStudyDays,
    lastStudyDate: todayData.lastStudyDate
  });

  // 4. Create a soft-deleted session for User 1 with quiz activity on a historical date
  const delSess = await db.insert(studySessionsTable).values({
    id: crypto.randomUUID(),
    userId: user1Id,
    title: "Deleted Session",
    deletedAt: new Date()
  }).returning();

  await db.insert(quizResultsTable).values({
    id: crypto.randomUUID(),
    userId: user1Id,
    sessionId: delSess[0].id,
    quizId: "quiz-del-1",
    totalQuestions: 2,
    score: 2,
    percentage: 100,
    answerState: {},
    completedAt: new Date(Date.now() - 86400000 * 5)
  });

  const afterDelRes = await fetch("http://localhost:5000/api/progress/summary", {
    headers: { Authorization: "Bearer " + token1 }
  });
  const afterDelData = await afterDelRes.json();
  console.log("3. User 1 streak metrics after deleted session activity:", {
    activeStudyDays: afterDelData.activeStudyDays,
    isDeletedSessionExcluded: afterDelData.activeStudyDays === 1
  });

  // 5. Verify User 2 cannot see User 1's streak metrics
  const user2Res = await fetch("http://localhost:5000/api/progress/summary", {
    headers: { Authorization: "Bearer " + token2 }
  });
  const user2Data = await user2Res.json();
  console.log("4. User 2 streak metrics (Cross-user isolation):", {
    currentStreak: user2Data.currentStreak,
    activeStudyDays: user2Data.activeStudyDays
  });

  // Cleanup
  await fetch("http://localhost:5000/api/sessions/" + sess1.id, {
    method: "DELETE",
    headers: { Authorization: "Bearer " + token1 }
  });
}

verifyStreakApiHttp().catch(console.error);
