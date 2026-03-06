import 'cookie-session';

declare module 'cookie-session' {
  interface CookieSessionObject {
    saveId?: number;
    teamName?: string;
  }
}
