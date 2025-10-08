"use client"

import { useAuth } from "@/lib/auth-context"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { Loader2, Users, MessageSquare, UserPlus, UsersRound, Edit, LogOut } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { FriendsList } from "@/components/friends/friends-list"
import { FriendRequests } from "@/components/friends/friend-requests"
import { AddFriend } from "@/components/friends/add-friend"
import { ChatList } from "@/components/chat/chat-list"
import { GroupsList } from "@/components/groups/groups-list"
import { CreateGroup } from "@/components/groups/create-group"
import { collection, query, where, onSnapshot } from "firebase/firestore"
import { db } from "@/lib/firebase"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { UpdateProfile } from "@/components/profile/update-profile"

export default function DashboardPage() {
  const { user, loading, signOut } = useAuth()
  const router = useRouter()
  const [activeTab, setActiveTab] = useState("chats")
  const [friends, setFriends] = useState<{ friendId: string; friendName: string }[]>([])
  const [unreadChatsCount, setUnreadChatsCount] = useState(0)
  const [unreadGroupsCount, setUnreadGroupsCount] = useState(0)
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0)
  const [showUpdateProfile, setShowUpdateProfile] = useState(false)

  useEffect(() => {
    if (!loading && !user) {
      router.push("/")
    }
  }, [user, loading, router])

  useEffect(() => {
    if (user) {
      setActiveTab("chats")
    }
  }, [user])

  useEffect(() => {
    if (!user) return

    console.log("[v0] Loading friends for user:", user.uid)

    const friendsRef = collection(db, "friends")
    const q = query(friendsRef, where("userId", "==", user.uid))

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const friendsData = snapshot.docs.map((doc) => ({
        friendId: doc.data().friendId,
        friendName: doc.data().friendName,
      }))
      console.log("[v0] Friends loaded:", friendsData.length, friendsData)
      setFriends(friendsData)
    })

    return () => unsubscribe()
  }, [user])

  useEffect(() => {
    if (!user) return

    console.log("[v0] Setting up unread chats count listener")
    const friendsRef = collection(db, "friends")
    const q = query(friendsRef, where("userId", "==", user.uid))

    let messageUnsubscribers: (() => void)[] = []

    const unsubscribeFriends = onSnapshot(q, (snapshot) => {
      console.log("[v0] Friends snapshot for unread count:", snapshot.docs.length)

      // Clean up previous message listeners
      messageUnsubscribers.forEach((unsub) => unsub())
      messageUnsubscribers = []

      const unreadCounts = new Map<string, number>()

      snapshot.docs.forEach((friendDoc) => {
        const friendId = friendDoc.data().friendId
        const chatId = [user.uid, friendId].sort().join("_")
        const messagesRef = collection(db, "chats", chatId, "messages")
        const messagesQuery = query(messagesRef, where("senderId", "==", friendId))

        // Set up real-time listener for each friend's messages
        const unsubscribeMessages = onSnapshot(messagesQuery, (messagesSnapshot) => {
          let count = 0
          messagesSnapshot.docs.forEach((doc) => {
            const msg = doc.data()
            if (!msg.seenBy?.includes(user.uid)) {
              count++
            }
          })
          unreadCounts.set(friendId, count)

          // Calculate total unread count
          const total = Array.from(unreadCounts.values()).reduce((sum, val) => sum + val, 0)
          console.log("[v0] Unread chats count updated:", total)
          setUnreadChatsCount(total)
        })

        messageUnsubscribers.push(unsubscribeMessages)
      })
    })

    return () => {
      console.log("[v0] Cleaning up unread chats listeners")
      messageUnsubscribers.forEach((unsub) => unsub())
    }
  }, [user])

  useEffect(() => {
    if (!user) return

    console.log("[v0] Setting up unread groups count listener")
    const userGroupsRef = collection(db, "userGroups")
    const q = query(userGroupsRef, where("userId", "==", user.uid))

    let messageUnsubscribers: (() => void)[] = []

    const unsubscribeGroups = onSnapshot(q, (snapshot) => {
      console.log("[v0] Groups snapshot for unread count:", snapshot.docs.length)

      // Clean up previous message listeners
      messageUnsubscribers.forEach((unsub) => unsub())
      messageUnsubscribers = []

      const unreadCounts = new Map<string, number>()

      snapshot.docs.forEach((userGroupDoc) => {
        const groupId = userGroupDoc.data().groupId
        const groupMessagesRef = collection(db, "groups", groupId, "messages")

        // Set up real-time listener for each group's messages
        const unsubscribeMessages = onSnapshot(groupMessagesRef, (messagesSnapshot) => {
          let count = 0
          
          messagesSnapshot.docs.forEach((doc) => {
            const msg = doc.data()
            if (msg.senderId !== user.uid && !msg.seenBy?.includes(user.uid)) {
              count++
            }
          })
          unreadCounts.set(groupId, count)

          // Calculate total unread count
          const total = Array.from(unreadCounts.values()).reduce((sum, val) => sum + val, 0)
          console.log("[v0] Unread groups count updated:", total)
          setUnreadGroupsCount(total)
        })

        messageUnsubscribers.push(unsubscribeMessages)
      })
    })

    return () => {
      console.log("[v0] Cleaning up unread groups listeners")
      messageUnsubscribers.forEach((unsub) => unsub())
    }
  }, [user])

  useEffect(() => {
    if (!user) return

    console.log("[v0] Setting up pending requests count listener")
    const requestsRef = collection(db, "friendRequests")
    const q = query(requestsRef, where("toUserId", "==", user.uid), where("status", "==", "pending"))

    const unsubscribe = onSnapshot(q, (snapshot) => {
      console.log("[v0] Pending requests count updated:", snapshot.docs.length)
      setPendingRequestsCount(snapshot.docs.length)
    })

    return () => {
      console.log("[v0] Cleaning up pending requests listener")
      unsubscribe()
    }
  }, [user])

  if (loading) {
    return (
      <div className="min-h-screen gradient-bg flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!user) {
    return null
  }

  const handleSignOut = async () => {
    await signOut()
    router.push("/")
  }

  return (
    <div className="min-h-screen gradient-bg">
      <div className="max-w-7xl mx-auto p-4 md:p-6 lg:p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="bg-primary text-primary-foreground p-3 rounded-xl shadow-lg">
              <MessageSquare className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">ChatConnect</h1>
              <p className="text-sm text-muted-foreground">Welcome, {user.displayName || "User"}</p>
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-10 w-10 rounded-full">
                <Avatar>
                  <AvatarFallback className="bg-primary text-primary-foreground">
                    {user.photoURL ? <img src={user.photoURL} alt="Profile" /> : user.displayName?.charAt(0).toUpperCase() || "U"}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium">{user.displayName}</p>
                  <p className="text-xs text-muted-foreground">{user.email}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setShowUpdateProfile(true)} className="group">
                <Edit className="mr-0.5 h-4 w-4 group-hover:text-white" /> Change name
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleSignOut} className="group">
                <LogOut className="mr-0.5 h-4 w-4 group-hover:text-white" /> Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Main Content */}
        <div className="bg-card/95 backdrop-blur-sm rounded-xl shadow-xl border border-border/50 overflow-hidden">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="w-full justify-start rounded-xl bg-gray-100/50 backdrop-blur-sm p-0  max-md:p-1 max-md:grid max-md:grid-cols-2 max-md:gap-1 max-md:mb-14.5">
              <TabsTrigger
                value="chats"
                className="relative rounded-lg px-4 py-2.5 text-sm font-semibold transition-all duration-300 
                          data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-blue-600 
                          data-[state=active]:text-white data-[state=active]:shadow-lg
                          hover:bg-blue-100 hover:text-blue-700
                          border border-transparent group"
              >
                <MessageSquare className="h-4 w-4 mr-2.5 transition-transform group-hover:scale-110 group-data-[state=active]:text-white" />
                Chats
                {unreadChatsCount > 0 && (
                  <Badge 
                    className="ml-2 h-5 min-w-5 px-1.5 text-xs font-bold 
                              bg-red-500 text-white shadow-lg animate-bounce"
                  >
                    {unreadChatsCount}
                  </Badge>
                )}
              </TabsTrigger>
              
              <TabsTrigger
                value="groups"
                className="relative rounded-lg px-4 py-2.5 text-sm font-semibold transition-all duration-300 
                          data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-500 data-[state=active]:to-purple-600 
                          data-[state=active]:text-white data-[state=active]:shadow-lg
                          hover:bg-purple-100 hover:text-purple-700
                          border border-transparent group"
              >
                <UsersRound className="h-4 w-4 mr-2.5 transition-transform group-hover:scale-110 group-data-[state=active]:text-white" />
                Groups
                {unreadGroupsCount > 0 && (
                  <Badge 
                    className="ml-2 h-5 min-w-5 px-1.5 text-xs font-bold 
                              bg-red-500 text-white shadow-lg animate-bounce"
                  >
                    {unreadGroupsCount}
                  </Badge>
                )}
              </TabsTrigger>
              
              <TabsTrigger
                value="friends"
                className="relative rounded-lg px-4 py-2.5 text-sm font-semibold transition-all duration-300 
                          data-[state=active]:bg-gradient-to-r data-[state=active]:from-green-500 data-[state=active]:to-green-600 
                          data-[state=active]:text-white data-[state=active]:shadow-lg
                          hover:bg-green-100 hover:text-green-700
                          border border-transparent group"
              >
                <Users className="h-4 w-4 mr-2.5 transition-transform group-hover:scale-110 group-data-[state=active]:text-white" />
                Friends
                {pendingRequestsCount > 0 && (
                  <Badge 
                    className="ml-2 h-5 min-w-5 px-1.5 text-xs font-bold 
                              bg-red-500 text-white shadow-lg animate-bounce"
                  >
                    {pendingRequestsCount}
                  </Badge>
                )}
              </TabsTrigger>
              
              <TabsTrigger
                value="add"
                className="relative rounded-lg px-4 py-2.5 text-sm font-semibold transition-all duration-300 
                          data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-500 data-[state=active]:to-amber-600 
                          data-[state=active]:text-white data-[state=active]:shadow-lg
                          hover:bg-amber-100 hover:text-amber-700
                          border border-transparent group"
              >
                <UserPlus className="h-4 w-4 mr-2.5 transition-transform group-hover:scale-110 group-data-[state=active]:text-white" />
                Add Friend
              </TabsTrigger>
            </TabsList>

            <div className="p-6">
              <TabsContent value="chats" className="mt-0">
                <ChatList />
              </TabsContent>

              <TabsContent value="groups" className="mt-0 space-y-6">
                <CreateGroup friends={friends} />
                <GroupsList />
              </TabsContent>

              <TabsContent value="friends" className="mt-0 space-y-6">
                <FriendRequests />
                <FriendsList />
              </TabsContent>

              <TabsContent value="add" className="mt-0">
                <AddFriend />
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </div>
      <UpdateProfile open={showUpdateProfile} onOpenChange={setShowUpdateProfile} />
    </div>
  )
}
