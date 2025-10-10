"use client"

import type React from "react"

import { useState } from "react"
import { useAuth } from "@/lib/auth-context"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { updateProfile } from "firebase/auth"
import { doc, updateDoc, collection, query, where, getDocs, writeBatch } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { Loader2 } from "lucide-react"

interface UpdateProfileProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function UpdateProfile({ open, onOpenChange }: UpdateProfileProps) {
  const { user } = useAuth()
  const { toast } = useToast()
  const [displayName, setDisplayName] = useState(user?.displayName || "")
  const [loading, setLoading] = useState(false)

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !displayName.trim()) return

    setLoading(true)
    try {
      // Update Firebase Auth profile
      await updateProfile(user, {
        displayName: displayName.trim(),
      })

      // Update Firestore user document
      await updateDoc(doc(db, "users", user.uid), {
        displayName: displayName.trim(),
      })

      // Update all friend references where this user is the friend
      const friendsRef = collection(db, "friends")
      const q = query(friendsRef, where("friendId", "==", user.uid))
      const snapshot = await getDocs(q)

      const batch = writeBatch(db)
      snapshot.docs.forEach((docSnapshot) => {
        batch.update(docSnapshot.ref, {
          friendName: displayName.trim(),
        })
      })
      await batch.commit()

      toast({
        title: "Profile updated",
        description: "Your display name has been updated successfully.",
      })

      onOpenChange(false)
      // setTimeout(() => window.location.reload(), 2500)
    } catch (error: any) {
      toast({
        title: "Failed to update profile",
        description: error.message || "Please try again.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Update Display Name</DialogTitle>
          <DialogDescription>Change your display name. This will be visible to all your friends.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleUpdateProfile}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="displayName">Display Name</Label>
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Enter your display name"
                required
                autoComplete="off"
                spellCheck="false"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !displayName.trim()}>
              {loading && <Loader2 className="mr-0.5 h-4 w-4 animate-spin" />}
              {loading ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
