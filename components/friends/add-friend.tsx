"use client"

import type React from "react"

import { useState } from "react"
import { collection, query, where, getDocs, addDoc } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { useAuth } from "@/lib/auth-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { Loader2, Search, UserPlus } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"

export function AddFriend() {
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [searchResult, setSearchResult] = useState<any>(null)
  const { user } = useAuth()
  const { toast } = useToast()

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return

    setLoading(true)
    setSearchResult(null)

    try {
      const usersRef = collection(db, "users")
      const q = query(usersRef, where("email", "==", email.trim()))
      const querySnapshot = await getDocs(q)

      if (querySnapshot.empty) {
        toast({
          title: "User not found",
          description: "No user found with this email address.",
          variant: "destructive",
        })
      } else {
        const userData = querySnapshot.docs[0].data()
        if (userData.uid === user?.uid) {
          toast({
            title: "Invalid action",
            description: "You cannot send a friend request to yourself.",
            variant: "destructive",
          })
        } else {
          setSearchResult({ id: querySnapshot.docs[0].id, ...userData })
        }
      }
    } catch (error: any) {
      toast({
        title: "Search failed",
        description: error.message || "Please try again.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleSendRequest = async () => {
    if (!searchResult || !user) return

    setLoading(true)

    try {
      // Check if request already exists
      const requestsRef = collection(db, "friendRequests")
      const q = query(requestsRef, where("fromUserId", "==", user.uid), where("toUserId", "==", searchResult.uid))
      const existingRequests = await getDocs(q)

      if (!existingRequests.empty) {
        toast({
          title: "Request already sent",
          description: "You have already sent a friend request to this user.",
        })
        return
      }

      // Check if they're already friends
      const friendsRef = collection(db, "friends")
      const friendQuery = query(friendsRef, where("userId", "==", user.uid), where("friendId", "==", searchResult.uid))
      const existingFriends = await getDocs(friendQuery)

      if (!existingFriends.empty) {
        toast({
          title: "Already friends",
          description: "You are already friends with this user.",
        })
        return
      }

      // Send friend request
      await addDoc(collection(db, "friendRequests"), {
        fromUserId: user.uid,
        fromUserName: user.displayName,
        fromUserEmail: user.email,
        toUserId: searchResult.uid,
        toUserName: searchResult.displayName,
        toUserEmail: searchResult.email,
        status: "pending",
        createdAt: new Date().toISOString(),
      })

      toast({
        title: "Request sent!",
        description: `Friend request sent to ${searchResult.displayName}.`,
      })

      setSearchResult(null)
      setEmail("")
    } catch (error: any) {
      toast({
        title: "Failed to send request",
        description: error.message || "Please try again.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground mb-2">Add a Friend</h2>
        <p className="text-muted-foreground">
          Search for friends by their email address and send them a friend request.
        </p>
      </div>

      <form onSubmit={handleSearch} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email Address</Label>
          <div className="flex gap-2">
            <Input
              id="email"
              type="email"
              placeholder="friend@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              className="flex-1"
            />
            <Button type="submit" disabled={loading}>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Search className="h-4 w-4 mr-2" />
                  Search
                </>
              )}
            </Button>
          </div>
        </div>
      </form>

      {searchResult && (
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Avatar className="h-12 w-12">
                  <AvatarFallback className="bg-primary text-primary-foreground text-lg">
                    {searchResult.displayName?.charAt(0).toUpperCase() || "U"}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-semibold text-foreground">{searchResult.displayName}</p>
                  <p className="text-sm text-muted-foreground">{searchResult.email}</p>
                </div>
              </div>
              <Button onClick={handleSendRequest} disabled={loading}>
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <UserPlus className="h-4 w-4 mr-2" />
                    Send Request
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
