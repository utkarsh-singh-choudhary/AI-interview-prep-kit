import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient, type Db } from "mongodb";
import request from "supertest";
import { createApp } from "../src/app";
import type { KitDoc } from "../src/db/models";
import type { Kit } from "../src/domain/types";

let mongod: MongoMemoryServer;
let client: MongoClient;
let db: Db;
let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  client = new MongoClient(mongod.getUri());
  await client.connect();
  db = client.db("test");
  app = createApp(db);
});

afterAll(async () => {
  await client.close();
  await mongod.stop();
});

beforeEach(async () => {
  for (const name of await db.listCollections().toArray()) await db.collection(name.name).deleteMany({});
});

async function registerAndLogin(agent: any, email: string) {
  const res = await agent.post("/api/auth/register").send({ email, password: "password123" });
  expect(res.status).toBe(201);
  return res;
}

describe("auth", () => {
  it("registers, exposes /me, logs out, and rejects bad login", async () => {
    const agent = request.agent(app);
    await registerAndLogin(agent, "a@example.com");
    const me = await agent.get("/api/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe("a@example.com");

    await agent.post("/api/auth/logout");
    const meAfter = await agent.get("/api/auth/me");
    expect(meAfter.status).toBe(401);

    const badLogin = await request(app).post("/api/auth/login").send({ email: "a@example.com", password: "wrong" });
    expect(badLogin.status).toBe(401);
  });

  it("hashes passwords, never stores plaintext", async () => {
    const agent = request.agent(app);
    await registerAndLogin(agent, "hash@example.com");
    const user = await db.collection("users").findOne({ email: "hash@example.com" });
    expect(user!.passwordHash).not.toBe("password123");
    expect(user!.passwordHash.startsWith("$argon2")).toBe(true);
  });

  it("rejects duplicate registration", async () => {
    const agent = request.agent(app);
    await registerAndLogin(agent, "dup@example.com");
    const again = await request(app).post("/api/auth/register").send({ email: "dup@example.com", password: "password123" });
    expect(again.status).toBe(409);
  });
});

describe("kit endpoints require auth and enforce input validation", () => {
  it("401s without a session", async () => {
    expect((await request(app).get("/api/kits")).status).toBe(401);
  });
  it("validates create-kit input", async () => {
    const agent = request.agent(app);
    await registerAndLogin(agent, "v@example.com");
    expect((await agent.post("/api/kits").send({ jobDescription: "", companyUrl: "http://x/", daysAvailable: 3 })).status).toBe(400);
    expect((await agent.post("/api/kits").send({ jobDescription: "JD", companyUrl: "not-a-url", daysAvailable: 3 })).status).toBe(400);
    expect((await agent.post("/api/kits").send({ jobDescription: "JD", companyUrl: "http://x/", daysAvailable: 0 })).status).toBe(400);
  });
});

describe("user isolation", () => {
  it("users can only see and modify their own kits", async () => {
    const alice = request.agent(app); await registerAndLogin(alice, "alice@example.com");
    const bob = request.agent(app); await registerAndLogin(bob, "bob@example.com");

    const created = await alice.post("/api/kits").send({ jobDescription: "JD text", companyUrl: "http://acme.test/", daysAvailable: 3 });
    const kitId = created.body.kit.id;

    expect((await bob.get(`/api/kits/${kitId}`)).status).toBe(404);
    expect((await bob.delete(`/api/kits/${kitId}`)).status).toBe(404);
    expect((await alice.get(`/api/kits/${kitId}`)).status).toBe(200);

    const aliceList = await alice.get("/api/kits");
    const bobList = await bob.get("/api/kits");
    expect(aliceList.body.kits).toHaveLength(1);
    expect(bobList.body.kits).toHaveLength(0);
  });
});

describe("duplicate submission reuse", () => {
  it("reuses a ready kit for the same normalized (url, jd) pair", async () => {
    const agent = request.agent(app); await registerAndLogin(agent, "dupkit@example.com");
    const first = await agent.post("/api/kits").send({ jobDescription: "Same JD", companyUrl: "http://acme.test/x", daysAvailable: 3 });
    await db.collection<KitDoc>("kits").updateOne({ _id: (await db.collection("kits").findOne({}))!._id }, { $set: { status: "ready", kit: minimalKit() } });

    const second = await agent.post("/api/kits").send({ jobDescription: "  same jd  ", companyUrl: "http://acme.test/x/", daysAvailable: 3 });
    expect(second.body.reused).toBe(true);
    expect(second.body.kit.id).toBe(first.body.kit.id);
  });
});

describe("regeneration preserves edits", () => {
  it("keeps an edited question after regenerating its category", async () => {
    const agent = request.agent(app); await registerAndLogin(agent, "edit@example.com");
    const created = await agent.post("/api/kits").send({ jobDescription: "JD", companyUrl: "http://acme.test/", daysAvailable: 2 });
    const kitId = created.body.kit.id;
    await db.collection<KitDoc>("kits").updateOne({ _id: (await db.collection("kits").findOne({}))!._id }, { $set: { status: "ready", kit: minimalKit() } });

    const edit = await agent.patch(`/api/kits/${kitId}/questions/q1`).send({ prompt: "My custom answer" });
    expect(edit.status).toBe(200);
    const editedQ = edit.body.kit.questions.find((q: any) => q.id === "q1");
    expect(editedQ.prompt).toBe("My custom answer");
    expect(editedQ.editState).toBe("edited");

    process.env.LLM_BASE_URL = "http://fake"; process.env.LLM_API_KEY = "k"; process.env.LLM_MODEL = "m";
    (globalThis as any).fetch = async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify({ questions: [] }) } }] }) });
    const regen = await agent.post(`/api/kits/${kitId}/regenerate/questions`).send({ category: "technical" });
    expect(regen.status).toBe(200);
    const stillThere = regen.body.kit.questions.find((q: any) => q.id === "q1");
    expect(stillThere.prompt).toBe("My custom answer");
  });
});

function minimalKit(): Kit {
  return {
    source: { company: "Acme", company_url: "http://acme.test/", role: "Eng", location: "", jd_chars: 2, researched_at: new Date().toISOString(), pages_used: [] },
    company_brief: { summary: "s", what_they_do: "w", sources: [] },
    role: { title: "Eng", seniority: "senior", responsibilities: [], requirements: [{ id: "r1", text: "React", kind: "technical", priority: "must" }] },
    questions: [{ id: "q1", requirement_ids: ["r1"], category: "technical", prompt: "Original", answer_outline: "o", difficulty: 2, editState: "generated" }],
    flashcards: [{ id: "f1", front: "a", back: "b", requirement_ids: ["r1"] }],
    schedule: { days_available: 2, days: [{ day: 1, focus: "f", question_ids: ["q1"], minutes: 30 }, { day: 2, focus: "f", question_ids: [], minutes: 30 }] },
    coverage: { uncovered_requirement_ids: [], passes: 1 },
  };
}
