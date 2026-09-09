# rsc-effect

## Todo

- Find a better solution for `shareResourcesAcrossRequests`. It should be possible to have some services be shared across requests, and some not. Is having two different runtimes the right solution here?
- Make our own `<form action>` and `useActionState` wrappers that deal in effects instead of promises
- Make `ServerComponent.make` and `ServerFunction.make` return a value that has `.pipe()` on the end, like `Effect.fn` does. That solves the problem of erroring server functions (right now their errors are lost) while keeping the API consistent across server functions and server components.
