// app/api/sync/status/route.ts
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const cookieStore = await cookies()
    const refreshToken = cookieStore.get('google_refresh_token')?.value
    return NextResponse.json({ connected: !!refreshToken })
  } catch {
    return NextResponse.json({ connected: false })
  }
}

// DELETE: Disconnect Google Drive
export async function DELETE() {
  try {
    const cookieStore = await cookies()
    cookieStore.delete('google_refresh_token')
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ success: false })
  }
}