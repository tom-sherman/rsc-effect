import { Effect } from "effect";
import { Database } from "../services";
import { RSC } from "../runtime";

/**
 * A crash, not an expected error — nothing in the types says this can fail.
 * Effect captures it as a defect, `Cause.squash` unwraps it back to the
 * original `Error`, and React's boundary takes it from there.
 */
export default RSC.Component.make(function* DefectPage() {
  const db = yield* Database;

  yield* Effect.sync((): never => {
    throw new Error(`pool ${db.poolId} melted`);
  });

  return <p>unreachable</p>;
});
