type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const STYLES: Record<LogLevel, string> = {
  debug: 'color: #06b6d4; font-weight: bold',
  info:  'color: #22c55e; font-weight: bold',
  warn:  'color: #f59e0b; font-weight: bold',
  error: 'color: #ef4444; font-weight: bold',
};

export class Logger {
  private readonly module: string;

  constructor(module: string) {
    this.module = module;
  }

  private log(level: LogLevel, message: string, meta?: unknown): void {
    const timestamp = new Date().toISOString();
    const prefix = `%c[${level.toUpperCase()}] [${this.module}]`;
    const text = `${timestamp} — ${message}`;

    if (meta !== undefined) {
      console[level === 'debug' ? 'log' : level](prefix, STYLES[level], text, meta);
    } else {
      console[level === 'debug' ? 'log' : level](prefix, STYLES[level], text);
    }
  }

  debug(message: string, meta?: unknown): void { this.log('debug', message, meta); }
  info(message: string, meta?: unknown): void  { this.log('info',  message, meta); }
  warn(message: string, meta?: unknown): void  { this.log('warn',  message, meta); }
  error(message: string, meta?: unknown): void { this.log('error', message, meta); }
}
