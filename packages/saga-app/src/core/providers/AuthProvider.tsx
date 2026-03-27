// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import ReactNativeBiometrics from 'react-native-biometrics'
import { AppStorage } from '../storage/async-storage'

type BiometricType = 'FaceID' | 'TouchID' | 'Biometrics' | null

interface AuthContextValue {
  isLocked: boolean
  biometricAvailable: boolean
  biometricType: BiometricType
  securityEnabled: boolean
  unlock: (pin?: string) => Promise<boolean>
  lock: () => void
  enableBiometric: () => Promise<void>
  setPin: (pin: string) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

interface AuthProviderProps {
  children: React.ReactNode
}

export function AuthProvider({ children }: AuthProviderProps): React.JSX.Element {
  const [isLocked, setIsLocked] = useState(true)
  const [biometricAvailable, setBiometricAvailable] = useState(false)
  const [biometricType, setBiometricType] = useState<BiometricType>(null)
  const [securityEnabled, setSecurityEnabled] = useState(false)

  useEffect(() => {
    async function checkBiometrics() {
      const rnBiometrics = new ReactNativeBiometrics()
      const { available, biometryType } = await rnBiometrics.isSensorAvailable()
      setBiometricAvailable(available)
      if (available && biometryType) {
        setBiometricType(biometryType as BiometricType)
      }
      const enabled = await AppStorage.get<boolean>('securityEnabled')
      if (enabled) {
        setSecurityEnabled(true)
      } else {
        setIsLocked(false)
      }
    }
    checkBiometrics()
  }, [])

  const unlock = useCallback(async (pin?: string): Promise<boolean> => {
    if (pin) {
      const storedPin = await AppStorage.get<string>('pin')
      if (storedPin === pin) {
        setIsLocked(false)
        return true
      }
      return false
    }

    const rnBiometrics = new ReactNativeBiometrics()
    const { success } = await rnBiometrics.simplePrompt({ promptMessage: 'Unlock SAGA' })
    if (success) {
      setIsLocked(false)
      return true
    }
    return false
  }, [])

  const lock = useCallback(() => {
    setIsLocked(true)
  }, [])

  const enableBiometric = useCallback(async () => {
    setSecurityEnabled(true)
    await AppStorage.set('securityEnabled', true)
  }, [])

  const setPin = useCallback(async (pin: string) => {
    await AppStorage.set('pin', pin)
    setSecurityEnabled(true)
    await AppStorage.set('securityEnabled', true)
  }, [])

  const value: AuthContextValue = {
    isLocked,
    biometricAvailable,
    biometricType,
    securityEnabled,
    unlock,
    lock,
    enableBiometric,
    setPin,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
