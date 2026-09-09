import { Effect, Layer, ManagedRuntime } from "effect"
import { cache } from "react"
import type { ReactNode } from "react"
import { RequestLifecycle } from "./RequestLifecycle"

export interface RSCRuntime<R, E> {
  /**
   * Build a Server Component from an Effect generator.
   *
   * The returned function is an ordinary `async` component — Next.js, React,
   * and the RSC serializer see nothing unusual about it.
   */
  readonly Component: {
    // `any` in the yield/args positions matches how Effect types `gen` and
    // `fn` themselves: narrowing them here breaks inference at the call site.
    /* eslint-disable @typescript-eslint/no-explicit-any */
    readonly make: <
      Eff extends Effect.Effect<any, any, R | RequestLifecycle>,
      A extends ReactNode,
      Args extends Array<any>
    >(
      body: (...args: Args) => Generator<Eff, A, never>
    ) => (...args: Args) => Promise<A>
    /* eslint-enable @typescript-eslint/no-explicit-any */
  }

  /**
   * Run an effect against this request's runtime.
   *
   * For Server Functions and Route Handlers, where you want the same services
   * and the same per-request lifetime but are not rendering.
   */
  readonly runPromise: <A, EX extends E>(
    effect: Effect.Effect<A, EX, R | RequestLifecycle>
  ) => Promise<A>

  /** The layer this runtime was built from. Handy for tests. */
  readonly layer: Layer.Layer<R | RequestLifecycle, E, never>
}

export interface Options<R, E> {
  readonly layer: Layer.Layer<R | RequestLifecycle, E, never>

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
  readonly shareResourcesAcrossRequests?: boolean | undefined
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
  const memoMap = options.shareResourcesAcrossRequests === false
    ? undefined
    : Layer.makeMemoMapUnsafe()

  /**
   * `cache` is React's per-request memoization, so every component in a single
   * render shares one runtime — and each request gets its own.
   */
  const acquire = cache(() => {
    const runtime = ManagedRuntime.make(options.layer, { memoMap })

    // Registering disposal is itself an effect, because the only way to reach
    // the injected lifecycle implementation is through the layer.
    const ready = runtime.runPromise(
      Effect.flatMap(RequestLifecycle, (lifecycle) =>
        Effect.sync(() => {
          lifecycle.deferUntilResponseEnd(() => runtime.dispose())
        }))
    )

    return { runtime, ready }
  })

  const runPromise = async <A, EX extends E>(
    effect: Effect.Effect<A, EX, R | RequestLifecycle>
  ): Promise<A> => {
    const { runtime, ready } = acquire()
    // Await registration before running anything, so a failure mid-render can
    // never leave an undisposed runtime behind.
    await ready
    return runtime.runPromise(effect)
  }

  return {
    layer: options.layer,
    runPromise,
    Component: {
      make: (body) => {
        const toEffect = Effect.fnUntraced(body)
        return (...args) => runPromise(toEffect(...args) as never)
      }
    }
  }
}
