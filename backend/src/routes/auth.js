import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import {
  createOAuthState,
  validateAndDeleteOAuthState,
  createOrUpdateUser,
  getUserById,
  updateUserTokens
} from '../db.js';

const router = Router();

// Generate authorization URL and state
router.post('/authorize', async (req, res) => {
  try {
    const state = uuidv4();
    createOAuthState(state);

    const scopes = process.env.SCOPES.split(',');

    // Return the authorization URL and parameters for the frontend to handle
    res.json({
      authorizeUrl: process.env.OAUTH_AUTHORIZE_URL,
      params: {
        clientId: process.env.CLIENT_ID,
        redirectUri: process.env.REDIRECT_URI,
        scope: scopes,
        state: state
      }
    });
  } catch (error) {
    console.error('Authorization error:', error);
    res.status(500).json({ error: 'Failed to initiate authorization' });
  }
});

// Exchange authorization code for tokens
router.post('/callback', async (req, res) => {
  try {
    const { code, state } = req.body;

    // Validate state
    if (!validateAndDeleteOAuthState(state)) {
      return res.status(400).json({ error: 'Invalid or expired state' });
    }

    // Exchange code for tokens
    const tokenResponse = await fetch(process.env.OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: process.env.REDIRECT_URI,
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET
      })
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      console.error('Token exchange failed:', errorData);
      return res.status(400).json({ error: 'Failed to exchange code for tokens' });
    }

    const tokenData = await tokenResponse.json();
    const { accessToken, refreshToken, expiresIn } = tokenData;

    // Get user info from SecondMe
    const userInfoResponse = await fetch(`${process.env.SECONDME_API_BASE}/secondme/user/info`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!userInfoResponse.ok) {
      console.error('Failed to get user info');
      return res.status(400).json({ error: 'Failed to get user info' });
    }

    const userInfo = await userInfoResponse.json();

    // Create or update user in database
    const user = createOrUpdateUser(
      userInfo.id || userInfo.userId,
      accessToken,
      refreshToken,
      expiresIn,
      userInfo
    );

    res.json({
      success: true,
      user: {
        id: user.id,
        userInfo: JSON.parse(user.user_info)
      }
    });
  } catch (error) {
    console.error('Callback error:', error);
    res.status(500).json({ error: 'Authentication callback failed' });
  }
});

// Refresh access token
router.post('/refresh', async (req, res) => {
  try {
    const { userId } = req.body;

    const user = getUserById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

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

    if (!refreshResponse.ok) {
      const errorData = await refreshResponse.text();
      console.error('Token refresh failed:', errorData);
      return res.status(400).json({ error: 'Failed to refresh token' });
    }

    const tokenData = await refreshResponse.json();
    const { accessToken, refreshToken, expiresIn } = tokenData;

    // Update tokens in database
    updateUserTokens(userId, accessToken, refreshToken, expiresIn);

    res.json({
      success: true,
      expiresIn
    });
  } catch (error) {
    console.error('Refresh error:', error);
    res.status(500).json({ error: 'Token refresh failed' });
  }
});

// Logout - just return success (frontend will clear local storage)
router.post('/logout', (req, res) => {
  res.json({ success: true });
});

export default router;
