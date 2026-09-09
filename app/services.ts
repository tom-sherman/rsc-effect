import { Context, Effect, Layer } from "effect"

/**
 * A stand-in for something with a real lifecycle — a connection pool, a client
 * that needs closing. The acquire/release logs are the point: they show when
 * the runtime is actually built and torn down.
 */
export class Database extends Context.Service<Database, {
  readonly poolId: string
  readonly query: (sql: string) => Effect.Effect<ReadonlyArray<string>>
}>()("app/Database") {}

export const DatabaseLive = Layer.effect(Database)(
  Effect.gen(function* () {
    const poolId = yield* Effect.acquireRelease(
      Effect.sync(() => {
        const id = Math.random().toString(36).slice(2, 8)
        console.log(`\x1b[32m[pool ${id}] acquired\x1b[0m`)
        return id
      }),
      (id) => Effect.sync(() => console.log(`\x1b[31m[pool ${id}] released\x1b[0m`))
    )

    return {
      poolId,
      query: Effect.fnUntraced(function* (sql: string) {
        yield* Effect.log(`query: ${sql}`)
        yield* Effect.sleep("50 millis")
        return ["ada", "grace", "barbara"] as ReadonlyArray<string>
      })
    }
  })
)

/**
 * Built once per request. If two components see the same id, they shared a
 * runtime; if a reload shows a new id, the runtime was per-request.
 */
export class RequestId extends Context.Service<RequestId, {
  readonly value: string
}>()("app/RequestId") {}

export const RequestIdLive = Layer.effect(RequestId)(
  Effect.sync(() => ({ value: crypto.randomUUID().slice(0, 8) }))
)
