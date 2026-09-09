import { Layer } from "effect"
import { unstable_rethrow } from "next/navigation"
import { after } from "next/server"
import { RequestLifecycle } from "./RequestLifecycle"

/**
 * {@link RequestLifecycle} backed by Next.js.
 *
 * This is the only module in `rsc-effect` that imports from Next. Swapping it
 * for a `waitUntil` layer is all it takes to run the same components elsewhere.
 */
export const layerRequestLifecycle = Layer.succeed(RequestLifecycle)({
  /**
   * `after` runs even when the request errored, or when `notFound()`/
   * `redirect()` was called, so runtimes get disposed on the failure paths too.
   */
  deferUntilResponseEnd: (task) => {
    after(task)
  },

  /**
   * `unstable_rethrow` is the only supported way to ask "is this Next's?" — it
   * rethrows framework signals and returns for everything else. Inverting it
   * into a predicate is unlovely, but it beats matching on error digests.
   *
   * Covers `notFound()`, `redirect()`, `permanentRedirect()`, and the
   * request-time API signals that PPR relies on.
   */
  isControlFlowSignal: (defect) => {
    try {
      unstable_rethrow(defect)
      return false
    } catch {
      return true
    }
  }
})
