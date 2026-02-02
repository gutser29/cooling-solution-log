// lib/googleDrive.ts

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3'
const FOLDER_NAME = 'CoolingSolutionLog'
const BACKUP_FILE = 'cooling-solution-backup.json'

// ============ TOKEN ============

export async function getAccessToken(refreshToken: string): Promise<string> {
  console.log('🔑 Requesting access token...')
  console.log('🔑 Client ID present:', !!process.env.GOOGLE_CLIENT_ID)
  console.log('🔑 Client Secret present:', !!process.env.GOOGLE_CLIENT_SECRET)
  console.log('🔑 Refresh token length:', refreshToken?.length)

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  const data = await res.json()

  if (!data.access_token) {
    console.error('❌ Token refresh failed:', JSON.stringify(data))
    throw new Error(`Token refresh failed: ${data.error || 'no access_token'} - ${data.error_description || ''}`)
  }

  console.log('✅ Got access token, scope:', data.scope)
  return data.access_token
}

// ============ TEST TOKEN ============

export async function testDriveAccess(accessToken: string): Promise<{ ok: boolean; error?: string; info?: any }> {
  try {
    // Simple test: list files (limit 1)
    const res = await fetch(`${DRIVE_API}/files?pageSize=1&fields=files(id,name)`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    const data = await res.json()

    if (!res.ok) {
      return { ok: false, error: `${res.status}: ${JSON.stringify(data)}` }
    }

    return { ok: true, info: { status: res.status, fileCount: data.files?.length } }
  } catch (e: any) {
    return { ok: false, error: e.message }
  }
}

// ============ FOLDER ============

export async function getOrCreateFolder(accessToken: string): Promise<string> {
  // Search for existing folder
  const q = encodeURIComponent(`name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`)
  const searchRes = await fetch(`${DRIVE_API}/files?q=${q}&fields=files(id,name)`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!searchRes.ok) {
    const errBody = await searchRes.text()
    console.error('❌ Folder search failed:', searchRes.status, errBody)
    throw new Error(`Folder search failed: ${searchRes.status}`)
  }

  const searchData = await searchRes.json()
  console.log('📁 Folder search result:', JSON.stringify(searchData))

  if (searchData.files && searchData.files.length > 0) {
    console.log('📁 Found existing folder:', searchData.files[0].id)
    return searchData.files[0].id
  }

  // Create folder
  console.log('📁 Creating new folder...')
  const createRes = await fetch(`${DRIVE_API}/files`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
    }),
  })

  const createBody = await createRes.json()

  if (!createRes.ok) {
    console.error('❌ Folder create failed:', createRes.status, JSON.stringify(createBody))
    throw new Error(`Folder create failed: ${createRes.status} - ${createBody.error?.message || JSON.stringify(createBody)}`)
  }

  console.log('📁 Created folder:', createBody.id)
  return createBody.id
}

// ============ FIND BACKUP FILE ============

async function findBackupFile(accessToken: string, folderId: string): Promise<string | null> {
  const q = encodeURIComponent(`name='${BACKUP_FILE}' and '${folderId}' in parents and trashed=false`)
  const res = await fetch(`${DRIVE_API}/files?q=${q}&fields=files(id,modifiedTime)`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!res.ok) {
    const errBody = await res.text()
    console.error('❌ File search failed:', res.status, errBody)
    return null
  }

  const data = await res.json()
  return data.files?.[0]?.id || null
}

// ============ UPLOAD BACKUP ============

export async function uploadBackup(accessToken: string, folderId: string, backupData: any): Promise<void> {
  const existingId = await findBackupFile(accessToken, folderId)
  const content = JSON.stringify(backupData)
  console.log('☁️ Uploading backup, size:', content.length, 'bytes, existing file:', existingId)

  if (existingId) {
    const res = await fetch(`${DRIVE_UPLOAD}/files/${existingId}?uploadType=media`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: content,
    })

    if (!res.ok) {
      const errBody = await res.text()
      console.error('❌ File update failed:', res.status, errBody)
      throw new Error(`File update failed: ${res.status}`)
    }
    console.log('☁️ Backup updated')
  } else {
    // Multipart upload
    const boundary = '===CoolingSolution==='
    const metadata = JSON.stringify({
      name: BACKUP_FILE,
      parents: [folderId],
      mimeType: 'application/json',
    })

    const body = [
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      metadata,
      `--${boundary}`,
      'Content-Type: application/json',
      '',
      content,
      `--${boundary}--`,
    ].join('\r\n')

    const res = await fetch(`${DRIVE_UPLOAD}/files?uploadType=multipart`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    })

    if (!res.ok) {
      const errBody = await res.text()
      console.error('❌ File create failed:', res.status, errBody)
      throw new Error(`File create failed: ${res.status}`)
    }

    const result = await res.json()
    console.log('☁️ Backup created:', result.id)
  }
}

// ============ DOWNLOAD BACKUP ============

export async function downloadBackup(accessToken: string, folderId: string): Promise<any | null> {
  const fileId = await findBackupFile(accessToken, folderId)
  if (!fileId) {
    console.log('📥 No backup file found')
    return null
  }

  const res = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!res.ok) {
    console.error('❌ Download failed:', res.status)
    return null
  }

  return await res.json()
}