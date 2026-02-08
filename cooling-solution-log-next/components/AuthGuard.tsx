'use client'

import React, { useState, useEffect, useRef } from 'react'

interface AuthGuardProps {
  children: React.ReactNode
}

const AUTH_KEY = 'cs_auth_token'
const SESSION_DURATION = 24 * 60 * 60 * 1000 // 24 horas

export default function AuthGuard({ children }: AuthGuardProps) {
  const [authenticated, setAuthenticated] = useState(false)
  const [loading, setLoading] = useState(true)
  const [pin, setPin] = useState(['', '', '', ''])
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(false)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    checkSession()
  }, [])

  const checkSession = () => {
    try {
      const session = localStorage.getItem(AUTH_KEY)
      if (session) {
        const { timestamp } = JSON.parse(session)
        if (Date.now() - timestamp < SESSION_DURATION) {
          setAuthenticated(true)
          setLoading(false)
          return
        }
      }
      setLoading(false)
    } catch {
      setLoading(false)
    }
  }

  const handlePinInput = (index: number, value: string) => {
    if (!/^\d?$/.test(value)) return
    const newPin = [...pin]
    newPin[index] = value
    setPin(newPin)
    if (value && index < 3) {
      inputRefs.current[index + 1]?.focus()
    }
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !pin[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
  }

  const validatePin = async (enteredPin: string) => {
    setChecking(true)
    setError('')
    try {
      const res = await fetch('/api/auth/pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: enteredPin })
      })
      const data = await res.json()

      if (data.success) {
        localStorage.setItem(AUTH_KEY, JSON.stringify({ timestamp: Date.now(), token: data.token }))
        setAuthenticated(true)
      } else {
        setError('PIN incorrecto')
        setPin(['', '', '', ''])
        inputRefs.current[0]?.focus()
      }
    } catch {
      setError('Error de conexión')
      setPin(['', '', '', ''])
    } finally {
      setChecking(false)
    }
  }

  useEffect(() => {
    if (pin.every(d => d !== '')) {
      validatePin(pin.join(''))
    }
  }, [pin])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0b1220] flex items-center justify-center">
        <div className="text-cyan-400 text-lg">Cargando...</div>
      </div>
    )
  }

  if (authenticated) {
    return <>{children}</>
  }

  return (
    <div className="min-h-screen bg-[#0b1220] flex items-center justify-center p-4">
      <div className="bg-[#111a2e] rounded-2xl p-6 max-w-sm w-full shadow-2xl border border-white/10">
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">❄️</div>
          <h1 className="text-xl font-bold text-cyan-400">Cooling Solution</h1>
          <p className="text-xs text-gray-400 mt-1">&quot;Donde tu confort es nuestra prioridad&quot;</p>
        </div>

        <p className="text-center text-sm text-gray-300 mb-2">Ingresa tu PIN</p>

        <div className="flex gap-3 justify-center my-6">
          {[0, 1, 2, 3].map(i => (
            <input
              key={i}
              ref={el => { inputRefs.current[i] = el }}
              type="password"
              inputMode="numeric"
              maxLength={1}
              value={pin[i]}
              onChange={(e) => handlePinInput(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              disabled={checking}
              className="w-14 h-14 text-center text-2xl font-bold bg-[#0b1220] border-2 border-white/20 rounded-xl text-white focus:border-cyan-400 focus:outline-none disabled:opacity-50"
            />
          ))}
        </div>

        {checking && (
          <p className="text-center text-sm text-cyan-400 mt-2">Verificando...</p>
        )}

        {error && (
          <p className="text-center text-sm text-red-400 mt-2">{error}</p>
        )}
      </div>
    </div>
  )
}