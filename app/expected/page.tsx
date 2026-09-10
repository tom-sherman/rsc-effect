import { Effect } from "effect";
import { Database } from "../services";
import { RSC } from "../runtime";

/**
 * Handled inside the generator. By the time the component returns, the error
 * channel is `never` and React is none the wiser.
 */
const HandledInline = RSC.Component.make(function* HandledInline() {
  const db = yield* Database;

  const name = yield* Effect.catchTag(
    db.findUser("grace"),
    "UserNotFound",
    (error) => Effect.succeed(`no such user: ${error.handle}`),
  );

  return <p className="font-mono text-sm">{name}</p>;
});

/**
 * Handled at the component boundary. A body can return an Effect instead of
 * being a generator, so combinators are plain `.pipe` — nothing special to
 * learn, and `error` is still `UserNotFound` rather than `unknown`.
 */
const HandledAtBoundary = RSC.Component.make(function HandledAtBoundary() {
  return Effect.gen(function* () {
    const db = yield* Database;
    const name = yield* db.findUser("barbara");
    return <p className="font-mono text-sm">{name}</p>;
  }).pipe(
    Effect.catch((error) =>
      Effect.succeed(
        <p className="font-mono text-sm text-amber-600">
          fallback for {error.handle}
        </p>,
      ),
    ),
    Effect.withSpan("HandledAtBoundary"),
  );
});

/** The happy path, for contrast. */
const Found = RSC.Component.make(function* Found() {
  const db = yield* Database;
  const name = yield* Effect.catchTag(db.findUser("ada"), "UserNotFound", () =>
    Effect.succeed("unreachable"),
  );
  return <p className="font-mono text-sm">{name}</p>;
});

export default RSC.Component.make(function* ExpectedErrorsPage() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 px-8 py-24">
      <h1 className="text-2xl font-semibold tracking-tight">Expected errors</h1>
      <p className="max-w-prose text-sm leading-6 text-zinc-500">
        None of these reach an error boundary. They are values in the error
        channel, dealt with while still inside Effect.
      </p>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-zinc-500">Effect.catchTag</h2>
        <HandledInline />
        <h2 className="text-sm font-medium text-zinc-500">Effect.catch</h2>
        <HandledAtBoundary />
        <h2 className="text-sm font-medium text-zinc-500">no error</h2>
        <Found />
      </section>
    </main>
  );
});
