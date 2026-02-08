'use client'

import React, { useState, useEffect, useRef } from 'react'

interface AuthGuardProps {
  children: React.ReactNode
}

const AUTH_KEY = 'cs_auth_token'
const PIN_KEY = 'cs_pin_hash'
const SESSION_DURATION = 24 * 60 * 60 * 1000 // 24 horas

function hashPin(pin: string): string {
  let hash = 0
  const salt = 'CoolingSolution2026'
  const salted = salt + pin + salt
  for (let i = 0; i < salted.length; i++) {
    const char = salted.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash |= 0
  }
  return hash.toString(36)
}

export default function AuthGuard({ children }: AuthGuardProps) {
  const [authenticated, setAuthenticated] = useState(false)
  const [loading, setLoading] = useState(true)
  const [pin, setPin] = useState(['', '', '', ''])
  const [confirmPin, setConfirmPin] = useState(['', '', '', ''])
  const [mode, setMode] = useState<'check' | 'login' | 'setup' | 'confirm'>('check')
  const [error, setError] = useState('')
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])
  const confirmRefs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    checkAuth()
  }, [])

  const checkAuth = () => {
    try {
      const storedHash = localStorage.getItem(PIN_KEY)
      if (!storedHash) {
        setMode('setup')
        setLoading(false)
        return
      }

      const session = localStorage.getItem(AUTH_KEY)
      if (session) {
        const { timestamp } = JSON.parse(session)
        if (Date.now() - timestamp < SESSION_DURATION) {
          setAuthenticated(true)
          setLoading(false)
          return
        }
      }

      setMode('login')
      setLoading(false)
    } catch {
      setMode('setup')
      setLoading(false)
    }
  }

  const handlePinInput = (
    index: number,
    value: string,
    pinArray: string[],
    setPinArray: React.Dispatch<React.SetStateAction<string[]>>,
    refs: React.MutableRefObject<(HTMLInputElement | null)[]>
  ) => {
    if (!/^\d?$/.test(value)) return
    const newPin = [...pinArray]
    newPin[index] = value
    setPinArray(newPin)
    if (value && index < 3) {
      refs.current[index + 1]?.focus()
    }
  }

  const handleKeyDown = (
    index: number,
    e: React.KeyboardEvent,
    pinArray: string[],
    setPinArray: React.Dispatch<React.SetStateAction<string[]>>,
    refs: React.MutableRefObject<(HTMLInputElement | null)[]>
  ) => {
    if (e.key === 'Backspace' && !pinArray[index] && index > 0) {
      refs.current[index - 1]?.focus()
    }
  }

  const handleLogin = () => {
    const enteredPin = pin.join('')
    if (enteredPin.length !== 4) return
    const storedHash = localStorage.getItem(PIN_KEY)
    if (hashPin(enteredPin) === storedHash) {
      localStorage.setItem(AUTH_KEY, JSON.stringify({ timestamp: Date.now() }))
      setAuthenticated(true)
      setError('')
    } else {
      setError('PIN incorrecto')
      setPin(['', '', '', ''])
      inputRefs.current[0]?.focus()
    }
  }

  const handleSetup = () => {
    const newPin = pin.join('')
    if (newPin.length !== 4) return
    setMode('confirm')
    setTimeout(() => confirmRefs.current[0]?.focus(), 100)
  }

  const handleConfirmSetup = () => {
    const newPin = pin.join('')
    const confirmed = confirmPin.join('')
    if (newPin !== confirmed) {
      setError('Los PINs no coinciden')
      setConfirmPin(['', '', '', ''])
      confirmRefs.current[0]?.focus()
      return
    }
    localStorage.setItem(PIN_KEY, hashPin(newPin))
    localStorage.setItem(AUTH_KEY, JSON.stringify({ timestamp: Date.now() }))
    setAuthenticated(true)
    setError('')
  }

  useEffect(() => {
    if (mode === 'login' && pin.every(d => d !== '')) handleLogin()
  }, [pin, mode])

  useEffect(() => {
    if (mode === 'confirm' && confirmPin.every(d => d !== '')) handleConfirmSetup()
  }, [confirmPin, mode])

  useEffect(() => {
    if (mode === 'setup' && pin.every(d => d !== '')) handleSetup()
  }, [pin, mode])

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

  const renderPinInputs = (
    pinArray: string[],
    setPinArray: React.Dispatch<React.SetStateAction<string[]>>,
    refs: React.MutableRefObject<(HTMLInputElement | null)[]>
  ) => (
    <div className="flex gap-3 justify-center my-6">
      {[0, 1, 2, 3].map(i => (
        <input
          key={i}
          ref={el => { refs.current[i] = el }}
          type="password"
          inputMode="numeric"
          maxLength={1}
          value={pinArray[i]}
          onChange={(e) => handlePinInput(i, e.target.value, pinArray, setPinArray, refs)}
          onKeyDown={(e) => handleKeyDown(i, e, pinArray, setPinArray, refs)}
          className="w-14 h-14 text-center text-2xl font-bold bg-[#0b1220] border-2 border-white/20 rounded-xl text-white focus:border-cyan-400 focus:outline-none"
        />
      ))}
    </div>
  )

  return (
    <div className="min-h-screen bg-[#0b1220] flex items-center justify-center p-4">
      <div className="bg-[#111a2e] rounded-2xl p-6 max-w-sm w-full shadow-2xl border border-white/10">
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">❄️</div>
          <h1 className="text-xl font-bold text-cyan-400">Cooling Solution</h1>
          <p className="text-xs text-gray-400 mt-1">&quot;Donde tu confort es nuestra prioridad&quot;</p>
        </div>

        {mode === 'login' && (
          <>
            <p className="text-center text-sm text-gray-300 mb-2">Ingresa tu PIN</p>
            {renderPinInputs(pin, setPin, inputRefs)}
          </>
        )}

        {mode === 'setup' && (
          <>
            <p className="text-center text-sm text-gray-300 mb-1">Configura tu PIN de seguridad</p>
            <p className="text-center text-xs text-gray-500 mb-2">4 dígitos para proteger tu app</p>
            {renderPinInputs(pin, setPin, inputRefs)}
          </>
        )}

        {mode === 'confirm' && (
          <>
            <p className="text-center text-sm text-gray-300 mb-2">Confirma tu PIN</p>
            {renderPinInputs(confirmPin, setConfirmPin, confirmRefs)}
            <button
              onClick={() => {
                setMode('setup')
                setPin(['', '', '', ''])
                setConfirmPin(['', '', '', ''])
                setError('')
                setTimeout(() => inputRefs.current[0]?.focus(), 100)
              }}
              className="block mx-auto text-xs text-gray-400 underline mt-2"
            >
              Volver a ingresar PIN
            </button>
          </>
        )}

        {error && (
          <p className="text-center text-sm text-red-400 mt-2">{error}</p>
        )}
      </div>
    </div>
  )
}

export function ChangePinButton() {
  const handleReset = () => {
    if (confirm('¿Seguro que deseas cambiar el PIN? Tendrás que configurar uno nuevo.')) {
      localStorage.removeItem(PIN_KEY)
      localStorage.removeItem(AUTH_KEY)
      window.location.reload()
    }
  }

  return (
    <button onClick={handleReset} className="text-sm text-yellow-400 underline">
      Cambiar PIN de seguridad
    </button>
  )
}