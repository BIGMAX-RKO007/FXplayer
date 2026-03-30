import { createContext, useContext } from 'react';

export type LogLevel = 'info' | 'warn' | 'error' | 'debug' | 'success';

export interface LogEntry {
  id: string;
  ts: string;
  level: LogLevel;
  stage: string;
  message: string;
}

export interface LogContextType {
  logs: LogEntry[];
  addLog: (level: LogLevel, stage: string, message: string) => void;
  clearLogs: () => void;
}

export const LogContext = createContext<LogContextType>({
  logs: [],
  addLog: () => {},
  clearLogs: () => {},
});

export const useLogger = () => useContext(LogContext);

export function createLogEntry(level: LogLevel, stage: string, message: string): LogEntry {
  const now = new Date();
  const ts = now.toLocaleTimeString('zh-CN', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }) + '.' + String(now.getMilliseconds()).padStart(3, '0');

  return {
    id: crypto.randomUUID(),
    ts,
    level,
    stage,
    message,
  };
}
