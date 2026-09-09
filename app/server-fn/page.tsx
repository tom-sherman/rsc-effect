import { RSC } from "../runtime";
import { RequestId } from "../services";
import { auditNote, lookupUser, submitNote } from "./actions";
import { listNotes } from "./store";
import { AuditForm, LookupForm } from "./client";

export default RSC.Component.make(function* ServerFnPage() {
  const requestId = yield* RequestId;
  const notes = listNotes();

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 px-8 py-24">
      <h1 className="text-2xl font-semibold tracking-tight">
        Server Functions
      </h1>
      <p className="max-w-prose text-sm leading-6 text-zinc-500">
        Rendered by request <span className="font-mono">{requestId.value}</span>
        . The functions below run in their own request, so expect a different id
        — and a second pool in the server log.
      </p>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-zinc-500">
          one argument — Schema.Trim
        </h2>
        <LookupForm action={lookupUser} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-zinc-500">
          two arguments — [NonEmptyString, FiniteFromString]
        </h2>
        <AuditForm action={auditNote} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-zinc-500">
          a form action — Schema.fromFormData
        </h2>
        <p className="max-w-prose text-sm leading-6 text-zinc-500">
          No client component: the form posts straight to the server function,
          which takes a single <code className="font-mono">FormData</code> and
          decodes it into a struct.
        </p>
        <form action={submitNote} className="flex gap-2">
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
            className="rounded bg-zinc-900 px-3 py-1 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            submit
          </button>
        </form>
        <ul className="flex flex-col gap-1">
          {notes.map((note, i) => (
            <li key={i} className="font-mono text-sm text-zinc-500">
              {note}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
});
