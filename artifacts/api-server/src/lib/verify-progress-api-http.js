import "../env.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";

async function verifyProgressApiHttp() {
  console.log("Starting Live Progress Summary HTTP API Verification...");
  await fetch("http://localhost:5000/api/test/reset-rate-limits", { method: "POST" }).catch(() => {});

  const user1Id = "sum-qa-" + Date.now() + "-1";
  const user2Id = "sum-qa-" + Date.now() + "-2";
  const hash = await bcrypt.hash("TestPassword123!", 10);

  const email1 = "sum-qa1-" + Date.now() + "@example.com";
  const email2 = "sum-qa2-" + Date.now() + "@example.com";
  await db.insert(usersTable).values([
    { id: user1Id, email: email1, passwordHash: hash },
    { id: user2Id, email: email2, passwordHash: hash }
  ]);

  const token1 = jwt.sign({ id: user1Id, email: email1 }, process.env.JWT_SECRET);
  const token2 = jwt.sign({ id: user2Id, email: email2 }, process.env.JWT_SECRET);

  // 1. Verify user 2 (empty account) returns safe zero/null values
  const emptyRes = await fetch("http://localhost:5000/api/progress/summary", {
    headers: { Authorization: "Bearer " + token2 }
  });
  const emptyData = await emptyRes.json();
  console.log("1. Empty user 2 summary:", emptyRes.status, JSON.stringify(emptyData));

  // 2. Create session & data for user 1
  const sess1 = await fetch("http://localhost:5000/api/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token1 },
    body: JSON.stringify({ title: "Summary Verification Session" })
  }).then((r) => r.json());

  // Upload a document so weak topics can be attributed to a document filename
  const form = new FormData();
  form.append("file", new Blob(["Photosynthesis notes line one.\nLight reactions line two.\nCellular respiration line three.\n"], { type: "text/plain" }), "photosynthesis.txt");
  const docData = await fetch("http://localhost:5000/api/sessions/" + sess1.id + "/documents", {
    method: "POST",
    headers: { Authorization: "Bearer " + token1 },
    body: form
  }).then((r) => r.json());
  console.log("Document uploaded:", JSON.stringify(docData));

  // Post 1 completed quiz (PERFECT) for user 1 — must NOT appear as a weak topic
  await fetch("http://localhost:5000/api/sessions/" + sess1.id + "/quizzes/results", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token1 },
    body: JSON.stringify({
      quizId: "quiz-sum-perfect",
      totalQuestions: 4,
      score: 4,
      percentage: 100,
      answerState: { 1: "A", 2: "B", 3: "C", 4: "D" }
    })
  });

  // Post 1 completed quiz scored 50% without a document => fall back to session title topic
  await fetch("http://localhost:5000/api/sessions/" + sess1.id + "/quizzes/results", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token1 },
    body: JSON.stringify({
      quizId: "quiz-sum-weak",
      totalQuestions: 4,
      score: 2,
      percentage: 50,
      answerState: { 1: "A", 2: "B", 3: "C", 4: "D" }
    })
  });

  // Post 1 completed quiz scored 50% attributed to the document => weak topic "photosynthesis"
  await fetch("http://localhost:5000/api/sessions/" + sess1.id + "/quizzes/results", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token1 },
    body: JSON.stringify({
      quizId: "quiz-sum-docweak",
      documentId: docData.id,
      totalQuestions: 4,
      score: 2,
      percentage: 50,
      answerState: { 1: "A", 2: "B", 3: "C", 4: "D" }
    })
  });

  // Post 2 flashcard review statuses for user 1
  await fetch("http://localhost:5000/api/sessions/" + sess1.id + "/flashcards/progress", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token1 },
    body: JSON.stringify({
      progress: [
        { cardId: "c1", status: "known" },
        { cardId: "c2", status: "review" }
      ]
    })
  });

  // 3. Request progress summary for user 1
  const user1Res = await fetch("http://localhost:5000/api/progress/summary", {
    headers: { Authorization: "Bearer " + token1 }
  });
  const user1Data = await user1Res.json();
  console.log("2. User 1 summary status:", user1Res.status, JSON.stringify(user1Data, null, 2));

  // 3b. Weak topics must contain the document-derived topic, exclude the perfect quiz,
  //     and attribute the doc-less quiz to the session title.
  const weakTopics = user1Data.weakTopics ?? [];
  console.log("Weak topics derived:", JSON.stringify(weakTopics));
  const docTopic = weakTopics.find((t) => t.topic === "photosynthesis");
  if (!docTopic) throw new Error("Expected weak topic 'photosynthesis' in summary");
  if (docTopic.incorrectTotal !== 2) throw new Error("photosynthesis incorrectTotal must be 2");
  if (docTopic.accuracy !== 50) throw new Error("photosynthesis accuracy must be 50");
  const sessionTopic = weakTopics.find((t) => t.topic === "Summary Verification Session");
  if (!sessionTopic) throw new Error("Expected session-title topic to appear as weak (doc-less quiz)");
  if (sessionTopic.incorrectTotal !== 2) throw new Error("session-topic incorrectTotal must be 2");
  const perfectQuizInWeakTopics = weakTopics.some((t) => t.incorrectTotal === 0);
  if (perfectQuizInWeakTopics) throw new Error("Perfect-score quizzes must not create weak topics");
  if (user1Data.totalCompletedQuizzes !== 3) throw new Error("totalCompletedQuizzes must be 3");

  // 4. Confirm user 2 STILL sees 0 data (Cross-user isolation)
  const user2Res2 = await fetch("http://localhost:5000/api/progress/summary", {
    headers: { Authorization: "Bearer " + token2 }
  });
  const user2Data2 = await user2Res2.json();
  console.log("3. User 2 summary after User 1 activity:", user2Res2.status, JSON.stringify(user2Data2));

  // 5. Verify no raw answerState is exposed
  const hasAnswerState = JSON.stringify(user1Data).includes("answerState");
  console.log("4. raw answerState exposed in summary:", hasAnswerState, "(Must be false)");

  // Cleanup session
  await fetch("http://localhost:5000/api/sessions/" + sess1.id, {
    method: "DELETE",
    headers: { Authorization: "Bearer " + token1 }
  });
}

verifyProgressApiHttp().catch(console.error);
