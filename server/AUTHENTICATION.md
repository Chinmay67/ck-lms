# Authentication System Documentation

## Overview

The LMS now includes a complete authentication system with role-based access control (RBAC). This document explains the authentication setup, usage, and management.

## Features

- **JWT-based authentication** with secure token handling
- **Role-based access control** (superadmin, admin, user)
- **Password hashing** using bcrypt
- **Secure HTTP-only cookies** for token storage
- **Protected API routes** requiring authentication
- **User management** endpoints for creating and managing users

## User Roles

### Superadmin
- Full system access
- Can create and manage admin and user accounts
- Cannot be created through regular registration

### Admin
- Can manage students and system data
- Can create regular user accounts
- Can be created by superadmin

### User
- Can view and manage students
- Limited access to system features
- Can be created by superadmin or admin

## Initial Setup

### 1. Environment Configuration

Ensure these variables are set in your `.env` file:

```env
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=7d
```

### 2. Create Initial Superadmin

Run the CreateSuperAdmin script to create the first superadmin user:

```bash
cd server
npx tsx scripts/CreateSuperAdmin.ts
```

**Default Credentials:**
- Email: `admin@chessklub.com`
- Password: `Admin@123`

⚠️ **IMPORTANT:** Change the password immediately after first login!

## API Endpoints

### Authentication Endpoints

#### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "admin@chessklub.com",
  "password": "Admin@123"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "userId",
      "name": "Super Administrator",
      "email": "admin@chessklub.com",
      "role": "superadmin"
    },
    "token": "jwt-token-here"
  }
}
```

#### Register New User
```http
POST /api/auth/register
Content-Type: application/json
Authorization: Bearer <admin-or-superadmin-token>

{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "SecurePassword123",
  "role": "user"
}
```

**Notes:**
- Only superadmin can create admin users
- Admins can only create regular users
- Password must be at least 6 characters

#### Get Current User
```http
GET /api/auth/me
Authorization: Bearer <token>
```

#### Logout
```http
POST /api/auth/logout
```

## Frontend Integration

### Login Flow

1. User enters credentials on the login page
2. Frontend sends POST request to `/api/auth/login`
3. On success, token is stored in localStorage
4. User is redirected to the main application
5. All subsequent API requests include the token in the Authorization header

### Protected Routes

All student management routes are now protected and require authentication:

- `GET /api/students` - List students
- `GET /api/students/:id` - Get student details
- `POST /api/students` - Create student
- `PUT /api/students/:id` - Update student
- `DELETE /api/students/:id` - Delete student

### Using the Auth Context

```tsx
import { useAuth } from '../contexts/AuthContext';

function MyComponent() {
  const { user, isAuthenticated, logout } = useAuth();

  if (!isAuthenticated) {
    return <div>Please log in</div>;
  }

  return (
    <div>
      <p>Welcome, {user.name}!</p>
      <p>Role: {user.role}</p>
      <button onClick={logout}>Logout</button>
    </div>
  );
}
```

## Security Best Practices

### Password Requirements
- Minimum 6 characters (configurable)
- Should include uppercase, lowercase, numbers, and special characters
- Passwords are hashed using bcrypt with salt rounds of 10

### Token Security
- JWT tokens expire after 7 days (configurable via JWT_EXPIRES_IN)
- Tokens are stored in localStorage on the client
- Tokens are validated on every protected route request
- Include tokens in Authorization header: `Bearer <token>`

### Production Recommendations

1. **Change Default Credentials**
   - Immediately change the superadmin password after first login
   - Use strong, unique passwords for all accounts

2. **Secure JWT_SECRET**
   - Use a long, random string (at least 32 characters)
   - Never commit the JWT_SECRET to version control
   - Rotate the secret periodically

3. **HTTPS Only**
   - Always use HTTPS in production
   - Consider using secure cookies instead of localStorage for tokens

4. **Rate Limiting**
   - Implement rate limiting on login endpoints
   - Consider adding CAPTCHA for repeated failed login attempts

5. **Session Management**
   - Implement token refresh mechanism
   - Add session timeout after inactivity
   - Maintain a blacklist for revoked tokens

## User Management

### Creating New Users

Superadmins and admins can create new users through the API:

```bash
# Create a new user (requires admin or superadmin token)
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
