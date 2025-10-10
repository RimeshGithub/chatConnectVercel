"use client"

import type React from "react"

import { useEffect, useState, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import {
  collection,
  query,
  addDoc,
  onSnapshot,
  orderBy,
  doc,
  getDoc,
  updateDoc,
  arrayUnion,
  setDoc,
} from "firebase/firestore"
import { ref, onValue } from "firebase/database"
import { db, database } from "@/lib/firebase"
import { useAuth } from "@/lib/auth-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { ArrowLeft, Send, Loader2, Check, CheckCheck, Smile, MoreVertical, Pencil, Trash2, Copy, User } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { formatDistanceToNow } from "date-fns"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface Message {
  id: string
  senderId: string
  text: string
  timestamp: string
  seenBy?: string[]
  reactions?: { [userId: string]: string }
  edited?: boolean
  deleted?: boolean
}

interface FriendInfo {
  id: string
  displayName: string
  email: string
  status?: string
  photoURL?: string
}

export default function ChatPage() {
  const params = useParams()
  const friendId = params.friendId as string
  const { user } = useAuth()
  const router = useRouter()
  const { toast } = useToast()

  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState("")
  const [loading, setLoading] = useState(false)
  const [friendInfo, setFriendInfo] = useState<FriendInfo | null>(null)
  const [isTyping, setIsTyping] = useState(false)
  const [friendIsTyping, setFriendIsTyping] = useState(false)
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [editText, setEditText] = useState("")
  const [showReactionPicker, setShowReactionPicker] = useState<string | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [messageToDelete, setMessageToDelete] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const chatId = user && friendId ? [user.uid, friendId].sort().join("_") : null

  const reactionEmojis = ["👍", "❤️", "😂", "😮", "😢", "😠", "🤬", "🖕", "🙏"]

  useEffect(() => {
    if (!friendId) return

    const loadFriendInfo = async () => {
      const userDoc = await getDoc(doc(db, "users", friendId))
      if (userDoc.exists()) {
        setFriendInfo(userDoc.data() as FriendInfo)
      }
      const friendStatus = ref(database, `status/${friendId}`)
      onValue(friendStatus, (snapshot) => {
        const data = snapshot.val()
        if (data) {
          setFriendInfo((prev) => ({
            ...prev,
            status: data.status,
            lastSeen: data.lastSeen,
          }))
        }
      })
    }

    loadFriendInfo()

    const unsubscribe = onSnapshot(doc(db, "users", friendId), (doc) => {
      if (doc.exists()) {
        setFriendInfo(doc.data() as FriendInfo)
      }
    })

    return () => unsubscribe()
  }, [friendId])

  useEffect(() => {
    if (!chatId) return

    const typingRef = doc(db, "typing", chatId)
    const unsubscribe = onSnapshot(typingRef, (doc) => {
      if (doc.exists()) {
        const data = doc.data()
        setFriendIsTyping(data[friendId] === true)
      }
    })

    return () => unsubscribe()
  }, [chatId, friendId])

  useEffect(() => {
    if (!chatId) return

    const messagesRef = collection(db, "chats", chatId, "messages")
    const q = query(messagesRef, orderBy("timestamp", "asc"))

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const messagesData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Message[]
      setMessages(messagesData)

      if (user) {
        const updatePromises = snapshot.docs
          .filter((messageDoc) => {
            const message = messageDoc.data()
            return message.senderId !== user.uid && (!message.seenBy || !message.seenBy.includes(user.uid))
          })
          .map((messageDoc) =>
            updateDoc(messageDoc.ref, {
              seenBy: arrayUnion(user.uid),
            }),
          )

        await Promise.all(updatePromises)
      }
    })

    return () => unsubscribe()
  }, [chatId, user])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const handleTyping = async () => {
    if (!chatId || !user) return

    if (!isTyping) {
      setIsTyping(true)
      const typingRef = doc(db, "typing", chatId)
      await setDoc(typingRef, { [user.uid]: true }, { merge: true })
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
    }

    typingTimeoutRef.current = setTimeout(async () => {
      setIsTyping(false)
      const typingRef = doc(db, "typing", chatId)
      await setDoc(typingRef, { [user.uid]: false }, { merge: true })
    }, 2000)
  }

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMessage.trim() || !chatId || !user) return

    setLoading(true)

    try {
      if (isTyping) {
        setIsTyping(false)
        const typingRef = doc(db, "typing", chatId)
        await setDoc(typingRef, { [user.uid]: false }, { merge: true })
      }

      const messagesRef = collection(db, "chats", chatId, "messages")
      await addDoc(messagesRef, {
        senderId: user.uid,
        text: newMessage.trim(),
        timestamp: new Date().toISOString(),
        seenBy: [user.uid], // Initialize seenBy with sender
      })

      setNewMessage("")
    } catch (error: any) {
      toast({
        title: "Failed to send message",
        description: error.message || "Please try again.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleReaction = async (messageId: string, emoji: string) => {
    if (!chatId || !user) return

    try {
      const messageRef = doc(db, "chats", chatId, "messages", messageId)
      const messageDoc = await getDoc(messageRef)
      const messageData = messageDoc.data()
      const reactions = messageData?.reactions || {}

      if (reactions[user.uid] === emoji) {
        delete reactions[user.uid]
      } else {
        reactions[user.uid] = emoji
      }

      await updateDoc(messageRef, { reactions })
      setShowReactionPicker(null)
    } catch (error: any) {
      toast({
        title: "Failed to add reaction",
        description: error.message || "Please try again.",
        variant: "destructive",
      })
    }
  }

  const handleEditMessage = async (messageId: string) => {
    if (!chatId || !editText.trim()) return

    try {
      const messageRef = doc(db, "chats", chatId, "messages", messageId)
      await updateDoc(messageRef, {
        text: editText.trim(),
        edited: true,
      })
      setEditingMessageId(null)
      setEditText("")
      toast({
        title: "Message updated",
      })
    } catch (error: any) {
      toast({
        title: "Failed to edit message",
        description: error.message || "Please try again.",
        variant: "destructive",
      })
    }
  }

  const copyMessage = async (message: Message) => {
    try {
      await navigator.clipboard.writeText(message.text)
      toast({
        title: "Message copied to clipboard",
      })
    } catch (error: any) {
      toast({
        title: "Failed to copy message",
        description: error.message || "Please try again.",
        variant: "destructive",
      })
    }
  }

  const handleDeleteMessage = async () => {
    if (!chatId || !messageToDelete) return

    try {
      const messageRef = doc(db, "chats", chatId, "messages", messageToDelete)
      await updateDoc(messageRef, {
        text: "This message was deleted",
        deleted: true,
        reactions: {}, // Clear all reactions
      })
      setDeleteDialogOpen(false)
      setMessageToDelete(null)
      toast({
        title: "Message deleted",
      })
    } catch (error: any) {
      toast({
        title: "Failed to delete message",
        description: error.message || "Please try again.",
        variant: "destructive",
      })
    }
  }

  const startEdit = (message: Message) => {
    setEditingMessageId(message.id)
    setEditText(message.text)
  }

  if (!user) {
    return null
  }

  return (
    <div className="min-h-screen gradient-bg flex flex-col">
      {/* Header */}
      <div className="bg-card/95 backdrop-blur-sm border-b border-border/50 p-4 fixed top-0 w-full z-1 h-18">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push("/dashboard")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="relative">
            <Avatar className="h-10 w-10">
              <AvatarFallback className="bg-primary text-primary-foreground">
                {friendInfo?.photoURL ? <img src={friendInfo?.photoURL} alt="Profile" /> : friendInfo?.displayName?.charAt(0).toUpperCase() || <User />}
              </AvatarFallback>
            </Avatar>
            <div
              className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-card ${
                friendInfo?.status === "online" ? "bg-green-500" : "bg-gray-400"
              }`}
            />
          </div>
          <div>
            <p className="font-semibold text-foreground">{friendInfo?.displayName || "Loading..."}</p>
            <p className="text-xs text-muted-foreground">
              {friendIsTyping ? "typing..." : friendInfo?.status === "online" ? "Online" : "Offline"}
            </p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 my-18">
        <div className="max-w-4xl mx-auto space-y-4">
          {messages.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No messages yet. Start the conversation!</p>
            </div>
          ) : (
            messages.map((message) => {
              const isOwn = message.senderId === user.uid
              const isSeen = message.seenBy && message.seenBy.length > 1
              const isEditing = editingMessageId === message.id
              const reactionCounts: { [emoji: string]: number } = {}
              if (message.reactions) {
                Object.values(message.reactions).forEach((emoji) => {
                  reactionCounts[emoji] = (reactionCounts[emoji] || 0) + 1
                })
              }

              return (
                <div key={message.id} className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[70%] ${isOwn ? "items-end" : "items-start"} flex flex-col gap-1`}>
                    {isEditing ? (
                      <div className="w-full bg-card border border-border rounded-2xl p-3">
                        <Input
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          className="mb-2"
                          autoFocus
                        />
                        <div className="flex gap-2 justify-end">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditingMessageId(null)
                              setEditText("")
                            }}
                          >
                            Cancel
                          </Button>
                          <Button size="sm" onClick={() => handleEditMessage(message.id)}>
                            <Check className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="relative group">
                        <div
                          className={`rounded-2xl px-4 py-2 ${
                            isOwn
                              ? "bg-primary text-primary-foreground rounded-br-sm"
                              : "bg-card text-card-foreground border border-border/50 rounded-bl-sm"
                          } ${message.deleted ? "italic opacity-70" : ""}`}
                        >
                          <p className="text-sm leading-relaxed break-words">{message.text}</p>
                          {message.edited && !message.deleted && (
                            <span className="text-xs opacity-60 ml-2">(edited)</span>
                          )}
                        </div>

                        {!message.deleted && (
                          <div className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button size="icon" variant="secondary" className="h-6 w-6 rounded-full">
                                  <MoreVertical className="h-3 w-3" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {isOwn && (
                                  <DropdownMenuItem onClick={() => startEdit(message)} className="group">
                                    <Pencil className="h-4 w-4 mr-0.5 group-hover:text-white" />
                                    Edit
                                  </DropdownMenuItem>                                
                                )}
                                <DropdownMenuItem onClick={() => copyMessage(message)} className="group">
                                  <Copy className="h-4 w-4 mr-0.5 group-hover:text-white" />
                                  Copy
                                </DropdownMenuItem>
                                {isOwn && (
                                  <DropdownMenuItem
                                    onClick={() => {
                                      setMessageToDelete(message.id)
                                      setDeleteDialogOpen(true)
                                    }}
                                    className="group text-destructive"
                                  >
                                    <Trash2 className="h-4 w-4 mr-0.5 text-red-500 group-hover:text-white" />
                                    Delete
                                  </DropdownMenuItem>    
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        )}

                        {!message.deleted && (
                          <div className="absolute -bottom-2 -right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <DropdownMenu
                              open={showReactionPicker === message.id}
                              onOpenChange={(open) => setShowReactionPicker(open ? message.id : null)}
                            >
                              <DropdownMenuTrigger asChild>
                                <Button size="icon" variant="secondary" className="h-6 w-6 rounded-full">
                                  <Smile className="h-3 w-3" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent>
                                <div className="flex gap-1 p-1">
                                  {reactionEmojis.map((emoji) => (
                                    <Button
                                      key={emoji}
                                      variant="ghost"
                                      size="sm"
                                      className="h-8 w-8 p-0 text-lg hover:scale-125 transition-transform"
                                      onClick={() => handleReaction(message.id, emoji)}
                                    >
                                      {emoji}
                                    </Button>
                                  ))}
                                </div>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        )}
                      </div>
                    )}

                    {message.reactions && Object.keys(message.reactions).length > 0 && (
                      <div className="flex gap-1 mt-0 flex-wrap">
                        {Object.entries(reactionCounts).map(([emoji, count]) => (
                          <button
                            key={emoji}
                            onClick={() => handleReaction(message.id, emoji)}
                            className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                              message.reactions?.[user.uid] === emoji
                                ? "bg-primary/20 border-primary"
                                : "bg-card border-border hover:bg-accent"
                            }`}
                          >
                            {emoji} {count}
                          </button>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center gap-1 px-0.5">
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(message.timestamp), { addSuffix: true })}
                      </span>
                      {isOwn && (
                        <span className="text-muted-foreground">
                          {isSeen ? <CheckCheck className="h-3 w-3 text-blue-600" /> : <Check className="h-3 w-3" />}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="bg-card/95 backdrop-blur-sm border-t border-border/50 p-4 fixed bottom-0 w-full z-1 h-18">
        <div className="max-w-4xl mx-auto">
          <form onSubmit={handleSendMessage} className="flex gap-2">
            <Input
              value={newMessage}
              onChange={(e) => {
                setNewMessage(e.target.value)
                handleTyping()
              }}
              placeholder="Type a message..."
              disabled={loading}
              className="flex-1"
              autoComplete="nope"
            />
            <Button type="submit" disabled={loading || !newMessage.trim()}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </form>
        </div>
      </div>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Message</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this message? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteMessage}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
