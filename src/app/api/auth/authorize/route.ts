import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { createOAuthState } from '@/lib/db';

export async function POST() {
  try {
    const state = uuidv4();
    await createOAuthState(state);

    return NextResponse.json({
      authorizeUrl: 'https://go.second.me/oauth/',
      params: {
        client_id: process.env.CLIENT_ID,
        redirect_uri: process.env.REDIRECT_URI,
        response_type: 'code',
        state: state
      }
    });
  } catch (error) {
    console.error('Authorization error:', error);
    return NextResponse.json({ error: 'Failed to initiate authorization' }, { status: 500 });
  }
}
