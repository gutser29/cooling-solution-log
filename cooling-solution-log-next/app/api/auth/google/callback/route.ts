// app/api/auth/google/callback/route.ts
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const error = url.searchParams.get('error')

  // Base URL for redirects
  const baseUrl = process.env.GOOGLE_REDIRECT_URI!.replace('/api/auth/google/callback', '')

  if (error || !code) {
    console.error('Google OAuth error:', error)
    return NextResponse.redirect(`${baseUrl}/?google=error`)
  }

  try {
    // Exchange authorization code for tokens
    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        code,
        redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
        grant_type: 'authorization_code',
      }),
    })

    const tokenData = await tokenRes.json()
    console.log('Google token response keys:', Object.keys(tokenData))

    if (!tokenData.refresh_token) {
      console.error('No refresh_token received:', tokenData)
      return NextResponse.redirect(`${baseUrl}/?google=error_no_refresh`)
    }

    // Store refresh token in httpOnly cookie (secure, 1 year)
    const response = NextResponse.redirect(`${baseUrl}/?google=connected`)

    response.cookies.set('google_refresh_token', tokenData.refresh_token, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365, // 1 year
      path: '/',
    })

    console.log('✅ Google Drive connected successfully')
    return response
  } catch (err: any) {
    console.error('Google callback error:', err)
    return NextResponse.redirect(`${baseUrl}/?google=error_exchange`)
  }
}