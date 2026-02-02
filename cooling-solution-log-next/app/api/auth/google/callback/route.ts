// app/api/auth/google/callback/route.ts
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const error = url.searchParams.get('error')

  const baseUrl = process.env.GOOGLE_REDIRECT_URI!.replace('/api/auth/google/callback', '')

  console.log('🔐 Google callback received')
  console.log('🔐 Code present:', !!code)
  console.log('🔐 Error:', error)
  console.log('🔐 Redirect URI:', process.env.GOOGLE_REDIRECT_URI)

  if (error || !code) {
    console.error('❌ Google OAuth error:', error)
    return NextResponse.redirect(`${baseUrl}/?google=error&reason=${error || 'no_code'}`)
  }

  try {
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      code,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
      grant_type: 'authorization_code',
    })

    console.log('🔐 Exchanging code for tokens...')
    console.log('🔐 Client ID:', process.env.GOOGLE_CLIENT_ID?.substring(0, 20) + '...')

    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    })

    const tokenData = await tokenRes.json()

    console.log('🔐 Token response status:', tokenRes.status)
    console.log('🔐 Token response keys:', Object.keys(tokenData))
    console.log('🔐 Has access_token:', !!tokenData.access_token)
    console.log('🔐 Has refresh_token:', !!tokenData.refresh_token)
    console.log('🔐 Scope:', tokenData.scope)
    console.log('🔐 Token type:', tokenData.token_type)

    if (tokenData.error) {
      console.error('❌ Token exchange error:', tokenData.error, tokenData.error_description)
      return NextResponse.redirect(`${baseUrl}/?google=error_token&reason=${tokenData.error}`)
    }

    if (!tokenData.refresh_token) {
      console.error('❌ No refresh_token in response')
      console.error('❌ Full response:', JSON.stringify(tokenData))
      // Si tenemos access_token pero no refresh_token, puede ser porque ya autorizó antes
      // Guardar access_token temporalmente como fallback
      if (tokenData.access_token) {
        console.log('⚠️ Got access_token but no refresh_token - user may need to revoke and re-auth')
        return NextResponse.redirect(`${baseUrl}/?google=error_no_refresh`)
      }
      return NextResponse.redirect(`${baseUrl}/?google=error_no_tokens`)
    }

    // Store refresh token in httpOnly cookie
    const response = NextResponse.redirect(`${baseUrl}/?google=connected`)

    response.cookies.set('google_refresh_token', tokenData.refresh_token, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365,
      path: '/',
    })

    console.log('✅ Google Drive connected! Refresh token saved in cookie.')
    console.log('✅ Token length:', tokenData.refresh_token.length)
    return response
  } catch (err: any) {
    console.error('❌ Callback exception:', err.message)
    return NextResponse.redirect(`${baseUrl}/?google=error_exchange`)
  }
}