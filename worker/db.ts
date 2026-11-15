import postgres from 'postgres'
import type { Env } from './env'

/**
 * A connection to the database through Hyperdrive. Hyperdrive keeps the real connections pooled near the database, so
 * each request or batch opens its own small client and closes it when done (`sql.end()`).
 *
 * Every query is a tagged template (sql`… ${value} …`): values always travel as parameters, never as SQL text, so
 * nothing a visitor types can change a query. Each transaction also sets its own time limits (`set local`), so a slow
 * or stuck database answers with an error instead of holding the visitor or a lock.
 */
export function db(env: Env) {
  return postgres(env.HYPERDRIVE.connectionString, {
    max: 5,
    // Hyperdrive does not need the type lookup round trip
    fetch_types: false,
    // give up on a database that does not answer, rather than wait the default 30 s
    connect_timeout: 10,
    onnotice: () => {},
  })
}

export type Sql = ReturnType<typeof db>
