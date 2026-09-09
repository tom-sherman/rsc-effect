import { Effect } from "effect"
import { Database, RequestId } from "./services"
import { RSC } from "./runtime"

/**
 * A nested Effect component. It resolves `RequestId` independently, and gets
 * the same value as the page — same request, same runtime.
 */
const UserList = RSC.Component.make(function* () {
  const db = yield* Database
  const users = yield* db.query("select name from users")

  return (
    <ul className="flex flex-col gap-1">
      {users.map((user) => (
        <li key={user} className="font-mono text-sm text-zinc-700 dark:text-zinc-300">
          {user}
        </li>
      ))}
    </ul>
  )
})

export default RSC.Component.make(function* () {
  const requestId = yield* RequestId
  const db = yield* Database

  yield* Effect.log("rendering page")

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
        <h2 className="text-sm font-medium text-zinc-500">from a nested component</h2>
        <UserList />
      </section>

      <p className="max-w-prose text-sm leading-6 text-zinc-500">
        Reload and watch the server logs: the pool is acquired once and released
        after the response, not during it.
      </p>
    </main>
  )
})
