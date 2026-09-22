import "dotenv/config";
import { createApp } from "./app";
import { getDb } from "./db/mongo";

async function main() {
  const db = await getDb();
  const app = createApp(db);
  const port = Number(process.env.PORT ?? 4000);
  app.listen(port, () => console.log(`AI Interview Prep Kit API listening on :${port}`));
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
