import { Layer } from "effect";
import { RSCRuntime } from "@/lib/rsc-effect";
import { layerRequestLifecycle } from "@/lib/rsc-effect/next";
import { DatabaseLive, RequestIdLive } from "./services";

const AppLayer = Layer.mergeAll(
  DatabaseLive,
  RequestIdLive,
  layerRequestLifecycle,
);

/** Module-hoisted singleton. The ManagedRuntime underneath is per-request. */
export const RSC = RSCRuntime.make({ layer: AppLayer });
