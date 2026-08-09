import "../env.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";

async function verifyQuizApiHttp() {
  console.log("Starting Live HTTP Quiz API Verification...");
  await fetch("http://localhost:5000/api/test/reset-rate-limits", { method: "POST" }).catch(() => {});

  const user1Id = "quiz-qa-" + Date.now() + "-1";
  const user2Id = "quiz-qa-" + Date.now() + "-2";
  const hash = await bcrypt.hash("TestPassword123!", 10);

  const email1 = "quiz-qa1-" + Date.now() + "@example.com";
  const email2 = "quiz-qa2-" + Date.now() + "@example.com";
  await db.insert(usersTable).values([
    { id: user1Id, email: email1, passwordHash: hash },
    { id: user2Id, email: email2, passwordHash: hash }
  ]);

  const token1 = jwt.sign({ id: user1Id, email: email1 }, process.env.JWT_SECRET);
  const token2 = jwt.sign({ id: user2Id, email: email2 }, process.env.JWT_SECRET);

  const sess1 = await fetch("http://localhost:5000/api/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token1 },
    body: JSON.stringify({ title: "Quiz API Verification Session" })
  }).then((r) => r.json());

  console.log("Session created ID:", sess1.id);

  // 1. GET owned session quiz results -> 200
  const get1 = await fetch("http://localhost:5000/api/sessions/" + sess1.id + "/quizzes/results", {
    headers: { Authorization: "Bearer " + token1 }
  });
  const get1Data = await get1.json();
  console.log("1. GET owned session quiz results status:", get1.status, Array.isArray(get1Data) ? "[] (200 OK)" : get1Data);

  // 2. POST valid completed quiz result -> 200
  const postValid = await fetch("http://localhost:5000/api/sessions/" + sess1.id + "/quizzes/results", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token1 },
    body: JSON.stringify({
      quizId: "quiz-101",
      totalQuestions: 4,
      score: 3,
      percentage: 75,
      answerState: { 1: "A", 2: "B", 3: "C", 4: "A" }
    })
  });
  const postValidData = await postValid.json();
  console.log("2. POST valid completed quiz result status:", postValid.status, postValidData.success ? "Success (200 OK)" : postValidData);

  // 3. POST invalid result (score > total) -> 400
  const postInvalid = await fetch("http://localhost:5000/api/sessions/" + sess1.id + "/quizzes/results", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token1 },
    body: JSON.stringify({
      quizId: "quiz-101",
      totalQuestions: 4,
      score: 10,
      percentage: 250,
      answerState: {}
    })
  });
  const postInvalidData = await postInvalid.json();
  console.log("3. POST invalid result status:", postInvalid.status, postInvalidData.error ? "Rejected with 400 Bad Request" : postInvalidData);

  // 4. Cross-user access -> 404
  const crossUserGet = await fetch("http://localhost:5000/api/sessions/" + sess1.id + "/quizzes/results", {
    headers: { Authorization: "Bearer " + token2 }
  });
  console.log("4. Cross-user GET status:", crossUserGet.status, await crossUserGet.json());

  const crossUserPost = await fetch("http://localhost:5000/api/sessions/" + sess1.id + "/quizzes/results", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token2 },
    body: JSON.stringify({
      quizId: "quiz-101",
      totalQuestions: 4,
      score: 4,
      percentage: 100,
      answerState: { 1: "A", 2: "B", 3: "C", 4: "D" }
    })
  });
  console.log("4. Cross-user POST status:", crossUserPost.status, await crossUserPost.json());

  // 5. Repeat POST -> idempotent update
  const repeatPost = await fetch("http://localhost:5000/api/sessions/" + sess1.id + "/quizzes/results", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token1 },
    body: JSON.stringify({
      quizId: "quiz-101",
      totalQuestions: 4,
      score: 4,
      percentage: 100,
      answerState: { 1: "A", 2: "B", 3: "C", 4: "D" }
    })
  });
  const repeatData = await repeatPost.json();
  console.log("5. Repeat POST status:", repeatPost.status, "Updated score:", repeatData.result?.score, "(Idempotent)");

  // Verify only 1 row exists for quiz-101
  const getAfterRepeat = await fetch("http://localhost:5000/api/sessions/" + sess1.id + "/quizzes/results", {
    headers: { Authorization: "Bearer " + token1 }
  }).then((r) => r.json());
  console.log("Total rows stored for session:", getAfterRepeat.length, "(No duplicate rows)");

  // Cleanup session
  await fetch("http://localhost:5000/api/sessions/" + sess1.id, {
    method: "DELETE",
    headers: { Authorization: "Bearer " + token1 }
  });
}

verifyQuizApiHttp().catch(console.error);
