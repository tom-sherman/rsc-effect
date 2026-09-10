import { Context, Effect, Layer, Schema } from "effect";

/** An expected error: part of the domain, and part of the type. */
export class UserNotFound extends Schema.TaggedError<UserNotFound>()(
  "UserNotFound",
  {
    handle: Schema.String,
  },
) {}

/**
 * A stand-in for something with a real lifecycle — a connection pool, a client
 * that needs closing. This one goes in the runtime's `shared` layer, so the
 * acquire log appears once, on the first request, and the release log not at
 * all until the process ends.
 */
export class Database extends Context.Service<
  Database,
  {
    readonly poolId: string;
    readonly query: (sql: string) => Effect.Effect<ReadonlyArray<string>>;
    readonly findUser: (handle: string) => Effect.Effect<string, UserNotFound>;
  }
>()("app/Database") {}

export const DatabaseLive = Layer.effect(Database)(
  Effect.gen(function* () {
    const poolId = yield* Effect.acquireRelease(
      Effect.sync(() => {
        const id = Math.random().toString(36).slice(2, 8);
        console.log(`\x1b[32m[pool ${id}] acquired\x1b[0m`);
        return id;
      }),
      (id) =>
        Effect.sync(() => console.log(`\x1b[31m[pool ${id}] released\x1b[0m`)),
    );

    return {
      poolId,
      query: Effect.fnUntraced(function* (sql: string) {
        yield* Effect.log(`query: ${sql}`);
        yield* Effect.sleep("50 millis");
        return ["ada", "grace", "barbara"] as ReadonlyArray<string>;
      }),

      findUser: Effect.fnUntraced(function* (handle: string) {
        yield* Effect.log(`findUser: ${handle}`);
        if (handle !== "ada") {
          return yield* new UserNotFound({ handle });
        }
        return "Ada Lovelace";
      }),
    };
  }),
);

/**
 * The other half: this one goes in the `request` layer, so it is built again
 * for every request and torn down with the response. Two concurrent requests
 * see two different ids and the same {@link Database}.
 */
export class RequestId extends Context.Service<
  RequestId,
  {
    readonly value: string;
  }
>()("app/RequestId") {}

export const RequestIdLive = Layer.effect(RequestId)(
  Effect.acquireRelease(
    Effect.sync(() => {
      const value = crypto.randomUUID().slice(0, 8);
      console.log(`\x1b[36m[request ${value}] opened\x1b[0m`);
      return { value };
    }),
    ({ value }) =>
      Effect.sync(() =>
        console.log(`\x1b[35m[request ${value}] closed\x1b[0m`),
      ),
  ),
);
