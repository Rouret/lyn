import { internalLogger } from "#lyn/logger";

type StoppableApp = { stop: () => Promise<void> };

const SHUTDOWN_SIGNALS = ["SIGINT", "SIGTERM"] as const;

type ShutdownSignal = (typeof SHUTDOWN_SIGNALS)[number];

const runningApps = new Set<StoppableApp>();

const stopAllApps = async () => {
  const results = await Promise.allSettled(
    [...runningApps].map((app) => app.stop())
  );
  for (const result of results)
    if (result.status === "rejected")
      internalLogger.error({ err: result.reason }, "Failed to stop the server");
};

// Listening to a signal disables the default exit: re-raise it once the apps are stopped.
const shutDownOn = (signal: ShutdownSignal) => async () => {
  detachSignalListeners();
  internalLogger.warn(`${signal} received, shutting down`);
  await stopAllApps();
  if (process.listenerCount(signal) === 0) process.kill(process.pid, signal);
};

const signalListeners = SHUTDOWN_SIGNALS.map(
  (signal) => [signal, shutDownOn(signal)] as const
);

const attachSignalListeners = () => {
  for (const [signal, listener] of signalListeners) process.on(signal, listener);
};

const detachSignalListeners = () => {
  for (const [signal, listener] of signalListeners) process.off(signal, listener);
};

export const stopOnShutdownSignal = (app: StoppableApp) => {
  if (runningApps.size === 0) attachSignalListeners();
  runningApps.add(app);
};

export const forgetOnShutdownSignal = (app: StoppableApp) => {
  if (!runningApps.delete(app)) return;
  if (runningApps.size === 0) detachSignalListeners();
};
