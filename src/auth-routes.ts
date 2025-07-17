import { authService } from "./auth-service";
import { AuthMiddleware, AuthenticatedRequest } from "./auth-middleware";
import { LoginRequest, RegisterRequest } from "./interfaces";
import { CookieUtils, AUTH_COOKIE_NAME, COOKIE_OPTIONS } from "./cookie-utils";

export class AuthRoutes {
    static async handleLogin(request: Request): Promise<Response> {
        try {
            const body = await request.json() as LoginRequest;
            
            if (!body.username || !body.password) {
                return new Response(
                    JSON.stringify({ error: "Username and password are required" }),
                    { 
                        status: 400, 
                        headers: { "Content-Type": "application/json" } 
                    }
                );
            }

            const authResponse = await authService.login(body);
            
            // Set cookie with the auth token
            const cookieHeader = CookieUtils.createCookie(AUTH_COOKIE_NAME, authResponse.token, COOKIE_OPTIONS);
            
            return new Response(
                JSON.stringify(authResponse),
                { 
                    status: 200, 
                    headers: { 
                        "Content-Type": "application/json",
                        "Set-Cookie": cookieHeader
                    } 
                }
            );
        } catch (error) {
            console.error("Login error:", error);
            return new Response(
                JSON.stringify({ error: error instanceof Error ? error.message : "Login failed" }),
                { 
                    status: 401, 
                    headers: { "Content-Type": "application/json" } 
                }
            );
        }
    }

    static async handleRegister(request: Request): Promise<Response> {
        try {
            const body = await request.json() as RegisterRequest;
            
            if (!body.username || !body.email || !body.password) {
                return new Response(
                    JSON.stringify({ error: "Username, email, and password are required" }),
                    { 
                        status: 400, 
                        headers: { "Content-Type": "application/json" } 
                    }
                );
            }

            const authResponse = await authService.register(body);
            
            // Set cookie with the auth token
            const cookieHeader = CookieUtils.createCookie(AUTH_COOKIE_NAME, authResponse.token, COOKIE_OPTIONS);
            
            return new Response(
                JSON.stringify(authResponse),
                { 
                    status: 201, 
                    headers: { 
                        "Content-Type": "application/json",
                        "Set-Cookie": cookieHeader
                    } 
                }
            );
        } catch (error) {
            console.error("Registration error:", error);
            return new Response(
                JSON.stringify({ error: error instanceof Error ? error.message : "Registration failed" }),
                { 
                    status: 400, 
                    headers: { "Content-Type": "application/json" } 
                }
            );
        }
    }

    static async handleLogout(request: AuthenticatedRequest): Promise<Response> {
        const middleware = AuthMiddleware.requireAuth();
        const authResponse = await middleware(request);
        
        if (authResponse) {
            return authResponse;
        }

        try {
            await authService.logout();
            
            // Clear the auth cookie
            const clearCookieHeader = CookieUtils.clearCookie(AUTH_COOKIE_NAME, { path: "/" });
            
            return new Response(
                JSON.stringify({ message: "Logged out successfully" }),
                { 
                    status: 200, 
                    headers: { 
                        "Content-Type": "application/json",
                        "Set-Cookie": clearCookieHeader
                    } 
                }
            );
        } catch (error) {
            console.error("Logout error:", error);
            return new Response(
                JSON.stringify({ error: "Logout failed" }),
                { 
                    status: 500, 
                    headers: { "Content-Type": "application/json" } 
                }
            );
        }
    }

    static async handleProfile(request: AuthenticatedRequest): Promise<Response> {
        const middleware = AuthMiddleware.requireAuth();
        const authResponse = await middleware(request);
        
        if (authResponse) {
            return authResponse;
        }

        try {
            const { password, ...userProfile } = request.user!;
            
            return new Response(
                JSON.stringify(userProfile),
                { 
                    status: 200, 
                    headers: { "Content-Type": "application/json" } 
                }
            );
        } catch (error) {
            console.error("Profile error:", error);
            return new Response(
                JSON.stringify({ error: "Failed to get profile" }),
                { 
                    status: 500, 
                    headers: { "Content-Type": "application/json" } 
                }
            );
        }
    }

    static async handleChangePassword(request: AuthenticatedRequest): Promise<Response> {
        const middleware = AuthMiddleware.requireAuth();
        const authResponse = await middleware(request);
        
        if (authResponse) {
            return authResponse;
        }

        try {
            const body = await request.json() as { oldPassword: string; newPassword: string };
            
            if (!body.oldPassword || !body.newPassword) {
                return new Response(
                    JSON.stringify({ error: "Old password and new password are required" }),
                    { 
                        status: 400, 
                        headers: { "Content-Type": "application/json" } 
                    }
                );
            }

            await authService.changePassword(request.user!.id, body.oldPassword, body.newPassword);
            
            return new Response(
                JSON.stringify({ message: "Password changed successfully" }),
                { 
                    status: 200, 
                    headers: { "Content-Type": "application/json" } 
                }
            );
        } catch (error) {
            console.error("Change password error:", error);
            return new Response(
                JSON.stringify({ error: error instanceof Error ? error.message : "Password change failed" }),
                { 
                    status: 400, 
                    headers: { "Content-Type": "application/json" } 
                }
            );
        }
    }

    static async handleGetUsers(request: AuthenticatedRequest): Promise<Response> {
        const middleware = AuthMiddleware.requireRole("admin");
        const authResponse = await middleware(request);
        
        if (authResponse) {
            return authResponse;
        }

        try {
            const users = await authService.getAllUsers();
            
            return new Response(
                JSON.stringify(users),
                { 
                    status: 200, 
                    headers: { "Content-Type": "application/json" } 
                }
            );
        } catch (error) {
            console.error("Get users error:", error);
            return new Response(
                JSON.stringify({ error: "Failed to get users" }),
                { 
                    status: 500, 
                    headers: { "Content-Type": "application/json" } 
                }
            );
        }
    }

    static async handleCreateUser(request: AuthenticatedRequest): Promise<Response> {
        const middleware = AuthMiddleware.requireRole("admin");
        const authResponse = await middleware(request);
        
        if (authResponse) {
            return authResponse;
        }

        try {
            const body = await request.json() as RegisterRequest;
            
            if (!body.username || !body.email || !body.password) {
                return new Response(
                    JSON.stringify({ error: "Username, email, and password are required" }),
                    { 
                        status: 400, 
                        headers: { "Content-Type": "application/json" } 
                    }
                );
            }

            const user = await authService.createUser(body);
            const { password, ...userWithoutPassword } = user;
            
            return new Response(
                JSON.stringify(userWithoutPassword),
                { 
                    status: 201, 
                    headers: { "Content-Type": "application/json" } 
                }
            );
        } catch (error) {
            console.error("Create user error:", error);
            return new Response(
                JSON.stringify({ error: error instanceof Error ? error.message : "User creation failed" }),
                { 
                    status: 400, 
                    headers: { "Content-Type": "application/json" } 
                }
            );
        }
    }

    static async handleUpdateUser(request: AuthenticatedRequest, userId: string): Promise<Response> {
        const middleware = AuthMiddleware.requireRole("admin");
        const authResponse = await middleware(request);
        
        if (authResponse) {
            return authResponse;
        }

        try {
            const body = await request.json();
            const user = await authService.updateUser(userId, body);
            const { password, ...userWithoutPassword } = user;
            
            return new Response(
                JSON.stringify(userWithoutPassword),
                { 
                    status: 200, 
                    headers: { "Content-Type": "application/json" } 
                }
            );
        } catch (error) {
            console.error("Update user error:", error);
            return new Response(
                JSON.stringify({ error: error instanceof Error ? error.message : "User update failed" }),
                { 
                    status: 400, 
                    headers: { "Content-Type": "application/json" } 
                }
            );
        }
    }

    static async handleDeleteUser(request: AuthenticatedRequest, userId: string): Promise<Response> {
        const middleware = AuthMiddleware.requireRole("admin");
        const authResponse = await middleware(request);
        
        if (authResponse) {
            return authResponse;
        }

        try {
            const success = await authService.deleteUser(userId);
            
            if (success) {
                return new Response(
                    JSON.stringify({ message: "User deleted successfully" }),
                    { 
                        status: 200, 
                        headers: { "Content-Type": "application/json" } 
                    }
                );
            } else {
                return new Response(
                    JSON.stringify({ error: "User not found" }),
                    { 
                        status: 404, 
                        headers: { "Content-Type": "application/json" } 
                    }
                );
            }
        } catch (error) {
            console.error("Delete user error:", error);
            return new Response(
                JSON.stringify({ error: "User deletion failed" }),
                { 
                    status: 500, 
                    headers: { "Content-Type": "application/json" } 
                }
            );
        }
    }
}