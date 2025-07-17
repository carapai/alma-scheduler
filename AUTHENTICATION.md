# Authentication System Implementation

## 🔐 Overview

This document describes the comprehensive authentication and authorization system implemented using SurrealDB's built-in authentication features.

## 🏗️ Architecture

### Core Components

1. **AuthService** (`src/auth-service.ts`) - SurrealDB native authentication
2. **AuthMiddleware** (`src/auth-middleware.ts`) - Request authentication & authorization
3. **AuthRoutes** (`src/auth-routes.ts`) - HTTP endpoints for auth operations
4. **Updated ScheduleService** (`src/schedule-service.ts`) - Database operations with auth context

### Database Schema

```sql
-- Users table with role-based permissions
DEFINE TABLE users SCHEMALESS PERMISSIONS 
    FOR select WHERE id = $auth.id OR $auth.role = 'admin'
    FOR create, update, delete WHERE $auth.role = 'admin'
    FOR create WHERE $auth = NONE;

-- Schedules table with user-context permissions
DEFINE TABLE schedules SCHEMALESS PERMISSIONS
    FOR select WHERE $auth.role IN ['admin', 'user', 'viewer']
    FOR create, update, delete WHERE $auth.role IN ['admin', 'user']
    FOR create WHERE $auth = NONE;

-- Access method for user authentication
DEFINE ACCESS user_access ON DATABASE TYPE RECORD
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
```

## 🔑 Authentication Endpoints

### Public Endpoints
- `POST /api/auth/login` - User login
- `POST /api/auth/register` - User registration

### Protected Endpoints
- `POST /api/auth/logout` - User logout
- `GET /api/auth/profile` - Get user profile
- `POST /api/auth/change-password` - Change user password

### Admin-Only Endpoints
- `GET /api/auth/users` - List all users
- `POST /api/auth/users` - Create new user
- `PUT /api/auth/users/:id` - Update user
- `DELETE /api/auth/users/:id` - Delete user

## 🛡️ Protected API Endpoints

All existing API endpoints are now protected with appropriate permissions:

### Schedule Operations
- `GET /api/schedules` - Requires "schedules:read" permission
- `POST /api/schedules` - Requires "schedules:create" permission
- `GET /api/schedules/:id` - Requires "schedules:read" permission
- `PUT /api/schedules/:id` - Requires "schedules:update" permission
- `DELETE /api/schedules/:id` - Requires "schedules:delete" permission
- `POST /api/schedules/:id/start` - Requires "schedules:start" permission
- `POST /api/schedules/:id/stop` - Requires "schedules:stop" permission

### Other Protected Endpoints
- `GET /api/processors` - Requires "processors:read" permission
- `GET /api/instances` - Requires "instances:read" permission

## 👥 User Roles & Permissions

### Roles
- **admin** - Full access to all resources
- **user** - Can manage schedules but not users
- **viewer** - Read-only access to schedules

### Permission Matrix

| Resource | Action | Admin | User | Viewer |
|----------|--------|-------|------|--------|
| schedules | read | ✅ | ✅ | ✅ |
| schedules | create | ✅ | ✅ | ❌ |
| schedules | update | ✅ | ✅ | ❌ |
| schedules | delete | ✅ | ✅ | ❌ |
| schedules | start | ✅ | ✅ | ❌ |
| schedules | stop | ✅ | ✅ | ❌ |
| users | read | ✅ | ❌ | ❌ |
| users | create | ✅ | ❌ | ❌ |
| users | update | ✅ | ❌ | ❌ |
| users | delete | ✅ | ❌ | ❌ |
| instances | read | ✅ | ✅ | ❌ |
| processors | read | ✅ | ✅ | ❌ |

## 🚀 Usage Examples

### 1. Login (Sets Cookie)
```bash
curl -X POST http://localhost:3003/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "admin123"
  }' \
  -c cookies.txt
```

### 2. Access Protected Endpoint (Using Cookie)
```bash
curl -X GET http://localhost:3003/api/schedules \
  -b cookies.txt
```

### 3. Access Protected Endpoint (Using Bearer Token)
```bash
curl -X GET http://localhost:3003/api/schedules \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### 4. Create Schedule (Using Cookie)
```bash
curl -X POST http://localhost:3003/api/schedules \
  -b cookies.txt \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Schedule",
    "type": "immediate",
    "processor": "dhis2-alma-sync",
    "data": {...}
  }'
```

### 5. Logout (Clears Cookie)
```bash
curl -X POST http://localhost:3003/api/auth/logout \
  -b cookies.txt \
  -c cookies.txt
```

## 🔧 Default Credentials

A default admin user is automatically created:
- **Username:** `admin`
- **Password:** `admin123`
- **Role:** `admin`

⚠️ **Important:** Change the default admin password in production!

## 🎨 User Interface Features

### Login Form
- **Location**: Displayed when user is not authenticated
- **Features**:
  - Username/password login
  - Toggle between login and registration
  - Form validation with error messages
  - Loading states during authentication
  - Displays default admin credentials for convenience

### Main Application
- **Authentication Gate**: Only accessible to authenticated users
- **Header**: Shows user info and logout dropdown
- **Automatic Session Management**: Handles token expiration gracefully
- **Protected Routes**: All API calls include authentication automatically

### Authentication Flow
1. User visits application
2. If not authenticated, shows login form
3. Upon successful login, cookie is set and user sees main app
4. User can logout via header dropdown
5. Cookie is cleared and user returns to login form

## 🧪 Testing

Run the authentication test suite:
```bash
bun run src/auth-test.ts
```

Run the cookie authentication test suite:
```bash
bun run src/cookie-auth-test.ts
```

This will test:
- Protected endpoint access without auth (should fail)
- Login with admin credentials (sets cookie)
- Protected endpoint access with cookie (should work)
- User profile retrieval with cookie
- Logout functionality (clears cookie)
- Protected endpoint access after logout (should fail)
- Admin-only operations
- User registration

## 🔒 Security Features

1. **Argon2 Password Hashing** - Industry-standard password hashing
2. **JWT Tokens** - Secure token-based authentication
3. **HTTPOnly Cookies** - Secure cookie-based session management
4. **Database-Level Permissions** - SurrealDB enforces access control
5. **Role-Based Access Control** - Fine-grained permission system
6. **Session Management** - Automatic token expiration (7 days)
7. **Input Validation** - Proper request validation
8. **CSRF Protection** - SameSite cookie policy

## 🛠️ Implementation Details

### Middleware Usage
```typescript
// Require authentication
const middleware = AuthMiddleware.requireAuth();

// Require specific role
const middleware = AuthMiddleware.requireRole("admin");

// Require specific permission
const middleware = AuthMiddleware.requirePermission("schedules", "create");
```

### Database Operations
All schedule operations now support authenticated database connections:
```typescript
// Using authenticated connection
const schedule = await scheduleService.createSchedule(data, req.db);
const schedules = await scheduleService.getAllSchedules(req.db);
```

## 📝 Notes

- All database operations are performed with the authenticated user's context
- SurrealDB's native authentication eliminates the need for external session stores
- Permissions are enforced at both the application and database levels
- Token validation is handled by SurrealDB's built-in authentication system