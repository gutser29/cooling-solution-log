// app/api/sync/test/route.ts
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getAccessToken, testDriveAccess, getOrCreateFolder } from '@/lib/googleDrive'

export const runtime = 'nodejs'

export async function GET() {
  const results: any = {
    step1_env: {},
    step2_cookie: {},
    step3_token: {},
    step4_drive_access: {},
    step5_folder: {},
  }

  try {
    // Step 1: Check env vars
    results.step1_env = {
      client_id: !!process.env.GOOGLE_CLIENT_ID,
      client_id_preview: process.env.GOOGLE_CLIENT_ID?.substring(0, 20) + '...',
      client_secret: !!process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI,
    }

    // Step 2: Check cookie
    const cookieStore = await cookies()
    const refreshToken = cookieStore.get('google_refresh_token')?.value
    results.step2_cookie = {
      has_refresh_token: !!refreshToken,
      token_length: refreshToken?.length || 0,
      token_preview: refreshToken ? refreshToken.substring(0, 10) + '...' : 'NONE',
    }

    if (!refreshToken) {
      results.error = 'No refresh token cookie found. Need to reconnect Google Drive.'
      return NextResponse.json(results)
    }

    // Step 3: Exchange for access token
    try {
      const accessToken = await getAccessToken(refreshToken)
      results.step3_token = {
        success: true,
        token_length: accessToken.length,
      }

      // Step 4: Test Drive access
      const testResult = await testDriveAccess(accessToken)
      results.step4_drive_access = testResult

      // Step 5: Try folder
      if (testResult.ok) {
        try {
          const folderId = await getOrCreateFolder(accessToken)
          results.step5_folder = { success: true, folder_id: folderId }
        } catch (e: any) {
          results.step5_folder = { success: false, error: e.message }
        }
      }
    } catch (e: any) {
      results.step3_token = { success: false, error: e.message }
    }

    return NextResponse.json(results)
  } catch (e: any) {
    return NextResponse.json({ error: e.message, results }, { status: 500 })
  }
}