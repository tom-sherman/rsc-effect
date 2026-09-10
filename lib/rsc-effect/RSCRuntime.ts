import { Cause, Effect, Exit, Layer, ManagedRuntime, Schema } from "effect";
import { cache } from "react";
import type { ReactNode } from "react";
import { RequestLifecycle } from "./RequestLifecycle";

/*
 * `any` mirrors the variance holes in Effect's own `gen`/`fn` signatures —
 * narrowing them breaks inference. `{}` is deliberate too: it is the exact
 * "no required props" check React's own types use, and `object` would not
 * distinguish a component that needs props from one that does not.
 */
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-empty-object-type */

/**
 * The intrinsic %GeneratorFunction%, which has no global binding of its own.
 * Used to tell `make`'s two body forms apart once, rather than per render.
 */
const GeneratorFunction = Object.getPrototypeOf(function* () {}).constructor;

/** What a component must be by the time React sees it: renderable, infallible. */
type Rendered<A, R> = Effect.Effect<A, never, R | RequestLifecycle>;

/**
 * A Server Component.
 *
 * Props stay optional in the call signature when the body declares none, so a
 * component without props is still callable as `Page()` and not just `<Page />`.
 */
type Component<P, A> = {} extends P
  ? (props?: P) => Promise<A>
  : (props: P) => Promise<A>;

/** Any schema, so long as decoding it needs nothing the runtime cannot provide. */
type AnySchema<RD> = Schema.ConstraintCodec<any, any, RD, any>;

/**
 * A server function's arguments: one schema for a one-argument function, or a
 * tuple of schemas for several.
 */
type SchemaInput<RD> = AnySchema<RD> | ReadonlyArray<AnySchema<RD>>;

/** The argument list as the caller passes it — encoded, straight off the wire. */
type EncodedArgs<Input> =
  Input extends ReadonlyArray<AnySchema<any>>
    ? {
        -readonly [K in keyof Input]: Input[K] extends AnySchema<any>
          ? Input[K]["Encoded"]
          : never;
      }
    : [Input extends AnySchema<any> ? Input["Encoded"] : never];

/** The argument list as the handler receives it — decoded. */
type DecodedArgs<Input> =
  Input extends ReadonlyArray<AnySchema<any>>
    ? {
        -readonly [K in keyof Input]: Input[K] extends AnySchema<any>
          ? Input[K]["Type"]
          : never;
      }
    : [Input extends AnySchema<any> ? Input["Type"] : never];

export interface RSCRuntime<R, E> {
  readonly Component: {
    /**
     * Build a Server Component from a body that takes props: either a
     * generator, or a function returning an Effect.
     *
     * The error channel must be `never`. React has no way to hand a typed
     * failure back to you — it only knows how to throw at an error boundary —
     * so expected errors have to be dealt with while still inside Effect.
     *
     * The generator form is the short one, for a component that only needs its
     * services:
     *
     * ```ts
     * RSC.Component.make(function* User({ handle }: Props) {
     *   return <p>{yield* (yield* Database).find(handle)}</p>;
     * });
     * ```
     *
     * Anything else — catching errors, adding a span, retrying — is an Effect
     * you built however you liked, so combinators are just `.pipe`:
     *
     * ```ts
     * RSC.Component.make((props: Props) =>
     *   Effect.gen(function* () {
     *     return <p>{yield* (yield* Database).find(props.handle)}</p>;
     *   }).pipe(
     *     Effect.catch((error) => Effect.succeed(<NotFound {...error} />)),
     *     Effect.withSpan("User"),
     *   ),
     * );
     * ```
     *
     * Defects are left alone and reach the nearest error boundary.
     */
    readonly make: {
      <
        Eff extends Effect.Effect<any, never, R | RequestLifecycle>,
        A extends ReactNode,
        P extends object = {},
      >(
        body: (props: P) => Generator<Eff, A, never>,
      ): Component<P, A>;

      <A extends ReactNode, P extends object = {}>(
        body: (props: P) => Rendered<A, R>,
      ): Component<P, A>;
    };
  };

  readonly ServerFn: {
    /**
     * Build a Server Function from a schema and an Effect handler.
     *
     * `input` describes the arguments: one schema for one argument, a tuple of
     * schemas for several. The caller passes encoded values, the handler
     * receives decoded ones, and the arity of both follows from `input`.
     *
     * ```ts
     * "use server";
     *
     * export const rename = RSC.ServerFn.make({
     *   input: [UserId, Schema.String],
     *   handler: (id, name) => Effect.gen(function* () {
     *     yield* (yield* Database).rename(id, name);
     *   }),
     * });
     * ```
     *
     * Unlike `Component.make` the error channel is unconstrained: a failure
     * rejects the promise the caller is awaiting, which is something a client
     * can actually observe. Be aware that React redacts the reason in
     * production, so a typed error you want the caller to *read* should be
     * discharged into the return value — `Effect.catch` inside `handler` — not
     * left in the error channel.
     *
     * Input that fails to decode rejects before `handler` runs.
     */
    readonly make: <
      const Input extends SchemaInput<R | RequestLifecycle>,
      A,
      EX,
    >(options: {
      readonly input: Input;
      readonly handler: (
        ...input: DecodedArgs<Input>
      ) => Effect.Effect<A, EX, R | RequestLifecycle>;
    }) => (...args: EncodedArgs<Input>) => Promise<A>;
  };

  /**
   * Run an effect against this request's runtime.
   *
   * For Server Functions and Route Handlers. Unlike `Component.make` this
   * accepts any error channel and rejects on failure, because outside of
   * rendering you are usually the one catching.
   */
  readonly runPromise: <A, EX>(
    effect: Effect.Effect<A, EX, R | RequestLifecycle>,
  ) => Promise<A>;

  /** The layer this runtime was built from. Handy for tests. */
  readonly layer: Layer.Layer<R | RequestLifecycle, E, never>;
}

export interface Options<R, E> {
  readonly layer: Layer.Layer<R | RequestLifecycle, E, never>;

  /**
   * Share layer-built resources across concurrent requests. Defaults to `true`.
   *
   * Effect's `MemoMap` refcounts memoized layers: each request's runtime adds an
   * observer, and a layer's own scope closes only when the last observer goes
   * away. So a connection pool is built once and shared while requests overlap,
   * rather than rebuilt per request.
   *
   * The flip side is that it is refcounting, not a singleton — when the server
   * goes idle the count hits zero and the pool is torn down, then rebuilt on the
   * next request. If you need something to live for the whole process, build it
   * outside this runtime.
   *
   * Set to `false` for full per-request isolation.
   */
  readonly shareResourcesAcrossRequests?: boolean | undefined;
}

/**
 * Create a module-hoisted runtime for Server Components.
 *
 * ```ts
 * const RSC = RSCRuntime.make({ layer: AppLayer })
 *
 * export default RSC.Component.make(function* () {
 *   const db = yield* Database
 *   return <ul>{...}</ul>
 * })
 * ```
 *
 * The `RSCRuntime` value is a singleton, but the `ManagedRuntime` underneath it
 * is not: one is created per request (memoized with React's `cache`) and
 * disposed via {@link RequestLifecycle} once the response is finished. That is
 * what keeps request-scoped services from bleeding between requests, and what
 * makes finalizers actually run.
 */
export const make = <R, E>(options: Options<R, E>): RSCRuntime<R, E> => {
  const memoMap =
    options.shareResourcesAcrossRequests === false
      ? undefined
      : Layer.makeMemoMapUnsafe();

  /**
   * `cache` is React's per-request memoization, so every component in a single
   * render shares one runtime — and each request gets its own.
   */
  const acquire = cache(() => {
    const runtime = ManagedRuntime.make(options.layer, { memoMap });

    // Registering disposal is itself an effect, because the only way to reach
    // the injected framework adapter is through the layer.
    const ready = runtime.runPromise(
      Effect.flatMap(RequestLifecycle, (lifecycle) =>
        Effect.sync(() => {
          lifecycle.deferUntilResponseEnd(() => runtime.dispose());
          return lifecycle;
        }),
      ),
    );

    return { runtime, ready };
  });

  /**
   * Anything that gets this far is escaping to React, which will only ever see
   * the squashed head of the cause. Log the whole thing first — parallel
   * failures and span traces are otherwise lost — unless it is the framework's
   * own control flow, which is not an error at all.
   */
  const logEscaping = <A, EX, RX>(effect: Effect.Effect<A, EX, RX>) =>
    Effect.tapCause(effect, (cause) =>
      Effect.flatMap(RequestLifecycle, (lifecycle) =>
        lifecycle.isControlFlowSignal(Cause.squash(cause))
          ? Effect.void
          : Effect.logError(Cause.pretty(cause)),
      ),
    );

  const runPromise = async <A, EX>(
    effect: Effect.Effect<A, EX, R | RequestLifecycle>,
  ): Promise<A> => {
    const { runtime, ready } = acquire();
    // Await registration before running anything, so a failure mid-render can
    // never leave an undisposed runtime behind.
    await ready;

    const exit = await runtime.runPromiseExit(logEscaping(effect));
    if (Exit.isSuccess(exit)) return exit.value;

    // `Cause.squash` unwraps a defect back to the value that was originally
    // thrown. That is what makes `notFound()` and `redirect()` survive the trip
    // through Effect: Next receives the exact object it threw.
    throw Cause.squash(exit.cause);
  };

  return {
    layer: options.layer,
    runPromise,
    Component: {
      make: (body: any) => {
        // Both forms end in an Effect, but by different routes, and which one
        // this is never changes — so decide once, here, rather than per
        // render. The alternative, a wrapper generator delegating to whatever
        // the body returned, makes every `yield*` in that body pay to be
        // forwarded twice.
        //
        // The public overloads are what enforce the contract; the assertion
        // below only bridges the erased implementation signature.
        const toEffect = (
          body instanceof GeneratorFunction
            ? Effect.fnUntraced(body)
            : // `suspend` so that a body throwing while it builds its effect
              // is a defect we log, rather than a bare throw at React.
              (props: any) => Effect.suspend(() => body(props))
        ) as (
          props: any,
        ) => Effect.Effect<ReactNode, never, R | RequestLifecycle>;

        const Component = (props: any) => runPromise(toEffect(props));

        // Name the component after the body, so it shows up as itself in React
        // DevTools and server stack traces rather than as an anonymous arrow.
        // `function* UserList()` is worth the keystrokes.
        Component.displayName =
          body.name || body.displayName || "RSC.Component";

        return Component;
      },
    } as RSCRuntime<R, E>["Component"],

    ServerFn: {
      make: ({
        input,
        handler,
      }: {
        input: any;
        handler: (...input: Array<any>) => Effect.Effect<any, any, any>;
      }) => {
        // Decoding the whole argument list as one tuple collapses the
        // single-argument and multi-argument cases onto the same path.
        const args = Schema.Tuple(Array.isArray(input) ? input : [input]);
        const decode = Schema.decodeUnknownEffect(args);

        return (...received: Array<unknown>) =>
          runPromise(
            Effect.flatMap(decode(received), (decoded) => handler(...decoded)),
          );
      },
    } as RSCRuntime<R, E>["ServerFn"],
  };
};
