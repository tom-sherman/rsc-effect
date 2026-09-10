"use server";

import { Effect, Schema, SchemaIssue } from "effect";
import { revalidatePath } from "next/cache";
import { RSC } from "../runtime";
import { Database, RequestId } from "../services";
import { addNote } from "./store";

/**
 * Turns a `SchemaError` into something that can actually cross the boundary:
 * plain objects, no prototypes, no `toJSON`. `path` is stringified because a
 * `PropertyKey` may be a symbol, which React cannot serialize.
 *
 * The leading `0` in a path is the argument's position — the runtime decodes
 * the whole argument list as one tuple.
 */
const formatIssues = SchemaIssue.makeFormatterStandardSchemaV1();

const wireIssues = (error: Schema.SchemaError) =>
  formatIssues(error.issue).issues.map((issue) => ({
    message: issue.message,
    path: (issue.path ?? []).map(String).join("."),
  }));

/**
 * One argument: `input` is a single schema, so the function takes a single
 * value. `Schema.Trim` also shows that decoding is real work — the handler
 * gets a trimmed handle whatever the caller sent.
 *
 * The `catchTag` is not optional politeness: a handler's error channel has to
 * be `never`, so a missing user has to leave as a value the caller can read.
 *
 * `Trim` accepts any string, so the only way to fail it is to post something
 * that is not one — a hand-rolled request, not a form. That is the case
 * `Effect.die` is for: the error boundary, and a log at error level. Because
 * `die` returns `never` the union doesn't widen, and callers still see
 * `Promise<string>`.
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
  onInputError: Effect.die,
});

/**
 * Several arguments: `input` is a tuple, so the function takes several. The
 * encoded and decoded sides differ here — the caller passes `times` as a
 * string, which is what a form gives you, and the handler receives a number.
 *
 * `times` is also the one a person can get wrong by typing, so a decode
 * failure is expected traffic rather than a bug, and `onInputError` answers
 * with a value. Both sides are tagged, because they meet in the same success
 * channel: the caller gets `Promise<AuditResult>`.
 */
export const auditNote = RSC.ServerFn.make({
  input: [Schema.NonEmptyString, Schema.FiniteFromString],
  handler: (note, times) =>
    Effect.gen(function* () {
      const requestId = yield* RequestId;
      yield* Effect.log(`audit: ${note} x${times}`);
      return {
        _tag: "Audited",
        text: `${Array.from({ length: times }, () => note).join(" · ")} (request ${requestId.value})`,
      } as const;
    }),
  onInputError: (error) =>
    Effect.succeed({ _tag: "Invalid", issues: wireIssues(error) } as const),
});

export type AuditResult = Awaited<ReturnType<typeof auditNote>>;

/**
 * The form's state, as it goes over the wire. `useActionState` posts the
 * previous state back with every submission, so it is client-controlled input
 * like any other, and gets a schema like any other. Nothing transforms, so the
 * encoded and decoded types are the same — which is what lets the same value be
 * both the action's first argument and its result.
 */
const SubmitState = Schema.Union([
  Schema.Struct({ _tag: Schema.tag("Idle") }),
  Schema.Struct({ _tag: Schema.tag("Added"), note: Schema.String }),
  Schema.Struct({
    _tag: Schema.tag("Invalid"),
    issues: Schema.Array(
      Schema.Struct({ message: Schema.String, path: Schema.String }),
    ),
  }),
]);

export type SubmitState = Schema.Schema.Type<typeof SubmitState>;

/**
 * A form action, in the shape `useActionState` wants: `(previous, formData)`.
 * Two arguments, so `input` is a tuple — the state schema and the form schema.
 *
 * `toCodecStringTree` is what lets `times` arrive as a number: form fields are
 * always strings, and it reads each leaf codec through its string encoding.
 *
 * An empty `note` is the error a person actually needs to see, and here there
 * is somewhere to put it: `onInputError` returns the `Invalid` state, the
 * handler returns `Added`, they meet in the success channel, and React hands
 * whichever it got back to the form as `state`. No throwing, so nothing is
 * redacted on the way across — the issues arrive intact in production.
 */
export const submitNote = RSC.ServerFn.make({
  input: [
    SubmitState,
    Schema.fromFormData(
      Schema.toCodecStringTree(
        Schema.Struct({
          note: Schema.NonEmptyString,
          times: Schema.Int,
        }),
      ),
    ),
  ],
  handler: (_previous, { note, times }) =>
    Effect.gen(function* () {
      const requestId = yield* RequestId;
      yield* Effect.log(`submit: ${note} x${times}`);
      const text = `${Array.from({ length: times }, () => note).join(" · ")} (request ${requestId.value})`;
      addNote(text);
      yield* Effect.sync(() => revalidatePath("/server-fn"));
      return { _tag: "Added", note: text } as const;
    }),
  onInputError: (error) =>
    Effect.succeed({ _tag: "Invalid", issues: wireIssues(error) } as const),
});
