"use client"

import { useEffect, useState } from "react"
import { collection, query, where, onSnapshot, orderBy, limit, getDocs } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { useAuth } from "@/lib/auth-context"
import { Card, CardContent } from "@/components/ui/card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { MessageSquare } from "lucide-react"
import { useRouter } from "next/navigation"
import { formatDistanceToNow } from "date-fns"

interface Chat {
  friendId: string
  friendName: string
  lastMessage: string
  lastMessageTime: string
  unreadCount: number
  lastMessageSenderId?: string
}

export function ChatList() {
  const [chats, setChats] = useState<Chat[]>([])
  const { user } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!user) return

    const loadChats = async () => {
      // Get all friends
      const friendsRef = collection(db, "friends")
      const friendsQuery = query(friendsRef, where("userId", "==", user.uid))
      const friendsSnapshot = await getDocs(friendsQuery)

      const chatsData: Chat[] = []

      for (const friendDoc of friendsSnapshot.docs) {
        const friend = friendDoc.data()
        const chatId = [user.uid, friend.friendId].sort().join("_")

        // Get last message for this chat
        const messagesRef = collection(db, "chats", chatId, "messages")
        const messagesQuery = query(messagesRef, orderBy("timestamp", "desc"), limit(1))

        const unsubscribe = onSnapshot(messagesQuery, (snapshot) => {
          if (!snapshot.empty) {
            const lastMessage = snapshot.docs[0].data()

            const allMessagesQuery = query(messagesRef, orderBy("timestamp", "desc"))
            onSnapshot(allMessagesQuery, (allSnapshot) => {
              const unreadCount = allSnapshot.docs.filter((doc) => {
                const msg = doc.data()
                return msg.senderId !== user.uid && !msg.seenBy?.includes(user.uid)
              }).length

              const existingChatIndex = chatsData.findIndex((c) => c.friendId === friend.friendId)

              const chatData = {
                friendId: friend.friendId,
                friendName: friend.friendName,
                lastMessage: lastMessage.text,
                lastMessageTime: lastMessage.timestamp,
                unreadCount,
                lastMessageSenderId: lastMessage.senderId,
              }

              if (existingChatIndex >= 0) {
                chatsData[existingChatIndex] = chatData
              } else {
                chatsData.push(chatData)
              }

              setChats(
                [...chatsData].sort(
                  (a, b) => new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime(),
                ),
              )
            })
          } else {
            // No messages yet, but show the friend
            if (!chatsData.find((c) => c.friendId === friend.friendId)) {
              chatsData.push({
                friendId: friend.friendId,
                friendName: friend.friendName,
                lastMessage: "No messages yet",
                lastMessageTime: new Date().toISOString(),
                unreadCount: 0,
              })
              setChats([...chatsData])
            }
          }
        })
      }
    }

    loadChats()
  }, [user])

  const handleChatClick = (friendId: string) => {
    router.push(`/chat/${friendId}`)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <MessageSquare className="h-5 w-5 text-muted-foreground" />
        <h3 className="text-lg font-semibold text-foreground">Recent Chats</h3>
      </div>

      {chats.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <MessageSquare className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
            <p className="text-muted-foreground">No chats yet. Start a conversation with your friends!</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {chats.map((chat) => (
            <Card
              key={chat.friendId}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => handleChatClick(chat.friendId)}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <Avatar className="h-12 w-12">
                    <AvatarFallback className="bg-primary text-primary-foreground">
                      {chat.friendName?.charAt(0).toUpperCase() || "U"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <p className="font-semibold text-foreground">{chat.friendName}</p>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(chat.lastMessageTime), { addSuffix: true })}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <p
                        className={`text-sm truncate ${chat.unreadCount > 0 ? "font-semibold text-foreground" : "text-muted-foreground"}`}
                      >
                        {chat.lastMessage !== "No messages yet" && chat.lastMessageSenderId && (
                          <span className="font-medium">
                            {chat.lastMessageSenderId === user?.uid ? "You: " : `${chat.friendName}: `}
                          </span>
                        )}
                        {chat.lastMessage}
                      </p>
                      {chat.unreadCount > 0 && (
                        <span className="flex-shrink-0 bg-primary text-primary-foreground text-xs font-semibold rounded-full h-5 min-w-5 px-1.5 flex items-center justify-center">
                          {chat.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
