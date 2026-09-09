export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 px-8 py-24">
      <h1 className="text-2xl font-semibold tracking-tight">404</h1>
      <p className="text-sm text-zinc-500">
        Rendered by <code className="font-mono">not-found.tsx</code>. The{" "}
        <code className="font-mono">notFound()</code> call happened inside an
        Effect, was captured as a defect, and still reached Next intact.
      </p>
    </main>
  )
}
