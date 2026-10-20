# Implementation plan

Existing architecture: TypeScript plugin, serialized services/settings writes,
Electron remote access for popout pinning, Vitest and esbuild.

1. A typed main-process state machine runs from fixed build-generated source.
   Its native callbacks survive renderer disposal. No user text is evaluated.
2. Renderer bridge receives a prepare request, drains service queues and saves
   a settings checkpoint before acknowledging the same request nonce.
3. The guard resumes normal quit, respecting host save/unload handlers, and
   retries only the canceled host quit after all scoped windows have closed.
4. Restrict platform/version/window scope; remove hooks on reload/disable and
   retire any armed guard after a bounded deadline.
5. Tests, independent review, local installation and native restart verification.

No commit, push or release requested for this follow-up.
