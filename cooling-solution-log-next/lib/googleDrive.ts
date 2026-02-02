// lib/googleDrive.ts
// Server-side Google Drive helpers - NO npm packages needed, uses fetch

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3'
const FOLDER_NAME = 'CoolingSolutionLog'
const BACKUP_FILE = 'cooling-solution-backup.json'

// ============ TOKEN ============

export async function getAccessToken(refreshToken: string): Promise<string> {
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
    console.error('Token refresh failed:', data)
    throw new Error('Failed to refresh Google token')
  }
  return data.access_token
}

// ============ FOLDER ============

export async function getOrCreateFolder(accessToken: string): Promise<string> {
  // Search for existing folder
  const q = encodeURIComponent(`name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`)
  const searchRes = await fetch(`${DRIVE_API}/files?q=${q}&fields=files(id,name)`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const searchData = await searchRes.json()

  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id
  }

  // Create folder
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
  const folder = await createRes.json()
  console.log('📁 Created Drive folder:', folder.id)
  return folder.id
}

// ============ FIND BACKUP FILE ============

async function findBackupFile(accessToken: string, folderId: string): Promise<string | null> {
  const q = encodeURIComponent(`name='${BACKUP_FILE}' and '${folderId}' in parents and trashed=false`)
  const res = await fetch(`${DRIVE_API}/files?q=${q}&fields=files(id,modifiedTime)`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const data = await res.json()
  return data.files?.[0]?.id || null
}

// ============ UPLOAD BACKUP ============

export async function uploadBackup(accessToken: string, folderId: string, backupData: any): Promise<void> {
  const existingId = await findBackupFile(accessToken, folderId)
  const content = JSON.stringify(backupData)

  if (existingId) {
    // Update existing file (simple media upload)
    const res = await fetch(`${DRIVE_UPLOAD}/files/${existingId}?uploadType=media`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: content,
    })
    if (!res.ok) throw new Error(`Drive upload failed: ${res.status}`)
    console.log('☁️ Backup updated in Drive')
  } else {
    // Create new file (multipart: metadata + content)
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
    if (!res.ok) throw new Error(`Drive create failed: ${res.status}`)
    console.log('☁️ Backup created in Drive')
  }
}

// ============ DOWNLOAD BACKUP ============

export async function downloadBackup(accessToken: string, folderId: string): Promise<any | null> {
  const fileId = await findBackupFile(accessToken, folderId)
  if (!fileId) return null

  const res = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!res.ok) return null
  return await res.json()
}