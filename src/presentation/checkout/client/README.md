# Checkout client

[Return to checkout](../README.md) · [Shared browser entry](../../browser/README.md)

The [state owner](state/README.md) retains the attempt, idempotency key and uncertain outcome. The [DOM adapter](browser/README.md) binds native controls and lifecycle events to the existing cart and shipping owners. It never creates a second cart or shipping session.

Construction and SSR snapshot reads perform no I/O. Page suspension clears private retry data; return or reload permits explicit status recovery, never automatic order resubmission. Run `npm run test:client` from the repository root; controlled tests are not real-order, provider or BFCache evidence.
