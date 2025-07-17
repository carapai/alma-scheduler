export interface CookieOptions {
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: "strict" | "lax" | "none";
    maxAge?: number;
    path?: string;
    domain?: string;
}

export class CookieUtils {
    static createCookie(name: string, value: string, options: CookieOptions = {}): string {
        const {
            httpOnly = true,
            secure = process.env.NODE_ENV === "production",
            sameSite = "lax",
            maxAge = 7 * 24 * 60 * 60, // 7 days in seconds
            path = "/",
            domain
        } = options;

        let cookie = `${name}=${value}`;
        
        if (httpOnly) cookie += "; HttpOnly";
        if (secure) cookie += "; Secure";
        if (sameSite) cookie += `; SameSite=${sameSite}`;
        if (maxAge) cookie += `; Max-Age=${maxAge}`;
        if (path) cookie += `; Path=${path}`;
        if (domain) cookie += `; Domain=${domain}`;

        return cookie;
    }

    static clearCookie(name: string, options: Partial<CookieOptions> = {}): string {
        const {
            path = "/",
            domain
        } = options;

        let cookie = `${name}=; Max-Age=0`;
        if (path) cookie += `; Path=${path}`;
        if (domain) cookie += `; Domain=${domain}`;

        return cookie;
    }

    static parseCookies(cookieHeader: string | null): Record<string, string> {
        if (!cookieHeader) return {};

        return cookieHeader
            .split(";")
            .reduce((cookies, cookie) => {
                const [name, value] = cookie.trim().split("=");
                if (name && value) {
                    cookies[name] = decodeURIComponent(value);
                }
                return cookies;
            }, {} as Record<string, string>);
    }

    static getCookie(request: Request, name: string): string | null {
        const cookieHeader = request.headers.get("cookie");
        const cookies = this.parseCookies(cookieHeader);
        return cookies[name] || null;
    }
}

export const AUTH_COOKIE_NAME = "auth_token";
export const COOKIE_OPTIONS: CookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60, // 7 days
    path: "/"
};