type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  [key: string]: unknown;
}

function createLogEntry(
  level: LogLevel,
  message: string,
  meta?: Record<string, unknown>,
): LogEntry {
  return {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...meta,
  };
}

export const logger = {
  debug(message: string, meta?: Record<string, unknown>): void {
    if (process.env.NODE_ENV !== "production") {
      console.debug(JSON.stringify(createLogEntry("debug", message, meta)));
    }
  },

  info(message: string, meta?: Record<string, unknown>): void {
    console.info(JSON.stringify(createLogEntry("info", message, meta)));
  },

  warn(message: string, meta?: Record<string, unknown>): void {
    console.warn(JSON.stringify(createLogEntry("warn", message, meta)));
  },

  error(message: string, meta?: Record<string, unknown>): void {
    console.error(JSON.stringify(createLogEntry("error", message, meta)));
  },
};
