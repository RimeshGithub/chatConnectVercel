"use client"

import { useEffect, useState } from "react"
import { collection, query, where, onSnapshot, doc, addDoc, deleteDoc } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { useAuth } from "@/lib/auth-context"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { useToast } from "@/hooks/use-toast"
import { Check, X, Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"

interface FriendRequest {
  id: string
  fromUserId: string
  fromUserName: string
  fromUserEmail: string
  toUserId: string
  status: string
  createdAt: string
  photoURL?: string
}

export function FriendRequests() {
  const [requests, setRequests] = useState<FriendRequest[]>([])
  const [loading, setLoading] = useState<string | null>(null)
  const { user } = useAuth()
  const { toast } = useToast()

  useEffect(() => {
    if (!user) return

    const requestsRef = collection(db, "friendRequests")
    const q = query(requestsRef, where("toUserId", "==", user.uid), where("status", "==", "pending"))

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const requestsData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as FriendRequest[]
      setRequests(requestsData)
    })

    return () => unsubscribe()
  }, [user])

  const handleAccept = async (request: FriendRequest) => {
    if (!user) return
    setLoading(request.id)

    try {
      // Create friendship for both users
      await addDoc(collection(db, "friends"), {
        userId: user.uid,
        friendId: request.fromUserId,
        friendName: request.fromUserName,
        friendEmail: request.fromUserEmail,
        createdAt: new Date().toISOString(),
        photoURL: request.photoURL || null,
      })

      await addDoc(collection(db, "friends"), {
        userId: request.fromUserId,
        friendId: user.uid,
        friendName: user.displayName,
        friendEmail: user.email,
        createdAt: new Date().toISOString(),
        photoURL: request.photoURL || null,
      })

      // Delete the friend request
      await deleteDoc(doc(db, "friendRequests", request.id))

      toast({
        title: "Friend request accepted!",
        description: `You are now friends with ${request.fromUserName}.`,
      })
    } catch (error: any) {
      toast({
        title: "Failed to accept request",
        description: error.message || "Please try again.",
        variant: "destructive",
      })
    } finally {
      setLoading(null)
    }
  }

  const handleReject = async (requestId: string) => {
    setLoading(requestId)

    try {
      await deleteDoc(doc(db, "friendRequests", requestId))

      toast({
        title: "Request rejected",
        description: "Friend request has been declined.",
      })
    } catch (error: any) {
      toast({
        title: "Failed to reject request",
        description: error.message || "Please try again.",
        variant: "destructive",
      })
    } finally {
      setLoading(null)
    }
  }

  if (requests.length === 0) {
    return null
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h3 className="text-lg font-semibold text-foreground">Friend Requests</h3>
        <Badge variant="secondary">{requests.length}</Badge>
      </div>

      <div className="space-y-3">
        {requests.map((request) => (
          <Card key={request.id}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="bg-accent text-accent-foreground">
                      {request.photoURL ? <img src={request.photoURL} alt={request.fromUserName} /> : request.fromUserName?.charAt(0).toUpperCase() || "U"}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium text-foreground">{request.fromUserName}</p>
                    <p className="text-sm text-muted-foreground">{request.fromUserEmail}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => handleAccept(request)} disabled={loading === request.id}>
                    {loading === request.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleReject(request.id)}
                    disabled={loading === request.id}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
