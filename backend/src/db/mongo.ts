import { MongoClient, type Db } from "mongodb";

let client: MongoClient | undefined;
let db: Db | undefined;

/** Lazily connects once and reuses the connection. Call closeDb() in tests/shutdown. */
export async function getDb(): Promise<Db> {
  if (db) return db;
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");
  client = new MongoClient(uri);
  await client.connect();
  db = client.db();
  await ensureIndexes(db);
  return db;
}

export async function closeDb(): Promise<void> {
  await client?.close();
  client = undefined;
  db = undefined;
}

async function ensureIndexes(database: Db): Promise<void> {
  await database.collection("users").createIndex({ email: 1 }, { unique: true });
  await database.collection("sessions").createIndex({ token: 1 }, { unique: true });
  await database.collection("sessions").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  await database.collection("kits").createIndex({ userId: 1, createdAt: -1 });
  await database.collection("kits").createIndex({ userId: 1, inputHash: 1 });
}
