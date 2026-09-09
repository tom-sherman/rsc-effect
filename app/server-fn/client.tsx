"use client";

import { useState, useTransition } from "react";

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

export function AuditForm({
  action,
}: {
  action: (note: string, times: string) => Promise<string>;
}) {
  const [result, setResult] = useState("");
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
      <Result value={result} />
    </form>
  );
}
