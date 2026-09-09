"use server";

import { Effect, Schema } from "effect";
import { revalidatePath } from "next/cache";
import { RSC } from "../runtime";
import { Database, RequestId } from "../services";
import { addNote } from "./store";

/**
 * One argument: `input` is a single schema, so the function takes a single
 * value. `Schema.Trim` also shows that decoding is real work — the handler
 * gets a trimmed handle whatever the caller sent.
 */
export const lookupUser = RSC.ServerFn.make({
  input: Schema.Trim,
  handler: Effect.fnUntraced(
    function* (handle: string) {
      const db = yield* Database;
      const requestId = yield* RequestId;
      const name = yield* db.findUser(handle);
      return `${name} — request ${requestId.value}, pool ${db.poolId}`;
    },
    Effect.catchTag("UserNotFound", (error) =>
      Effect.succeed(`no such user: ${error.handle}`),
    ),
  ),
});

/**
 * Several arguments: `input` is a tuple, so the function takes several. The
 * encoded and decoded sides differ here — the caller passes `times` as a
 * string, which is what a form gives you, and the handler receives a number.
 */
export const auditNote = RSC.ServerFn.make({
  input: [Schema.NonEmptyString, Schema.FiniteFromString],
  handler: (note, times) =>
    Effect.gen(function* () {
      const requestId = yield* RequestId;
      yield* Effect.log(`audit: ${note} x${times}`);
      return `${Array.from({ length: times }, () => note).join(" · ")} (request ${requestId.value})`;
    }),
});

/**
 * A form action. `<form action={...}>` hands the server function one argument —
 * a `FormData` — so `input` is a single `Schema.fromFormData`, and the handler
 * receives the decoded struct rather than a bag of `string | File`.
 *
 * `toCodecStringTree` is what lets `times` arrive as a number: form fields are
 * always strings, and it reads each leaf codec through its string encoding.
 *
 * The handler returns `void`, which is what React requires of a `form action`.
 */
export const submitNote = RSC.ServerFn.make({
  input: Schema.fromFormData(
    Schema.toCodecStringTree(
      Schema.Struct({
        note: Schema.NonEmptyString,
        times: Schema.Int,
      }),
    ),
  ),
  handler: ({ note, times }) =>
    Effect.gen(function* () {
      const requestId = yield* RequestId;
      yield* Effect.log(`submit: ${note} x${times}`);
      addNote(
        `${Array.from({ length: times }, () => note).join(" · ")} (request ${requestId.value})`,
      );
      yield* Effect.sync(() => revalidatePath("/server-fn"));
    }),
});
