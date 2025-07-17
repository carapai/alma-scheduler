import { authService } from "./auth-service";
import { User, UserRole } from "./interfaces";
import { Surreal } from "surrealdb";
import { CookieUtils, AUTH_COOKIE_NAME } from "./cookie-utils";

export interface AuthenticatedRequest extends Request {
    user?: User;
    db?: Surreal;
}

export interface AuthMiddlewareOptions {
    required?: boolean;
    roles?: UserRole[];
    resource?: string;
    action?: string;
}

export class AuthMiddleware {
    static async authenticate(request: AuthenticatedRequest, options: AuthMiddlewareOptions = {}): Promise<{
        authenticated: boolean;
        user?: User;
        db?: Surreal;
        error?: string;
    }> {
        const { required = true, roles = [], resource, action } = options;
        
        try {
            // Try to get token from Authorization header first
            let token = "";
            const authHeader = request.headers.get("Authorization");
            if (authHeader) {
                token = authHeader.replace("Bearer ", "");
            }
            
            // If no Authorization header, try to get token from cookie
            if (!token) {
                token = CookieUtils.getCookie(request, AUTH_COOKIE_NAME) || "";
            }

            if (!token) {
                if (required) {
                    return { authenticated: false, error: "No authentication token found" };
                }
                return { authenticated: false };
            }

            const user = await authService.validateToken(token);
            if (!user) {
                if (required) {
                    return { authenticated: false, error: "Invalid or expired token" };
                }
                return { authenticated: false };
            }

            if (roles.length > 0 && !roles.includes(user.role)) {
                return { authenticated: false, error: "Insufficient permissions" };
            }

            if (resource && action) {
                const hasPermission = authService.checkPermission(user.role, resource, action);
                if (!hasPermission) {
                    return { authenticated: false, error: "Insufficient permissions for this action" };
                }
            }

            // Create authenticated database connection
            const db = await authService.createAuthenticatedConnection(token);

            return { authenticated: true, user, db };
        } catch (error) {
            console.error("Authentication error:", error);
            return { authenticated: false, error: "Authentication failed" };
        }
    }

    static requireAuth(options: AuthMiddlewareOptions = {}) {
        return async (request: AuthenticatedRequest): Promise<Response | null> => {
            const authResult = await AuthMiddleware.authenticate(request, { ...options, required: true });
            
            if (!authResult.authenticated) {
                return new Response(
                    JSON.stringify({ error: authResult.error || "Authentication required" }),
                    { 
                        status: 401,
                        headers: { "Content-Type": "application/json" }
                    }
                );
            }

            request.user = authResult.user;
            request.db = authResult.db;
            return null;
        };
    }

    static requireRole(roles: UserRole | UserRole[]) {
        const roleArray = Array.isArray(roles) ? roles : [roles];
        return AuthMiddleware.requireAuth({ roles: roleArray });
    }

    static requirePermission(resource: string, action: string) {
        return AuthMiddleware.requireAuth({ resource, action });
    }

    static optionalAuth() {
        return async (request: AuthenticatedRequest): Promise<Response | null> => {
            const authResult = await AuthMiddleware.authenticate(request, { required: false });
            
            if (authResult.authenticated) {
                request.user = authResult.user;
                request.db = authResult.db;
            }
            
            return null;
        };
    }
}

export async function withAuth<T>(
    request: AuthenticatedRequest,
    options: AuthMiddlewareOptions,
    handler: (request: AuthenticatedRequest) => Promise<T>
): Promise<T | Response> {
    const middleware = AuthMiddleware.requireAuth(options);
    const authResponse = await middleware(request);
    
    if (authResponse) {
        return authResponse;
    }
    
    return handler(request);
}

export function createAuthenticatedHandler<T>(
    options: AuthMiddlewareOptions,
    handler: (request: AuthenticatedRequest) => Promise<T>
) {
    return async (request: AuthenticatedRequest): Promise<T | Response> => {
        return withAuth(request, options, handler);
    };
}

export function requireAdmin<T>(handler: (request: AuthenticatedRequest) => Promise<T>) {
    return createAuthenticatedHandler({ roles: ["admin"] }, handler);
}

export function requireUser<T>(handler: (request: AuthenticatedRequest) => Promise<T>) {
    return createAuthenticatedHandler({ roles: ["admin", "user"] }, handler);
}

export function requirePermission<T>(resource: string, action: string, handler: (request: AuthenticatedRequest) => Promise<T>) {
    return createAuthenticatedHandler({ resource, action }, handler);
}