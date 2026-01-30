# SecondMe OAuth Integration Demo

A full-stack Next.js demo project integrating SecondMe OAuth2 authentication.

## Project Structure

```
.
├── src/
│   ├── app/
│   │   ├── api/           # Next.js API Routes
│   │   │   ├── auth/      # OAuth endpoints
│   │   │   ├── user/      # User endpoints
│   │   │   └── health/
│   │   ├── auth/callback/ # OAuth callback page
│   │   └── page.tsx       # Home page
│   ├── components/        # React components
│   ├── contexts/          # React contexts
│   └── lib/               # Server-side utilities
│       └── db.ts          # SQLite database
├── data/                  # SQLite database storage
├── package.json
└── README.md
```

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Create a `.env.local` file:

```env
# SecondMe OAuth Configuration
CLIENT_ID=your_client_id
CLIENT_SECRET=your_client_secret
REDIRECT_URI=https://localhost:3000/auth/callback
SCOPES=read,write

# SecondMe API URLs
OAUTH_AUTHORIZE_URL=https://secondme.io/oauth/authorize
OAUTH_TOKEN_URL=https://secondme.io/oauth/token
OAUTH_REFRESH_URL=https://secondme.io/oauth/refresh
SECONDME_API_BASE=https://api.secondme.io
```

### 3. Start Development Server

```bash
npm run dev
```

The app runs on `http://localhost:3000`

For HTTPS (required for OAuth callback):

```bash
npm run dev:https
```

## OAuth Flow

1. User clicks "Login with SecondMe"
2. App generates authorization URL and state
3. User is redirected to SecondMe authorization page
4. After authorization, user is redirected back to `/auth/callback`
5. App exchanges the authorization code for tokens
6. User info is fetched and stored in the database
7. User is logged in and can access protected resources

## API Endpoints

- `POST /api/auth/authorize` - Initiate OAuth flow
- `POST /api/auth/callback` - Handle OAuth callback
- `POST /api/auth/refresh` - Refresh access token
- `POST /api/auth/logout` - Logout user
- `GET /api/user/me` - Get current user info
- `GET /api/user/secondme/*` - Proxy GET requests to SecondMe API
- `POST /api/user/secondme/*` - Proxy POST requests to SecondMe API
- `GET /api/health` - Health check

## Deployment

This is a standard Next.js application that can be deployed to:

- Vercel (recommended)
- Railway
- Render
- Any Node.js hosting platform

Note: SQLite database is used for development. For production, consider using a hosted database service.
