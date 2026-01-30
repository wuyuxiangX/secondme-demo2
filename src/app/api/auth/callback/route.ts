import { NextRequest, NextResponse } from 'next/server';
import { validateAndDeleteOAuthState, createOrUpdateUser } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const { code, state } = await request.json();

    // Validate state
    if (!validateAndDeleteOAuthState(state)) {
      return NextResponse.json({ error: 'Invalid or expired state' }, { status: 400 });
    }

    // Exchange code for tokens
    const tokenResponse = await fetch(process.env.OAUTH_TOKEN_URL!, {
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
      return NextResponse.json({ error: 'Failed to exchange code for tokens' }, { status: 400 });
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
      return NextResponse.json({ error: 'Failed to get user info' }, { status: 400 });
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

    if (!user) {
      return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        userInfo: JSON.parse(user.user_info)
      }
    });
  } catch (error) {
    console.error('Callback error:', error);
    return NextResponse.json({ error: 'Authentication callback failed' }, { status: 500 });
  }
}
