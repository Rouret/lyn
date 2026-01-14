import pino from "pino";

export const logger = pino({
  transport: {
    target: "pino-pretty",
  },
});

export const internalLogger = pino({
  enabled: process.env.NODE_ENV !== "lyn-test",
  transport: {
    target: "pino-pretty",
    options: {
      messageFormat: "[Lyn] {msg}",
    },
  },
});
