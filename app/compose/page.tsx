import { Effect } from "effect";
import type { ReactNode } from "react";
import { RSC } from "../runtime";
import { Database, UserNotFound } from "../services";

/**
 * A piece of UI as an ordinary value: an Effect that returns JSX.
 *
 * Look at the error channel — this is *allowed* to fail. A component may not
 * be, because React would own the failure. Here whoever composes it owns the
 * failure instead, and so gets to decide what it means.
 */
const userRow = (
  handle: string,
): Effect.Effect<ReactNode, UserNotFound, Database> =>
  Effect.gen(function* () {
    const db = yield* Database;
    const name = yield* db.findUser(handle);
    return (
      <li key={handle} className="font-mono text-sm">
        {name}
      </li>
    );
  });

/**
 * Policy 1: all or nothing. One missing user replaces the entire list.
 *
 * This is the part nesting cannot express. A `<UserRow />` would have had to
 * deal with its own failure long before the parent saw it, and a React error
 * boundary here would cost a client component and the error's type.
 */
const strictRoster = (handles: ReadonlyArray<string>) =>
  Effect.all(handles.map(userRow), { concurrency: "unbounded" }).pipe(
    // Each row carries its own `key`, which the rule cannot see through the Effect.
    // eslint-disable-next-line react/jsx-key
    Effect.map((rows) => <ul className="flex flex-col gap-1">{rows}</ul>),
    Effect.catchTag("UserNotFound", (error) =>
      Effect.succeed(
        <p className="font-mono text-sm text-amber-600">
          roster unavailable — no {error.handle}
        </p>,
      ),
    ),
  );

/** Policy 2: the same rows, recovered one by one. Same pieces, different call. */
const lenientRoster = (handles: ReadonlyArray<string>) =>
  Effect.forEach(
    handles,
    (handle) =>
      userRow(handle).pipe(
        Effect.catchTag("UserNotFound", (error) =>
          Effect.succeed(
            <li key={handle} className="font-mono text-sm text-amber-600">
              {error.handle} — missing
            </li>,
          ),
        ),
      ),
    { concurrency: "unbounded" },
  ).pipe(
    // As above.
    // eslint-disable-next-line react/jsx-key
    Effect.map((rows) => <ul className="flex flex-col gap-1">{rows}</ul>),
  );

/**
 * A fragment with nothing left in its error channel is already a component in
 * everything but name. `make` only asks for the `() =>`, because props have to
 * arrive somewhere — the whole cost of not accepting a bare Effect.
 */
const Roster = RSC.Component.make(() => strictRoster(["ada"]));

export default RSC.Component.make(function* ComposePage() {
  const strict = yield* strictRoster(["ada", "grace"]);
  const lenient = yield* lenientRoster(["ada", "grace", "barbara"]);
  const happy = yield* strictRoster(["ada"]);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 px-8 py-24">
      <h1 className="text-2xl font-semibold tracking-tight">Composed UI</h1>
      <p className="max-w-prose text-sm leading-6 text-zinc-500">
        None of these are components. They are <code>Effect</code> values that
        return JSX, composed with the ordinary operators — so failures stay in
        the error channel, and the caller picks the recovery policy rather than
        the fragment picking it for everyone.
      </p>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-zinc-500">
          Effect.all — one missing user sinks the list
        </h2>
        {strict}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-zinc-500">
          Effect.forEach — recovered row by row
        </h2>
        {lenient}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-zinc-500">
          the same fragments, all present
        </h2>
        {happy}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-zinc-500">
          lifted back into a component
        </h2>
        <Roster />
      </section>
    </main>
  );
});
