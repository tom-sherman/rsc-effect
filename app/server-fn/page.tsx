import { RSC } from "../runtime";
import { RequestId } from "../services";
import { auditNote, lookupUser, submitNote } from "./actions";
import { listNotes } from "./store";
import { AuditForm, LookupForm, NoteForm } from "./client";

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
        — but the same pool, because that one is shared.
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
          a form action — Schema.fromFormData + useActionState
        </h2>
        <p className="max-w-prose text-sm leading-6 text-zinc-500">
          The action takes{" "}
          <code className="font-mono">(previous, formData)</code>, which is what{" "}
          <code className="font-mono">useActionState</code> wants — so it needs
          no wrapper. Submit an empty note: the decode failure comes back as
          state, not as a thrown error.
        </p>
        <NoteForm action={submitNote} />
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
