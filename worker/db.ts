import postgres from 'postgres'
import type { Env } from './env'

/**
 * A connection to the database through Hyperdrive. Hyperdrive keeps the real connections pooled near the database, so
 * each request or batch opens its own small client and closes it when done (`sql.end()`).
 */
export function db(env: Env) {
  return postgres(env.HYPERDRIVE.connectionString, {
    max: 5,
    // Hyperdrive does not need the type lookup round trip
    fetch_types: false,
  })
}

export type Sql = ReturnType<typeof db>
