import { Router } from 'express';
import { getUserById, updateUserTokens } from '../db.js';

const router = Router();

// Middleware to check authentication
async function authMiddleware(req, res, next) {
  const userId = req.headers['x-user-id'];

  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const user = getUserById(userId);
  if (!user) {
    return res.status(401).json({ error: 'User not found' });
  }

  // Check if token is expired and refresh if needed
  const now = Math.floor(Date.now() / 1000);
  if (user.token_expires_at < now + 300) { // Refresh 5 minutes before expiry
    try {
      const refreshResponse = await fetch(process.env.OAUTH_REFRESH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          grant_type: 'refresh_token',
          refresh_token: user.refresh_token,
          client_id: process.env.CLIENT_ID,
          client_secret: process.env.CLIENT_SECRET
        })
      });

      if (refreshResponse.ok) {
        const tokenData = await refreshResponse.json();
        updateUserTokens(userId, tokenData.accessToken, tokenData.refreshToken, tokenData.expiresIn);
        user.access_token = tokenData.accessToken;
      }
    } catch (error) {
      console.error('Auto refresh failed:', error);
    }
  }

  req.user = user;
  next();
}

// Get current user info
router.get('/me', authMiddleware, (req, res) => {
  res.json({
    id: req.user.id,
    userInfo: JSON.parse(req.user.user_info)
  });
});

// Proxy request to SecondMe API
router.get('/secondme/*', authMiddleware, async (req, res) => {
  try {
    const apiPath = req.params[0];
    const response = await fetch(`${process.env.SECONDME_API_BASE}/secondme/${apiPath}`, {
      headers: {
        'Authorization': `Bearer ${req.user.access_token}`
      }
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    console.error('API proxy error:', error);
    res.status(500).json({ error: 'Failed to fetch from SecondMe API' });
  }
});

// Proxy POST request to SecondMe API
router.post('/secondme/*', authMiddleware, async (req, res) => {
  try {
    const apiPath = req.params[0];
    const response = await fetch(`${process.env.SECONDME_API_BASE}/secondme/${apiPath}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${req.user.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(req.body)
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    console.error('API proxy error:', error);
    res.status(500).json({ error: 'Failed to fetch from SecondMe API' });
  }
});

export default router;
