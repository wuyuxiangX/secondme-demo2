# Comic Books - SecondMe OAuth Integration

A demo project integrating SecondMe OAuth2 authentication with a Next.js frontend and Node.js backend.

## Project Structure

```
.
├── frontend/          # Next.js frontend application
│   ├── src/
│   │   ├── app/      # Next.js app router pages
│   │   ├── components/
│   │   └── contexts/
│   └── package.json
├── backend/           # Node.js backend API
│   ├── src/
│   │   ├── routes/
│   │   ├── db.js
│   │   └── index.js
│   ├── data/         # SQLite database storage
│   └── package.json
└── README.md
```

## Setup

### 1. Install Dependencies

```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

### 2. Start the Backend

```bash
cd backend
npm run dev
```

The backend runs on `http://localhost:3001`

### 3. Start the Frontend (HTTPS required)

```bash
cd frontend
npm run dev
```

The frontend runs on `https://localhost:3000`

> Note: HTTPS is required for the OAuth callback. Next.js will create a self-signed certificate automatically.

## OAuth Flow

1. User clicks "Login with SecondMe"
2. Frontend requests authorization URL from backend
3. User is redirected to SecondMe authorization page
4. After authorization, user is redirected back to `https://localhost:3000/auth/callback`
5. Frontend sends the authorization code to backend
6. Backend exchanges the code for access/refresh tokens
7. User info is fetched and stored in the database
8. User is logged in and can access protected resources

## API Endpoints

### Backend API

- `POST /api/auth/authorize` - Initiate OAuth flow
- `POST /api/auth/callback` - Handle OAuth callback
- `POST /api/auth/refresh` - Refresh access token
- `POST /api/auth/logout` - Logout user
- `GET /api/user/me` - Get current user info
- `GET /api/user/secondme/*` - Proxy GET requests to SecondMe API
- `POST /api/user/secondme/*` - Proxy POST requests to SecondMe API

## Configuration

### Backend (.env)

- `CLIENT_ID` - SecondMe OAuth client ID
- `CLIENT_SECRET` - SecondMe OAuth client secret
- `REDIRECT_URI` - OAuth callback URL
- `SCOPES` - Requested OAuth scopes

### Frontend (.env.local)

- `NEXT_PUBLIC_API_URL` - Backend API URL
