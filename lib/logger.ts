/**
 * lib/logger.ts
 * Structured logger. Every log line is a JSON object in production.
 * Includes trace_id propagation for end-to-end request tracing.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogContext {
  trace_id?: string
  job_id?: string
  pr_id?: string
  run_id?: string
  repo?: string
  pr_number?: number
  file?: string
  duration_ms?: number
  [key: string]: unknown
}

interface LogEntry {
  ts: string
  level: LogLevel
  msg: string
  service: 'breakshield'
  env: string
  [key: string]: unknown
}

const IS_PROD = process.env.NODE_ENV === 'production'
const MIN_LEVEL: LogLevel = (process.env.LOG_LEVEL as LogLevel) ?? 'info'

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0, info: 1, warn: 2, error: 3,
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[MIN_LEVEL]
}

function write(level: LogLevel, msg: string, ctx: LogContext = {}): void {
  if (!shouldLog(level)) return

  const entry: LogEntry = {
    ts:      new Date().toISOString(),
    level,
    msg,
    service: 'breakshield',
    env:     process.env.NODE_ENV ?? 'development',
    ...ctx,
  }

  const line = IS_PROD
    ? JSON.stringify(entry)
    : formatPretty(entry)

  if (level === 'error') {
    console.error(line)
  } else if (level === 'warn') {
    console.warn(line)
  } else {
    console.log(line)
  }
}

const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: '\x1b[36m',  // cyan
  info:  '\x1b[32m',  // green
  warn:  '\x1b[33m',  // yellow
  error: '\x1b[31m',  // red
}
const RESET = '\x1b[0m'

function formatPretty(entry: LogEntry): string {
  const { ts, level, msg, service: _s, env: _e, ...rest } = entry
  const color  = LEVEL_COLORS[level]
  const time   = ts.slice(11, 23)
  const ctxStr = Object.keys(rest).length
    ? ' ' + Object.entries(rest).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(' ')
    : ''
  return `${color}${time} ${level.toUpperCase().padEnd(5)}${RESET} ${msg}${ctxStr}`
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const logger = {
  debug: (msg: string, ctx?: LogContext) => write('debug', msg, ctx),
  info:  (msg: string, ctx?: LogContext) => write('info',  msg, ctx),
  warn:  (msg: string, ctx?: LogContext) => write('warn',  msg, ctx),
  error: (msg: string, ctx?: LogContext) => write('error', msg, ctx),

  /** Return a child logger with pre-bound context fields */
  child(base: LogContext) {
    return {
      debug: (msg: string, ctx?: LogContext) => write('debug', msg, { ...base, ...ctx }),
      info:  (msg: string, ctx?: LogContext) => write('info',  msg, { ...base, ...ctx }),
      warn:  (msg: string, ctx?: LogContext) => write('warn',  msg, { ...base, ...ctx }),
      error: (msg: string, ctx?: LogContext) => write('error', msg, { ...base, ...ctx }),
    }
  },

  /** Time a block and log duration on completion */
  async timed<T>(
    label: string,
    fn: () => Promise<T>,
    ctx?: LogContext
  ): Promise<T> {
    const start = Date.now()
    write('info', `${label} started`, ctx)
    try {
      const result = await fn()
      write('info', `${label} completed`, { ...ctx, duration_ms: Date.now() - start })
      return result
    } catch (err: unknown) {
      write('error', `${label} failed`, {
        ...ctx,
        duration_ms: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      })
      throw err
    }
  },
}
