import { Effect } from "effect";
import { Database, RequestId } from "./services";
import { RSC } from "./runtime";

/**
 * A nested Effect component, with props. The generator takes exactly one
 * argument — the props object React passes — and its type flows out to the
 * component, so `<UserList />` without a query is a compile error.
 */
const UserList = RSC.Component.make(function* UserList({
  query,
}: {
  query: string;
}) {
  const db = yield* Database;
  const users = yield* db.query(query);

  return (
    <ul className="flex flex-col gap-1">
      {users.map((user) => (
        <li
          key={user}
          className="font-mono text-sm text-zinc-700 dark:text-zinc-300"
        >
          {user}
        </li>
      ))}
    </ul>
  );
});

export default RSC.Component.make(function* Page() {
  const requestId = yield* RequestId;
  const db = yield* Database;

  yield* Effect.log("rendering page");

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 px-8 py-24">
      <h1 className="text-2xl font-semibold tracking-tight">RSC + Effect</h1>

      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
        <dt className="text-zinc-500">request</dt>
        <dd className="font-mono">{requestId.value}</dd>
        <dt className="text-zinc-500">pool</dt>
        <dd className="font-mono">{db.poolId}</dd>
      </dl>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-zinc-500">
          from a nested component
        </h2>
        <UserList query="select name from users" />
      </section>

      <p className="max-w-prose text-sm leading-6 text-zinc-500">
        Reload and watch: the request id changes, the pool id does not. The pool
        is in the shared layer, acquired on the first request and held for the
        life of the process; the request id is in the request layer, built again
        for every one and released with the response.
      </p>

      <nav className="flex flex-col gap-1 text-sm">
        <a className="underline underline-offset-4" href="/expected">
          /expected — handled in Effect, never reaches a boundary
        </a>
        <a className="underline underline-offset-4" href="/defect">
          /defect — a crash, caught by error.tsx
        </a>
        <a className="underline underline-offset-4" href="/compose">
          /compose — JSX-returning Effects, composed instead of nested
        </a>
        <a className="underline underline-offset-4" href="/server-fn">
          /server-fn — schema-checked Server Functions
        </a>
        <a className="underline underline-offset-4" href="/missing">
          /missing — notFound() thrown inside an Effect
        </a>
      </nav>
    </main>
  );
});
