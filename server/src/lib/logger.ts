import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isDev ? 'debug' : 'info'),
  ...(isDev
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
        },
      }
    : {}),
  // Redaction défensive — n'imprimera jamais ces clés même si on les passe par erreur.
  redact: {
    paths: [
      'password',
      'passwordHash',
      'token',
      '*.password',
      '*.passwordHash',
      '*.token',
      'req.headers.cookie',
      'req.headers.authorization',
    ],
    censor: '[REDACTED]',
  },
});
