"use client"

import { useEffect, useState } from "react"
import { collection, query, where, onSnapshot, doc, getDoc, deleteDoc, getDocs } from "firebase/firestore"
import { db, database } from "@/lib/firebase"
import { ref, onValue } from "firebase/database"
import { useAuth } from "@/lib/auth-context"
import { Card, CardContent } from "@/components/ui/card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { MessageSquare, Users, MoreVertical, UserMinus } from "lucide-react"
import { useRouter } from "next/navigation"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"

interface Friend {
  id: string
  friendId: string
  friendName: string
  friendEmail: string
  status?: string
  photoURL?: string
}

export function FriendsList() {
  const [friends, setFriends] = useState<Friend[]>([])
  const [friendStatus, setFriendStatus] = useState<{ friendId: string } | null>(null)
  const { user } = useAuth()
  const router = useRouter()
  const { toast } = useToast()
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [friendToDelete, setFriendToDelete] = useState<Friend | null>(null)

  useEffect(() => {
    if (!user) return

    const loadFriendStatusInfo = async (friendId: string) => {
      const friendStatus = ref(database, `status/${friendId}`)
      onValue(friendStatus, (snapshot) => {
        const data = snapshot.val()
        if (data) {
          setFriendStatus((prev) => ({
            ...prev,
            friendId: data.status,
          }))
        }
      })
    }

    const friendsRef = collection(db, "friends")
    const q = query(friendsRef, where("userId", "==", user.uid))

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const friendsData = await Promise.all(
        snapshot.docs.map(async (friendDoc) => {
          const data = friendDoc.data()
          const friendUserDoc = await getDoc(doc(db, "users", data.friendId))
          const friendUserData = friendUserDoc.data()

          loadFriendStatusInfo(data.friendId)

          return {
            id: friendDoc.id,
            friendId: data.friendId,
            friendName: data.friendName,
            friendEmail: data.friendEmail,
            status: friendUserData?.status || "offline",
            photoURL: data.photoURL || null,
          }
        }),
      )
      setFriends(friendsData)
    })

    return () => unsubscribe()
  }, [user])

  const handleStartChat = (friendId: string) => {
    router.push(`/chat/${friendId}`)
  }

  const handleRemoveFriend = async () => {
    if (!user || !friendToDelete) return

    try {
      // Delete friendship from current user's friends collection
      await deleteDoc(doc(db, "friends", friendToDelete.id))

      // Find and delete the reverse friendship (friend's record of current user)
      const reverseFriendsRef = collection(db, "friends")
      const reverseQuery = query(
        reverseFriendsRef,
        where("userId", "==", friendToDelete.friendId),
        where("friendId", "==", user.uid),
      )
      const reverseSnapshot = await getDocs(reverseQuery)
      reverseSnapshot.docs.forEach(async (doc) => {
        await deleteDoc(doc.ref)
      })

      setDeleteDialogOpen(false)
      setFriendToDelete(null)
      toast({
        title: "Friend removed",
        description: `${friendToDelete.friendName} has been removed from your friends list.`,
      })
    } catch (error: any) {
      toast({
        title: "Failed to remove friend",
        description: error.message || "Please try again.",
        variant: "destructive",
      })
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Users className="h-5 w-5 text-muted-foreground" />
        <h3 className="text-lg font-semibold text-foreground">Your Friends</h3>
        <span className="text-lg font-semibold text-foreground">({friends.length})</span>
      </div>

      {friends.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Users className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
            <p className="text-muted-foreground">No friends yet. Start by adding some!</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {friends.map((friend) => (
            <Card key={friend.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <Avatar className="h-10 w-10">
                        <AvatarFallback className="bg-primary text-primary-foreground">
                          {friend.photoURL ? <img src={friend.photoURL} alt="Profile" /> : friend.friendName?.charAt(0).toUpperCase() || "U"}
                        </AvatarFallback>
                      </Avatar>
                      <div
                        className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-card ${
                          friendStatus?.friendId === "online" ? "bg-green-500" : "bg-gray-400"
                        }`}
                      />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{friend.friendName}</p>
                      <p className="text-xs text-muted-foreground">{friend.friendEmail}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {friendStatus?.friendId === "online" ? "Online" : "Offline"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" onClick={() => handleStartChat(friend.friendId)}>
                      <MessageSquare className="h-4 w-4" />
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="ghost">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => {
                            setFriendToDelete(friend)
                            setDeleteDialogOpen(true)
                          }}
                          className="text-destructive group"
                        >
                          <UserMinus className="h-4 w-4 mr-0.5 text-red-500 group-hover:text-white" />
                          Remove Friend
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Friend</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove {friendToDelete?.friendName} from your friends list? You will need to send
              a new friend request to connect again.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleRemoveFriend}>
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
