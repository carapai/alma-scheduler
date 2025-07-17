import { Surreal } from "surrealdb";
import { surrealdbNodeEngines } from "@surrealdb/node";
import { IUser, User, UserRole, LoginRequest, RegisterRequest, AuthResponse, DEFAULT_PERMISSIONS } from "./interfaces";
import { BaseService } from "./base-service";

export class AuthService extends BaseService {
    protected async initializeSchema() {
        try {
            await this.db.query(`
                DEFINE TABLE OVERWRITE users SCHEMALESS PERMISSIONS 
                    FOR select WHERE id = $auth.id OR $auth.role = 'admin'
                    FOR create, update, delete WHERE $auth.role = 'admin'
                    FOR create WHERE $auth = NONE;

                DEFINE INDEX OVERWRITE users_username ON users COLUMNS username UNIQUE;
                DEFINE INDEX OVERWRITE users_email ON users COLUMNS email UNIQUE;

                DEFINE ACCESS OVERWRITE user_access ON DATABASE TYPE RECORD
                    SIGNUP (
                        CREATE users SET
                            username = $username,
                            email = $email,
                            password = crypto::argon2::generate($password),
                            role = $role OR 'user',
                            isActive = true,
                            createdAt = time::now(),
                            updatedAt = time::now()
                    )
                    SIGNIN (
                        SELECT * FROM users WHERE username = $username AND isActive = true AND crypto::argon2::compare(password, $password)
                    )
                    DURATION FOR TOKEN 7d
                    DURATION FOR SESSION 7d;

                DEFINE TABLE OVERWRITE schedules SCHEMALESS PERMISSIONS
                    FOR select WHERE $auth.role IN ['admin', 'user', 'viewer']
                    FOR create, update, delete WHERE $auth.role IN ['admin', 'user'];
            `);
            
            await this.createDefaultAdmin();
        } catch (error) {
            console.warn("Schema initialization error:", error);
        }
    }

    private async createDefaultAdmin() {
        try {
            const [existingUsers] = await this.db.query<[IUser[]]>("SELECT * FROM users WHERE role = 'admin'");
            
            if (existingUsers.length === 0) {
                await this.register({
                    username: "admin",
                    email: "admin@example.com",
                    password: "admin123",
                    role: "admin"
                });
            }
        } catch (error) {
            console.warn("Failed to create default admin:", error);
        }
    }

    async register(userData: RegisterRequest): Promise<AuthResponse> {
        await this.connect();

        try {
            const token = await this.db.signup({
                access: "user_access",
                variables: {
                    username: userData.username,
                    email: userData.email,
                    password: userData.password,
                    role: userData.role || "user"
                }
            });

            if (!token) {
                throw new Error("Registration failed");
            }

            const userInfo = await this.db.info();
            
            if (!userInfo) {
                throw new Error("Failed to get user info after registration");
            }

            return {
                user: {
                    id: String((userInfo as any).id),
                    username: (userInfo as any).username,
                    email: (userInfo as any).email,
                    role: (userInfo as any).role,
                    isActive: (userInfo as any).isActive,
                    createdAt: (userInfo as any).createdAt,
                    updatedAt: (userInfo as any).updatedAt
                },
                token: token as string,
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
            };
        } catch (error) {
            throw new Error(`Registration failed: ${error}`);
        }
    }

    async login(credentials: LoginRequest): Promise<AuthResponse> {
        await this.connect();

        try {
            const token = await this.db.signin({
                access: "user_access",
                variables: {
                    username: credentials.username,
                    password: credentials.password
                }
            });

            if (!token) {
                throw new Error("Invalid credentials");
            }

            const userInfo = await this.db.info();
            
            if (!userInfo) {
                throw new Error("Failed to get user info");
            }
            
            return {
                user: {
                    id: String((userInfo as any).id),
                    username: (userInfo as any).username,
                    email: (userInfo as any).email,
                    role: (userInfo as any).role,
                    isActive: (userInfo as any).isActive,
                    createdAt: (userInfo as any).createdAt,
                    updatedAt: (userInfo as any).updatedAt,
                    lastLogin: (userInfo as any).lastLogin
                },
                token: token as string,
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
            };
        } catch (error) {
            throw new Error(`Login failed: ${error}`);
        }
    }

    async logout(): Promise<void> {
        await this.connect();
        await this.db.invalidate();
    }

    async validateToken(token: string): Promise<User | null> {
        try {
            const tempDb = new Surreal({
                engines: surrealdbNodeEngines(),
            });
            
            await tempDb.connect("surrealkv://scheduler", {
                database: "scheduler",
                namespace: "scheduler",
            });

            await tempDb.authenticate(token);
            const userInfo = await tempDb.info();
            
            await tempDb.close();

            if (!userInfo || !(userInfo as any).isActive) {
                return null;
            }

            return {
                id: String((userInfo as any).id),
                username: (userInfo as any).username,
                email: (userInfo as any).email,
                password: "", // Don't expose password
                role: (userInfo as any).role,
                isActive: (userInfo as any).isActive || true,
                createdAt: (userInfo as any).createdAt,
                updatedAt: (userInfo as any).updatedAt,
                lastLogin: (userInfo as any).lastLogin
            };
        } catch (error) {
            console.error("Token validation error:", error);
            return null;
        }
    }

    async createUser(userData: RegisterRequest): Promise<User> {
        await this.connect();

        try {
            const [result] = await this.db.query<[IUser[]]>(`
                CREATE users SET
                    username = $username,
                    email = $email,
                    password = crypto::argon2::generate($password),
                    role = $role,
                    isActive = true,
                    createdAt = time::now(),
                    updatedAt = time::now()
            `, {
                username: userData.username,
                email: userData.email,
                password: userData.password,
                role: userData.role || "user"
            });

            if (!result || result.length === 0) {
                throw new Error("User creation failed");
            }

            return { ...result[0], id: String(result[0].id.id) };
        } catch (error) {
            throw new Error(`User creation failed: ${error}`);
        }
    }

    async getAllUsers(): Promise<Omit<User, "password">[]> {
        await this.connect();
        const [result] = await this.db.query<[IUser[]]>("SELECT * OMIT password FROM users ORDER BY createdAt DESC");
        return result.map(user => ({ ...user, id: String(user.id.id) }));
    }

    async updateUser(id: string, updates: Partial<Omit<User, "id" | "createdAt" | "password">>): Promise<User> {
        await this.connect();
        
        const [result] = await this.db.query<[IUser[]]>(`
            UPDATE users:$id SET
                username = $username OR username,
                email = $email OR email,
                role = $role OR role,
                isActive = $isActive OR isActive,
                updatedAt = time::now()
            RETURN *
        `, {
            id,
            ...updates
        });

        if (!result || result.length === 0) {
            throw new Error("User update failed");
        }

        return { ...result[0], id: id };
    }

    async deleteUser(id: string): Promise<boolean> {
        await this.connect();
        const [result] = await this.db.query<[any[]]>("DELETE users:$id", { id });
        return result.length > 0;
    }

    async changePassword(userId: string, oldPassword: string, newPassword: string): Promise<void> {
        await this.connect();
        
        const [user] = await this.db.query<[IUser[]]>(`
            SELECT * FROM users:$userId WHERE crypto::argon2::compare(password, $oldPassword)
        `, {
            userId,
            oldPassword
        });

        if (!user || user.length === 0) {
            throw new Error("Invalid current password");
        }

        await this.db.query(`
            UPDATE users:$userId SET
                password = crypto::argon2::generate($newPassword),
                updatedAt = time::now()
        `, {
            userId,
            newPassword
        });
    }

    checkPermission(userRole: UserRole, resource: string, action: string): boolean {
        return DEFAULT_PERMISSIONS.some(
            permission => 
                permission.role === userRole && 
                permission.resource === resource && 
                permission.action === action
        );
    }

    async createAuthenticatedConnection(token: string): Promise<Surreal> {
        const db = new Surreal({
            engines: surrealdbNodeEngines(),
        });
        
        await db.connect("surrealkv://scheduler", {
            database: "scheduler",
            namespace: "scheduler",
        });

        await db.authenticate(token);
        return db;
    }
}

export const authService = new AuthService();