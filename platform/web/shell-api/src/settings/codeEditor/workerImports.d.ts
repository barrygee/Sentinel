// Vite's `?worker` imports: the module's default export constructs the bundled worker.
declare module '*?worker' {
  const WorkerConstructor: new () => Worker
  export default WorkerConstructor
}
