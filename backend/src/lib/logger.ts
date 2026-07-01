type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const COLORS: Record<LogLevel, string> = {
  debug: '\x1b[36m', // cyan
  info:  '\x1b[32m', // green
  warn:  '\x1b[33m', // yellow
  error: '\x1b[31m', // red
};
const RESET = '\x1b[0m';

export class Logger {
  private readonly module: string;

  constructor(module: string) {
    this.module = module;
  }

  private log(level: LogLevel, message: string, meta?: unknown): void {
    const timestamp = new Date().toISOString();
    const color = COLORS[level];
    const metaStr = meta !== undefined ? ` ${JSON.stringify(meta)}` : '';
    const line = `${color}[${timestamp}] [${level.toUpperCase().padEnd(5)}] [${this.module}]${RESET} ${message}${metaStr}`;

    if (level === 'error') {
      console.error(line);
    } else if (level === 'warn') {
      console.warn(line);
    } else {
      console.log(line);
    }
  }

  debug(message: string, meta?: unknown): void { this.log('debug', message, meta); }
  info(message: string, meta?: unknown): void  { this.log('info',  message, meta); }
  warn(message: string, meta?: unknown): void  { this.log('warn',  message, meta); }
  error(message: string, meta?: unknown): void { this.log('error', message, meta); }
}
