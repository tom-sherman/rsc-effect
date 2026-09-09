import { Cause, Effect, Exit, Layer, ManagedRuntime } from "effect"
import { cache } from "react"
import type { ReactNode } from "react"
import { RequestLifecycle } from "./RequestLifecycle"

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Extracts the error channel from the union of effects a generator yields. */
type ErrorOf<Eff> = [Eff] extends [never] ? never
  : [Eff] extends [Effect.Effect<any, infer E, any>] ? E
  : never

export interface RSCRuntime<R, E> {
  readonly Component: {
    /**
     * Build a Server Component from an Effect generator.
     *
     * The error channel must be `never`. React has no way to hand a typed
     * failure back to you — it only knows how to throw at an error boundary —
     * so expected errors have to be dealt with while still inside Effect.
     * Handle them in the generator, pass `onError` to render a fallback, or
     * say `Effect.orDie` to declare them genuinely unexpected.
     *
     * Defects are left alone and reach the nearest error boundary.
     */
    readonly make: {
      <
        Eff extends Effect.Effect<any, never, R | RequestLifecycle>,
        A extends ReactNode,
        Args extends Array<any>
      >(
        body: (...args: Args) => Generator<Eff, A, never>
      ): (...args: Args) => Promise<A>

      <
        Eff extends Effect.Effect<any, any, R | RequestLifecycle>,
        A extends ReactNode,
        Args extends Array<any>,
        AError extends ReactNode
      >(
        body: (...args: Args) => Generator<Eff, A, never>,
        options: { readonly onError: (error: ErrorOf<Eff>) => AError }
      ): (...args: Args) => Promise<A | AError>
    }
  }

  /**
   * Run an effect against this request's runtime.
   *
   * For Server Functions and Route Handlers. Unlike `Component.make` this
   * accepts any error channel and rejects on failure, because outside of
   * rendering you are usually the one catching.
   */
  readonly runPromise: <A, EX>(
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
    // the injected framework adapter is through the layer.
    const ready = runtime.runPromise(
      Effect.flatMap(RequestLifecycle, (lifecycle) =>
        Effect.sync(() => {
          lifecycle.deferUntilResponseEnd(() => runtime.dispose())
          return lifecycle
        }))
    )

    return { runtime, ready }
  })

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
          : Effect.logError(Cause.pretty(cause))))

  const runPromise = async <A, EX>(
    effect: Effect.Effect<A, EX, R | RequestLifecycle>
  ): Promise<A> => {
    const { runtime, ready } = acquire()
    // Await registration before running anything, so a failure mid-render can
    // never leave an undisposed runtime behind.
    await ready

    const exit = await runtime.runPromiseExit(logEscaping(effect))
    if (Exit.isSuccess(exit)) return exit.value

    // `Cause.squash` unwraps a defect back to the value that was originally
    // thrown. That is what makes `notFound()` and `redirect()` survive the trip
    // through Effect: Next receives the exact object it threw.
    throw Cause.squash(exit.cause)
  }

  return {
    layer: options.layer,
    runPromise,
    Component: {
      make: (
        body: (...args: Array<any>) => Generator<any, ReactNode, never>,
        options?: { readonly onError: (error: any) => ReactNode }
      ) => {
        const toEffect = Effect.fnUntraced(body)
        const onError = options?.onError
        return (...args: Array<any>) => {
          const effect = toEffect(...args)
          const handled = onError === undefined
            ? effect
            : Effect.catch(effect, (error) => Effect.succeed(onError(error)))
          // The public overloads above are what enforce the contract; this cast
          // only bridges the erased implementation signature.
          return runPromise(handled as Effect.Effect<ReactNode, unknown, R | RequestLifecycle>)
        }
      }
    } as RSCRuntime<R, E>["Component"]
  }
}
