"use client"

import type React from "react"

import { createContext, useContext, useEffect, useState } from "react"
import { type User, onAuthStateChanged, signOut as firebaseSignOut } from "firebase/auth"
import { auth, db } from "./firebase"
import { doc, setDoc, serverTimestamp } from "firebase/firestore"
import { ref, onDisconnect as rtdbOnDisconnect, set, serverTimestamp as rtdbServerTimestamp } from "firebase/database"
import { database } from "./firebase"

interface AuthContextType {
  user: User | null
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signOut: async () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setUser(null)
        setLoading(false)
        return
      }

      setUser(user)
      setLoading(false)

      if (user) {
        const userStatusRef = ref(database, `status/${user.uid}`)
        const userDocRef = doc(db, "users", user.uid)

        // Set online status
        await set(userStatusRef, {
          status: "online",
          lastSeen: rtdbServerTimestamp(),
        })

        await setDoc(
          userDocRef,
          {
            status: "online",
            lastSeen: serverTimestamp(),
          },
          { merge: true },
        )

        // Set offline status on disconnect
        rtdbOnDisconnect(userStatusRef).set({
          status: "offline",
          lastSeen: rtdbServerTimestamp(),
        })
      }
    })

    return unsubscribe
  }, [])

  const signOut = async () => {
    if (user) {
      const userStatusRef = ref(database, `status/${user.uid}`)
      const userDocRef = doc(db, "users", user.uid)

      await set(userStatusRef, {
        status: "offline",
        lastSeen: rtdbServerTimestamp(),
      })

      await setDoc(
        userDocRef,
        {
          status: "offline",
          lastSeen: serverTimestamp(),
        },
        { merge: true },
      )
    }

    setUser(null)
    await firebaseSignOut(auth)
  }

  return <AuthContext.Provider value={{ user, loading, signOut }}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
