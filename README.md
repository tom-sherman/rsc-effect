# rsc-effect

An experiment in building React Server Components out of Effect, with the
framework kept behind an interface.

## The idea

A Server Component is just an async function that returns JSX. That is a small
enough surface that you can build one out of something other than `async` /
`await` — and once you do, everything Effect brings comes with it:

- **Services and layers** instead of module-level singletons and import-time
  side effects. A component asks for a `Database`; something else decides what
  that is.
- **Typed errors**, so "this component can fail, and here is how" is part of its
  signature rather than a convention.
- **Scoped resources** whose finalizers actually run, tied to the request rather
  than to the process.
- The rest of the kit — tracing, structured logging, retries, concurrency —
  applying to rendering the same way it applies to everything else.

```tsx
const RSC = RSCRuntime.make({ layer: AppLayer });

export default RSC.Component.make(function* Page() {
  const db = yield* Database;
  const users = yield* db.query("select name from users");

  return (
    <ul>
      {users.map((user) => (
        <li key={user}>{user}</li>
      ))}
    </ul>
  );
});
```

`make` takes an Effect just as happily as a generator, so there is no
combinator API to learn — catching, spans, retries and the rest are ordinary
`.pipe`:

```tsx
const User = RSC.Component.make((props: { handle: string }) =>
  Effect.gen(function* () {
    const db = yield* Database;
    return <p>{yield* db.findUser(props.handle)}</p>;
  }).pipe(
    Effect.catch((error) => Effect.succeed(<NotFound handle={error.handle} />)),
    Effect.withSpan("User"),
  ),
);
```

## One runtime per request

`RSC` is a module-hoisted singleton, but the `ManagedRuntime` underneath it is
not. One is built per request — memoized with React's `cache`, so every
component in a single render shares it — and disposed once the response is
finished. That is what makes request-scoped services request-scoped, and what
makes finalizers run at a moment that means something.

Resources are still shared where it matters. Effect's `MemoMap` refcounts
memoized layers, so a connection pool is built once and held for as long as
requests overlap, rather than rebuilt per request. It is refcounting and not a
singleton: an idle server tears the pool down and builds a new one on the next
request.

## Errors stop at the type level

`Component.make` will not accept a component whose error channel isn't `never`.

The reason is that React owns failure, not Effect. A component can only report
one by throwing to the nearest error boundary; there is no way to hand a typed
error back to the parent that rendered it. Nesting makes this sharper rather
than softer — a parent cannot catch what its child failed with, because it never
sees it.

So expected errors have to be discharged while still inside Effect, and making
that a compile error is what makes nesting safe: no component can leak one into
React, because none of them type-check until they've dealt with it.

Two things deliberately still escape:

- **Defects.** Nothing in the types said it could fail, so it goes to the error
  boundary, with the full `Cause` logged first — React only ever sees the
  squashed head, and parallel failures and span traces are otherwise lost.
- **Framework control flow.** `notFound()` and `redirect()` work by throwing.
  Effect captures those as defects, `Cause.squash` unwraps them back to the
  original object, and the framework gets exactly what it threw — never logged
  as an error, because they aren't one.

## Server functions

The same idea, on the other side of the boundary:

```ts
"use server";

export const rename = RSC.ServerFn.make({
  input: [UserId, Schema.NonEmptyString],
  handler: (id, name) => Effect.gen(function* () { ... }),
});
```

`input` describes the arguments — one schema for one argument, a tuple for
several. Callers pass encoded values, the handler receives decoded ones, and the
arity of both follows from `input`. A `Schema.fromFormData` input gives you a
function you can hand straight to `<form action={...}>`.

Unlike components, the error channel is unconstrained here: a caller awaiting a
promise can observe a rejection, which a rendering React cannot. Note that React
redacts the reason in production, so a typed error you want the caller to _read_
still belongs in the return value.

## Prior art

[Nikhil S Nayak's _Introducing Effective RSC_](https://www.nikhilsnayak.dev/blog/introducing-effective-rsc)
takes the idea further by building a whole new React framework with Effect woven
through it at every level — deeply integrated, and extremely cool. If you are
starting fresh that is the more powerful approach.

This project is a complementary, framework-agnostic spin on the same idea: a
thin adapter layer so you can write Effect-native components and server functions
once and drop them into an existing React framework — Next.js first, others by
writing a small adapter. You trade some of the depth of a ground-up integration
for portability and the ability to adopt incrementally inside a project that
already exists.

## What "framework-agnostic" means here

One file in `lib/rsc-effect` imports from Next.js, and nothing else does.
Everything the runtime needs from its host lives in one service:

```ts
export class RequestLifecycle extends Context.Service<
  RequestLifecycle,
  {
    readonly deferUntilResponseEnd: (task: () => Promise<void>) => void;
    readonly isControlFlowSignal: (defect: unknown) => boolean;
  }
>()("RSCRuntime/RequestLifecycle") {}
```

`deferUntilResponseEnd` is `after()` under Next and `waitUntil` on most edge
runtimes — it has to run the task even when the request failed, or runtimes
leak. `isControlFlowSignal` answers "is this thrown value the framework's
control flow rather than a real error?", which every framework needs some
answer to, because they all signal redirects by throwing.

`lib/rsc-effect/next.ts` is the entire Next.js adapter. Porting to another
framework means writing another one.

```
lib/rsc-effect/
  RSCRuntime.ts        the runtime: Component.make, ServerFn.make, runPromise
  RequestLifecycle.ts  what the runtime needs from its host
  next.ts              the Next.js adapter — the only Next import in the library
app/                   demos: nesting, expected errors, defects, notFound, server functions
```

## Caveats

This is an experiment, and some of it is load-bearing on things that are only
true today:

- Effect v4 is an RC. `repos/effect` vendors the matching source so the
  implementation can be read rather than guessed at — see `AGENTS.md`.
- React's `cache()` does nothing inside a Server Action (there is no dispatcher
  outside a render), so each entry point in an action builds its own runtime.
  They are disposed correctly and still share resources through the memo map,
  but "one runtime per request" is a rendering-time statement.
- With a shared memo map there are no per-request services at all — every layer
  in it is held by every request that overlaps. Per-request state means turning
  `shareResourcesAcrossRequests` off, which gives up the sharing entirely. See
  the first item below.

## Todo

- Find a better solution for `shareResourcesAcrossRequests`. It should be possible to have some services be shared across requests, and some not. Is having two different runtimes the right solution here?
- Make our own `<form action>` and `useActionState` wrappers that deal in effects instead of promises
