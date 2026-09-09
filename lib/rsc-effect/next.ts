import { Layer } from "effect"
import { after } from "next/server"
import { RequestLifecycle } from "./RequestLifecycle"

/**
 * {@link RequestLifecycle} backed by Next.js `after()`.
 *
 * `after` runs even when the request errored, or when `notFound()`/`redirect()`
 * was called, so runtimes get disposed on the failure paths too.
 *
 * This is the only module in `rsc-effect` that imports from Next. Swapping it
 * for a `waitUntil` layer is all it takes to run the same components elsewhere.
 */
export const layerRequestLifecycle = Layer.succeed(RequestLifecycle)({
  deferUntilResponseEnd: (task) => {
    after(task)
  }
})
