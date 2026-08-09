import "../env.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";

async function verifyApiHttp() {
  console.log("Starting Live HTTP API Verification...");
  await fetch("http://localhost:5000/api/test/reset-rate-limits", { method: "POST" }).catch(() => {});

  const user1Id = "user-qa-" + Date.now() + "-1";
  const user2Id = "user-qa-" + Date.now() + "-2";
  const hash = await bcrypt.hash("TestPassword123!", 10);

  const email1 = "qa1-" + Date.now() + "@example.com";
  const email2 = "qa2-" + Date.now() + "@example.com";
  await db.insert(usersTable).values([
    { id: user1Id, email: email1, passwordHash: hash },
    { id: user2Id, email: email2, passwordHash: hash }
  ]);

  const token1 = jwt.sign({ id: user1Id, email: email1 }, process.env.JWT_SECRET);
  const token2 = jwt.sign({ id: user2Id, email: email2 }, process.env.JWT_SECRET);

  const sess1 = await fetch("http://localhost:5000/api/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token1 },
    body: JSON.stringify({ title: "QA Verification Session" })
  }).then((r) => r.json());

  console.log("Session created ID:", sess1.id);

  // 1. GET progress for owned session -> 200
  const get1 = await fetch("http://localhost:5000/api/sessions/" + sess1.id + "/flashcards/progress", {
    headers: { Authorization: "Bearer " + token1 }
  });
  console.log("1. GET owned session progress status:", get1.status, await get1.json());

  // 2. POST valid status -> 200
  const postValid = await fetch("http://localhost:5000/api/sessions/" + sess1.id + "/flashcards/progress", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token1 },
    body: JSON.stringify({ cardId: "card-101", status: "known" })
  });
  console.log("2. POST valid status status:", postValid.status, await postValid.json());

  // 3. POST invalid status -> 400
  const postInvalid = await fetch("http://localhost:5000/api/sessions/" + sess1.id + "/flashcards/progress", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token1 },
    body: JSON.stringify({ cardId: "card-101", status: "super-known" })
  });
  console.log("3. POST invalid status status:", postInvalid.status, await postInvalid.json());

  // 4. Cross-user access -> 404
  const crossUserGet = await fetch("http://localhost:5000/api/sessions/" + sess1.id + "/flashcards/progress", {
    headers: { Authorization: "Bearer " + token2 }
  });
  console.log("4. Cross-user GET status:", crossUserGet.status, await crossUserGet.json());

  const crossUserPost = await fetch("http://localhost:5000/api/sessions/" + sess1.id + "/flashcards/progress", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token2 },
    body: JSON.stringify({ cardId: "card-101", status: "known" })
  });
  console.log("4. Cross-user POST status:", crossUserPost.status, await crossUserPost.json());

  // 5. DELETE reset -> 200
  const delReset = await fetch("http://localhost:5000/api/sessions/" + sess1.id + "/flashcards/progress", {
    method: "DELETE",
    headers: { Authorization: "Bearer " + token1 }
  });
  console.log("5. DELETE reset status:", delReset.status, await delReset.json());

  // Cleanup session
  await fetch("http://localhost:5000/api/sessions/" + sess1.id, {
    method: "DELETE",
    headers: { Authorization: "Bearer " + token1 }
  });
}

verifyApiHttp().catch(console.error);
