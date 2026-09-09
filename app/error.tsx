"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex max-w-2xl flex-col items-start gap-4 px-8 py-24">
      <h1 className="text-2xl font-semibold tracking-tight">Error boundary</h1>
      <p className="text-sm text-zinc-500">
        A defect escaped Effect and React caught it. The full{" "}
        <code className="font-mono">Cause</code> — spans and all — is in the
        server logs; this is only the squashed head.
      </p>
      <pre className="w-full overflow-x-auto rounded bg-zinc-100 p-4 font-mono text-sm dark:bg-zinc-900">
        {error.message}
      </pre>
      {error.digest ? (
        <p className="font-mono text-xs text-zinc-400">digest {error.digest}</p>
      ) : null}
      <button
        onClick={reset}
        className="rounded-full border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700"
      >
        Try again
      </button>
    </main>
  );
}
