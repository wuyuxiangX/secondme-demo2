import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { createOAuthState } from '@/lib/db';

export async function POST() {
  try {
    const state = uuidv4();
    createOAuthState(state);

    const scopes = process.env.SCOPES?.split(',') || [];

    return NextResponse.json({
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
    return NextResponse.json({ error: 'Failed to initiate authorization' }, { status: 500 });
  }
}
