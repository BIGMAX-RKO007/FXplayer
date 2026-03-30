import { useEffect, useRef } from 'react';
import { LogEntry, LogLevel, useLogger } from '../utils/logger';
import { Terminal, X, Trash2 } from 'lucide-react';

const LEVEL_CONFIG: Record<LogLevel, { color: string; bg: string; label: string }> = {
  info:    { color: '#60a5fa', bg: 'rgba(96, 165, 250, 0.1)',  label: 'INFO ' },
  success: { color: '#34d399', bg: 'rgba(52, 211, 153, 0.1)',  label: 'OK   ' },
  warn:    { color: '#fbbf24', bg: 'rgba(251, 191, 36, 0.1)',  label: 'WARN ' },
  error:   { color: '#f87171', bg: 'rgba(248, 113, 113, 0.1)', label: 'ERROR' },
  debug:   { color: '#a78bfa', bg: 'rgba(167, 139, 250, 0.1)', label: 'DEBUG' },
};

interface LogPanelProps {
  onClose: () => void;
}

export function LogPanel({ onClose }: LogPanelProps) {
  const { logs, clearLogs } = useLogger();
  const bottomRef = useRef<HTMLDivElement>(null);

  // 每次新日志到来时自动滚动到底部
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs.length]);

  return (
    <div className="log-panel-overlay">
      <div className="log-panel">
        {/* 标题栏 */}
        <div className="log-panel-header">
          <div className="log-panel-title">
            <Terminal size={14} />
            <span>Runtime Console</span>
            <span className="log-count">{logs.length} entries</span>
          </div>
          <div className="log-panel-actions">
            <button className="log-action-btn" onClick={clearLogs} title="Clear logs">
              <Trash2 size={13} />
            </button>
            <button className="log-action-btn" onClick={onClose} title="Close">
              <X size={13} />
            </button>
          </div>
        </div>

        {/* 日志滚动区域 */}
        <div className="log-body">
          {logs.length === 0 ? (
            <div className="log-empty">
              <Terminal size={20} opacity={0.3} />
              <span>等待日志输出...</span>
            </div>
          ) : (
            logs.map((entry: LogEntry) => {
              const cfg = LEVEL_CONFIG[entry.level];
              return (
                <div key={entry.id} className="log-entry" style={{ borderLeft: `2px solid ${cfg.color}` }}>
                  <span className="log-ts">{entry.ts}</span>
                  <span className="log-stage">[{entry.stage}]</span>
                  <span className="log-level" style={{ color: cfg.color }}>{cfg.label}</span>
                  <span className="log-message">{entry.message}</span>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}
