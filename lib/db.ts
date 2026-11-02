import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import * as schema from "@/db/schema";

export type DB = DrizzleD1Database<typeof schema>;
export { schema };

/**
 * A cached drizzle handle bound to the Cloudflare D1 database. Call from
 * server components, route handlers, and actions only.
 */
let _db: DB | undefined;

export function db(): DB {
  if (!_db) {
    const env = getCloudflareContext().env as unknown as Cloudflare.Env;
    _db = drizzle(env.DB, { schema });
  }
  return _db;
}

export const now = () => Date.now();