// app/api/sync/photos/route.ts
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getAccessToken, getOrCreateFolder } from '@/lib/googleDrive'

export const runtime = 'nodejs'

const PHOTOS_FOLDER_NAME = 'Photos'

async function getOrCreatePhotosFolder(accessToken: string, parentFolderId: string): Promise<string> {
  const DRIVE_API = 'https://www.googleapis.com/drive/v3'
  
  const q = encodeURIComponent(`name='${PHOTOS_FOLDER_NAME}' and '${parentFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`)
  const searchRes = await fetch(`${DRIVE_API}/files?q=${q}&fields=files(id,name)`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  const searchData = await searchRes.json()
  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id
  }

  const createRes = await fetch(`${DRIVE_API}/files`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: PHOTOS_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentFolderId],
    }),
  })

  const createBody = await createRes.json()
  if (!createRes.ok) {
    throw new Error(`Photos folder create failed: ${createRes.status}`)
  }

  return createBody.id
}

export async function GET() {
  try {
    const cookieStore = await cookies()
    const refreshToken = cookieStore.get('google_refresh_token')?.value

    if (!refreshToken) {
      return NextResponse.json({ error: 'not_connected' }, { status: 401 })
    }

    const accessToken = await getAccessToken(refreshToken)
    const mainFolderId = await getOrCreateFolder(accessToken)
    const photosFolderId = await getOrCreatePhotosFolder(accessToken, mainFolderId)

    return NextResponse.json({
      success: true,
      accessToken,
      photosFolderId,
    })
  } catch (err: any) {
    console.error('Photos route error:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}