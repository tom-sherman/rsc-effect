import { Layer } from "effect";
import { RSCRuntime } from "@/lib/rsc-effect";
import { layerRequestLifecycle } from "@/lib/rsc-effect/next";
import { DatabaseLive, RequestIdLive } from "./services";

/**
 * Module-hoisted singleton. `shared` is built once for the process; `request`
 * is built again for every request, into a scope that closes with the response.
 */
export const RSC = RSCRuntime.make({
  shared: DatabaseLive,
  request: Layer.mergeAll(RequestIdLive, layerRequestLifecycle),
});
