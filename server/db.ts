import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is required for Hocuspocus server");
}

const client = postgres(connectionString);
export const serverDb = drizzle(client);
