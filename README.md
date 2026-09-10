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
const RSC = RSCRuntime.make({
  shared: DatabaseLive,
  request: Layer.mergeAll(CurrentUserLive, layerRequestLifecycle),
});

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

## Two lifetimes, two layers

A pool should be built once. A request id should be built every time. Both are
services, so the difference has to live somewhere, and the natural place is the
thing that already describes how services are built:

```ts
RSCRuntime.make({
  shared: Layer.mergeAll(DatabaseLive, HttpClientLive),
  request: Layer.mergeAll(CurrentUserLive, layerRequestLifecycle),
});
```

`shared` is built once, on the first request, into a runtime that lives as long
as the process. Nothing refcounts it, so an idle server does not tear the pool
down and rebuild it on the next request.

`request` is built again for every request, into a `Scope` that closes once the
response is finished. Its finalizers run at a moment that means something, and
its services cannot bleed between requests because there is nothing to bleed
through. Within one render the build is memoized by React's `cache`, so every
component sees the same one.

The dependency edge goes one way — `request` may use anything in `shared`, and
`Layer`'s own types enforce it — which is another way of saying the split is not
a new concept. It is the one `Layer` already had, given a lifetime.

That request scope is also handed to the effects that run inside it, so an
`acquireRelease` in a component body is released with the response without
having to become a layer first:

```tsx
RSC.Component.make(function* Report() {
  const file = yield* Effect.acquireRelease(open("report.csv"), close);
  return <pre>{yield* file.read()}</pre>;
});
```

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
  onInputError: (error) => Effect.succeed({ _tag: "Invalid", ... } as const),
});
```

`input` describes the arguments — one schema for one argument, a tuple for
several. Callers pass encoded values, the handler receives decoded ones, and the
arity of both follows from `input`. A `Schema.fromFormData` input gives you a
function you can hand straight to `<form action={...}>`.

The error channel must be `never` here too, and for a related reason: the
boundary carries values, not effects. In production a rejected promise reaches
the client as a digest and nothing else — no tag, no fields, no message — so a
typed error left in the channel is a type that lies about what the caller can do
with it. It is also not the runtime's to send: a failure may carry a connection
string, a row, another user's data. What crosses the boundary should be a
choice.

So discharge expected errors into the return value, which is what React and Next
recommend independently of Effect —
[model expected errors as return values](https://nextjs.org/docs/app/getting-started/error-handling#server-functions):

```ts
handler: (id) =>
  Effect.match(findUser(id), {
    onFailure: (error) => ({ ok: false, reason: error._tag }) as const,
    onSuccess: (user) => ({ ok: true, user }) as const,
  });
```

Input that fails to decode goes to `onInputError`, which is mandatory and has no
default. A server function is a public HTTP endpoint — anyone holding an action
id can post anything at it, and Next
[says as much](https://nextjs.org/docs/app/guides/authentication): treat them
"with the same security considerations as public-facing API endpoints". So
malformed input is ordinary traffic rather than a broken caller, and the answer
is a decision only you can make. A `SchemaError` names your fields, their types
and often their expected values, so echoing one is a choice, not a default:

```ts
onInputError: (error) =>
  Effect.succeed(SchemaIssue.makeFormatterStandardSchemaV1()(error.issue));
```

Its result joins the handler's in the success channel, so callers get
`Promise<A | B>` — tag both sides if they need telling apart. `Effect.die` is a
perfectly good answer too, when a bad argument really does mean your own code is
wrong and you want the error boundary; because it returns `never` the union
doesn't widen.

What is left is only a defect, which rejects and means what a 500 means. The
runtime logs it at error level, and logs an escaping _failure_ at debug — the
only route to one is `runPromise`, whose error channel is open, and error-level
logging of expected traffic hands anyone with `curl` a way to fill your log.

`useActionState` needs no wrapper for any of this. It wants an action shaped
`(previous, formData)`, which is just a two-schema `input` tuple — and since the
previous state is posted back by the client on every submission, giving it a
schema is not ceremony, it is the same untrusted-input rule applied to the state
itself:

```ts
input: [SubmitState, Schema.fromFormData(...)],
handler: (_previous, { note, times }) => …,        // -> { _tag: "Added",   … }
onInputError: (error) => Effect.succeed(…),        // -> { _tag: "Invalid", … }
```

Both arms meet in the success channel, React hands whichever it got back to the
form as `state`, and nothing was thrown, so nothing is redacted in production.
It works with JavaScript disabled too.

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
  outside a render), so each entry point in an action builds its own request
  layer. Each is closed correctly, and they all share the same `shared`
  services, but "one build per request" is a rendering-time statement.
- The shared runtime is never disposed by anything but `RSC.dispose()`, which a
  server never calls. If a shared service needs to survive a hot reload or be
  torn down on a signal, that is still yours to arrange.

## Todo

- Make our own `<form action>` and `useActionState` wrappers that deal in effects instead of promises
