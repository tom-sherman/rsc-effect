import { Effect } from "effect";
import { notFound } from "next/navigation";
import { Database } from "../services";
import { RSC } from "../runtime";

/**
 * The interesting case: `notFound()` works by throwing, so Effect captures it
 * as a defect like any other. It still works, because we never swallow defects
 * and `Cause.squash` hands Next back the exact object it threw.
 */
export default RSC.Component.make(function* MissingPage() {
  const db = yield* Database;

  const user = yield* Effect.catchTag(
    db.findUser("hopper"),
    "UserNotFound",
    () => Effect.sync(() => notFound()),
  );

  return <p>{user}</p>;
});
