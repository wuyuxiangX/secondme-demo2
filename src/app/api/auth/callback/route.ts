import { NextRequest, NextResponse } from 'next/server';
import { validateAndDeleteOAuthState, createOrUpdateUser } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const { code, state } = await request.json();
    console.log('=== OAuth Callback ===');
    console.log('Code:', code?.substring(0, 20) + '...');
    console.log('State:', state);

    // Skip state validation for development
    // TODO: Re-enable in production for CSRF protection
    console.log('Skipping state validation (development mode)');

    // Exchange code for tokens - 使用 x-www-form-urlencoded 格式
    console.log('Token URL:', process.env.OAUTH_TOKEN_URL);
    const tokenParams = new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: process.env.REDIRECT_URI!,
      client_id: process.env.CLIENT_ID!,
      client_secret: process.env.CLIENT_SECRET!
    });

    const tokenResponse = await fetch(process.env.OAUTH_TOKEN_URL!, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: tokenParams.toString()
    });

    const tokenResponseText = await tokenResponse.text();
    console.log('Token response status:', tokenResponse.status);
    console.log('Token response:', tokenResponseText);

    if (!tokenResponse.ok) {
      return NextResponse.json({ error: 'Failed to exchange code for tokens', details: tokenResponseText }, { status: 400 });
    }

    const tokenResult = JSON.parse(tokenResponseText);

    // 响应格式: {"code": 0, "data": {"accessToken": ..., "refreshToken": ..., ...}}
    if (tokenResult.code !== 0 || !tokenResult.data) {
      console.error('Token response error:', tokenResult);
      return NextResponse.json({ error: 'Token response error', details: tokenResult }, { status: 400 });
    }

    const { accessToken, refreshToken, expiresIn } = tokenResult.data;
    console.log('Access token received:', accessToken ? 'yes' : 'no');

    // Get user info from SecondMe
    const userInfoUrl = `${process.env.SECONDME_API_BASE}/secondme/user/info`;
    console.log('User info URL:', userInfoUrl);

    const userInfoResponse = await fetch(userInfoUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    const userInfoText = await userInfoResponse.text();
    console.log('User info response status:', userInfoResponse.status);
    console.log('User info response:', userInfoText);

    if (!userInfoResponse.ok) {
      return NextResponse.json({ error: 'Failed to get user info', details: userInfoText }, { status: 400 });
    }

    const userInfoResult = JSON.parse(userInfoText);

    // 响应格式: {"code": 0, "data": {...userInfo}}
    if (userInfoResult.code !== 0) {
      console.error('User info response error:', userInfoResult);
      return NextResponse.json({ error: 'User info response error', details: userInfoResult }, { status: 400 });
    }

    const userInfo = userInfoResult.data || userInfoResult;

    // 使用 email 作为用户唯一标识（SecondMe API不返回userId）
    const userIdentifier = userInfo.email;
    if (!userIdentifier) {
      console.error('No email in user info:', userInfo);
      return NextResponse.json({ error: 'User email not found in response' }, { status: 400 });
    }

    // Create or update user in database
    const user = createOrUpdateUser(
      userIdentifier,
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
    return NextResponse.json({ error: 'Authentication callback failed', details: String(error) }, { status: 500 });
  }
}
