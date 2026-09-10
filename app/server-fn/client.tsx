"use client";

import { useActionState, useState, useTransition } from "react";
import type { AuditResult, SubmitState } from "./actions";

function Issues({
  issues,
}: {
  issues: ReadonlyArray<{ message: string; path: string }>;
}) {
  return (
    <ul className="flex flex-col gap-1">
      {issues.map((issue, i) => (
        <li key={i} className="font-mono text-sm text-amber-600">
          {issue.path}: {issue.message}
        </li>
      ))}
    </ul>
  );
}

function Result({ value }: { value: string }) {
  return (
    <output className="font-mono text-sm text-zinc-500">{value || "—"}</output>
  );
}

export function LookupForm({
  action,
}: {
  action: (handle: string) => Promise<string>;
}) {
  const [result, setResult] = useState("");
  const [pending, start] = useTransition();

  return (
    <form
      className="flex flex-col gap-2"
      action={(formData) =>
        start(async () => {
          setResult(await action(String(formData.get("handle"))));
        })
      }
    >
      <div className="flex gap-2">
        <input
          name="handle"
          defaultValue="  ada  "
          className="rounded border border-zinc-300 px-2 py-1 font-mono text-sm dark:border-zinc-700"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-zinc-900 px-3 py-1 text-sm text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          lookup
        </button>
      </div>
      <Result value={result} />
    </form>
  );
}

/**
 * The handler and `onInputError` meet in the success channel, so the action
 * returns a union and the caller discriminates on `_tag`. Nothing was thrown,
 * so nothing had to be redacted on the way across.
 */
export function AuditForm({
  action,
}: {
  action: (note: string, times: string) => Promise<AuditResult>;
}) {
  const [result, setResult] = useState<AuditResult | undefined>(undefined);
  const [pending, start] = useTransition();

  return (
    <form
      className="flex flex-col gap-2"
      action={(formData) =>
        start(async () => {
          setResult(
            await action(
              String(formData.get("note")),
              String(formData.get("times")),
            ),
          );
        })
      }
    >
      <div className="flex gap-2">
        <input
          name="note"
          defaultValue="deployed"
          className="rounded border border-zinc-300 px-2 py-1 font-mono text-sm dark:border-zinc-700"
        />
        <input
          name="times"
          defaultValue="3"
          size={3}
          className="rounded border border-zinc-300 px-2 py-1 font-mono text-sm dark:border-zinc-700"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-zinc-900 px-3 py-1 text-sm text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          audit
        </button>
      </div>
      {result?._tag === "Invalid" ? (
        <Issues issues={result.issues} />
      ) : (
        <Result value={result?.text ?? ""} />
      )}
    </form>
  );
}

/**
 * `useActionState` needs no wrapper — a server function whose `input` is a
 * tuple already has the `(previous, formData)` shape it wants, and the state
 * schema makes both ends of the round trip the same type.
 *
 * The empty-note error arrives as `state`, not as a rejection, so there is
 * nothing for React to redact and nothing for an error boundary to catch.
 */
export function NoteForm({
  action,
}: {
  action: (previous: SubmitState, formData: FormData) => Promise<SubmitState>;
}) {
  const [state, formAction, pending] = useActionState<SubmitState, FormData>(
    action,
    { _tag: "Idle" },
  );

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          name="note"
          defaultValue="shipped"
          className="rounded border border-zinc-300 px-2 py-1 font-mono text-sm dark:border-zinc-700"
        />
        <input
          name="times"
          defaultValue="2"
          size={3}
          className="rounded border border-zinc-300 px-2 py-1 font-mono text-sm dark:border-zinc-700"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-zinc-900 px-3 py-1 text-sm text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          submit
        </button>
      </div>
      {state._tag === "Invalid" ? <Issues issues={state.issues} /> : null}
    </form>
  );
}
