import { Context, Effect, Layer } from "effect";

/**
 * Everything `RSCRuntime` needs from its host framework, injected as a service
 * so the runtime itself stays framework-agnostic.
 */
export class RequestLifecycle extends Context.Service<
  RequestLifecycle,
  {
    /**
     * Schedule a task to run once the response is finished.
     *
     * Next.js provides this via `after()`; most edge runtimes call it `waitUntil`.
     * Implementations must not throw, and must still run the task when the
     * request errored — otherwise runtimes leak.
     */
    readonly deferUntilResponseEnd: (task: () => Promise<void>) => void;

    /**
     * Is this thrown value the framework's control flow rather than a real error?
     *
     * `notFound()`, `redirect()` and friends work by throwing. Effect faithfully
     * captures those as defects, and they must reach the framework untouched — so
     * we never treat them as errors, and never log them as such.
     */
    readonly isControlFlowSignal: (defect: unknown) => boolean;
  }
>()("RSCRuntime/RequestLifecycle") {}

/**
 * Runs deferred tasks immediately and treats nothing as control flow.
 *
 * Only appropriate for tests and scripts. In a real server this disposes the
 * runtime while the response is still streaming.
 */
export const layerImmediate = Layer.succeed(RequestLifecycle)({
  deferUntilResponseEnd: (task) => {
    void task();
  },
  isControlFlowSignal: () => false,
});

/**
 * Schedule a task to run after the response finishes, from inside an Effect.
 *
 * Useful for the same things `after()` is useful for — logging, analytics,
 * cache warming — but with access to the runtime's services.
 */
export const deferUntilResponseEnd = (
  task: () => Promise<void>,
): Effect.Effect<void, never, RequestLifecycle> =>
  Effect.flatMap(RequestLifecycle, (lifecycle) =>
    Effect.sync(() => lifecycle.deferUntilResponseEnd(task)),
  );
