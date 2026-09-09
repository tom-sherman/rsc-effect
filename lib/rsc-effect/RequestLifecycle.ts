import { Context, Effect, Layer } from "effect"

/**
 * The one thing `RSCRuntime` needs from its host framework: a way to schedule
 * work for after the response has been sent.
 *
 * Next.js provides this via `after()`. Other frameworks provide their own
 * equivalent (`waitUntil` on most edge runtimes, an `onResponseEnd` hook, or
 * just running the task immediately in a plain Node server). Injecting it as a
 * service keeps the runtime itself framework-agnostic.
 */
export class RequestLifecycle extends Context.Service<RequestLifecycle, {
  /**
   * Schedule a task to run once the response is finished.
   *
   * Implementations must not throw, and must still run the task when the
   * request errored — otherwise runtimes leak.
   */
  readonly deferUntilResponseEnd: (task: () => Promise<void>) => void
}>()("RSCRuntime/RequestLifecycle") {}

/**
 * Runs deferred tasks immediately instead of after the response.
 *
 * Only appropriate for tests and scripts. In a real server this disposes the
 * runtime while the response is still streaming.
 */
export const layerImmediate = Layer.succeed(RequestLifecycle)({
  deferUntilResponseEnd: (task) => {
    void task()
  }
})

/**
 * Schedule a task to run after the response finishes, from inside an Effect.
 *
 * Useful for the same things `after()` is useful for — logging, analytics,
 * cache warming — but with access to the runtime's services.
 */
export const deferUntilResponseEnd = (
  task: () => Promise<void>
): Effect.Effect<void, never, RequestLifecycle> =>
  Effect.flatMap(RequestLifecycle, (lifecycle) =>
    Effect.sync(() => lifecycle.deferUntilResponseEnd(task)))
