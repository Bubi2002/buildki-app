export type AsyncInvocationResult<T> =
  | { started: false }
  | { started: true; value: T };

export type AsyncInvocationGuard = {
  isRunning: () => boolean;
  run: <T>(operation: () => Promise<T>) => Promise<AsyncInvocationResult<T>>;
};

export function createAsyncInvocationGuard(): AsyncInvocationGuard {
  let running = false;

  return {
    isRunning: () => running,
    async run<T>(operation: () => Promise<T>): Promise<AsyncInvocationResult<T>> {
      if (running) return { started: false };

      running = true;
      try {
        return {
          started: true,
          value: await operation(),
        };
      } finally {
        running = false;
      }
    },
  };
}
