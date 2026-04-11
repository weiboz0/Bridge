import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const connectionString = process.env.DATABASE_URL || "postgresql://work@127.0.0.1:5432/bridge";
const client = postgres(connectionString);
export const serverDb = drizzle(client);
