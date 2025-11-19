// Настройка логирования
// false для продакшена (ускоряет работу), true для отладки
const DEBUG_MODE = false;

export const Logger = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  debug: (message: string, ...args: any[]) => {
    if (DEBUG_MODE) console.log(message, ...args);
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  info: (message: string, ...args: any[]) => {
    console.log(message, ...args);
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  warn: (message: string, ...args: any[]) => {
    console.warn(message, ...args);
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  error: (message: string, ...args: any[]) => {
    console.error(message, ...args);
  }
};

