// app/api/sync/drive/route.ts
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getAccessToken, getOrCreateFolder, uploadBackup, downloadBackup } from '@/lib/googleDrive'

export const runtime = 'nodejs'

// POST: Push local data to Google Drive
export async function POST(request: Request) {
  try {
    const cookieStore = await cookies()
    const refreshToken = cookieStore.get('google_refresh_token')?.value

    console.log('☁️ Sync POST - has refresh token:', !!refreshToken)

    if (!refreshToken) {
      return NextResponse.json({ error: 'not_connected', message: 'No refresh token. Reconnect Google Drive.' }, { status: 401 })
    }

    const data = await request.json()
    console.log('☁️ Data to sync - events:', data.events?.length, 'clients:', data.clients?.length, 'jobs:', data.jobs?.length)

    const accessToken = await getAccessToken(refreshToken)
    console.log('☁️ Got access token')

    const folderId = await getOrCreateFolder(accessToken)
    console.log('☁️ Got folder:', folderId)

    await uploadBackup(accessToken, folderId, {
      ...data,
      lastSync: Date.now(),
      appVersion: '2.0',
    })

    console.log('☁️ Sync complete!')
    return NextResponse.json({ success: true, timestamp: Date.now() })
  } catch (err: any) {
    console.error('❌ Drive push error:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// GET: Pull backup from Google Drive
export async function GET() {
  try {
    const cookieStore = await cookies()
    const refreshToken = cookieStore.get('google_refresh_token')?.value

    if (!refreshToken) {
      return NextResponse.json({ error: 'not_connected' }, { status: 401 })
    }

    const accessToken = await getAccessToken(refreshToken)
    const folderId = await getOrCreateFolder(accessToken)
    const backup = await downloadBackup(accessToken, folderId)

    if (!backup) {
      return NextResponse.json({ success: true, data: null, message: 'No backup found' })
    }

    return NextResponse.json({ success: true, data: backup })
  } catch (err: any) {
    console.error('❌ Drive pull error:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}