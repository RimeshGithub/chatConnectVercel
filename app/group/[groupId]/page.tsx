"use client"

import type React from "react"
import { useEffect, useState, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import { collection, query, addDoc, onSnapshot, orderBy, doc, getDoc, updateDoc, arrayUnion } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { useAuth } from "@/lib/auth-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { ArrowLeft, Send, Loader2, Users, Settings, Smile, MoreVertical, Pencil, Trash2 } from "lucide-react"
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
  senderName: string
  text: string
  timestamp: string
  seenBy?: string[]
  reactions?: { [userId: string]: string }
  edited?: boolean
  deleted?: boolean
}

interface GroupInfo {
  name: string
  description: string
  members: string[]
  admins: string[]
  createdBy: string
}

interface MemberInfo {
  [userId: string]: {
    displayName: string
    email: string
  }
}

export default function GroupChatPage() {
  const params = useParams()
  const groupId = params.groupId as string
  const { user } = useAuth()
  const router = useRouter()
  const { toast } = useToast()

  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState("")
  const [loading, setLoading] = useState(false)
  const [groupInfo, setGroupInfo] = useState<GroupInfo | null>(null)
  const [memberInfo, setMemberInfo] = useState<MemberInfo>({})
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [editText, setEditText] = useState("")
  const [showReactionPicker, setShowReactionPicker] = useState<string | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [messageToDelete, setMessageToDelete] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const reactionEmojis = ["👍", "❤️", "😂", "😮", "😢", "🙏"]

  useEffect(() => {
    if (!groupId || !user) return

    const loadGroupInfo = async () => {
      const groupDoc = await getDoc(doc(db, "groups", groupId))
      if (groupDoc.exists()) {
        const data = groupDoc.data() as GroupInfo
        setGroupInfo(data)

        const memberInfoData: MemberInfo = {}
        for (const memberId of data.members) {
          const userDoc = await getDoc(doc(db, "users", memberId))
          if (userDoc.exists()) {
            memberInfoData[memberId] = {
              displayName: userDoc.data().displayName,
              email: userDoc.data().email,
            }
          }
        }
        setMemberInfo(memberInfoData)
      }
    }

    loadGroupInfo()

    const unsubscribe = onSnapshot(doc(db, "groups", groupId), (doc) => {
      if (doc.exists()) {
        setGroupInfo(doc.data() as GroupInfo)
      }
    })

    return () => unsubscribe()
  }, [groupId, user])

  useEffect(() => {
    if (!groupId || !user) return

    const messagesRef = collection(db, "groups", groupId, "messages")
    const q = query(messagesRef, orderBy("timestamp", "asc"))

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const messagesData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Message[]
      setMessages(messagesData)

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
    })

    return () => unsubscribe()
  }, [groupId, user])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMessage.trim() || !groupId || !user) return

    setLoading(true)

    try {
      const messagesRef = collection(db, "groups", groupId, "messages")
      await addDoc(messagesRef, {
        senderId: user.uid,
        senderName: user.displayName || "Unknown",
        text: newMessage.trim(),
        timestamp: new Date().toISOString(),
        seenBy: [user.uid],
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

  const handleSettingsClick = () => {
    router.push(`/group/${groupId}/settings`)
  }

  const handleReaction = async (messageId: string, emoji: string) => {
    if (!groupId || !user) return

    try {
      const messageRef = doc(db, "groups", groupId, "messages", messageId)
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
    if (!groupId || !editText.trim()) return

    try {
      const messageRef = doc(db, "groups", groupId, "messages", messageId)
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

  const handleDeleteMessage = async () => {
    if (!groupId || !messageToDelete) return

    try {
      const messageRef = doc(db, "groups", groupId, "messages", messageToDelete)
      await updateDoc(messageRef, {
        text: "This message was deleted",
        deleted: true,
        reactions: {},
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

  if (!user || !groupInfo) {
    return (
      <div className="min-h-screen gradient-bg flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen gradient-bg flex flex-col">
      {/* Header */}
      <div className="bg-card/95 backdrop-blur-sm border-b border-border/50 p-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => router.push("/dashboard")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <Avatar className="h-10 w-10">
              <AvatarFallback className="bg-primary text-primary-foreground">
                <Users className="h-5 w-5" />
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-semibold text-foreground">{groupInfo.name}</p>
              <p className="text-xs text-muted-foreground">{groupInfo.members.length} members</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={handleSettingsClick}>
            <Settings className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-4xl mx-auto space-y-4">
          {messages.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No messages yet. Start the conversation!</p>
            </div>
          ) : (
            messages.map((message) => {
              const isOwn = message.senderId === user.uid
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
                    {!isOwn && (
                      <span className="text-xs font-medium text-muted-foreground px-2">
                        {memberInfo[message.senderId]?.displayName || message.senderName}
                      </span>
                    )}
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
                            Save
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

                        {isOwn && !message.deleted && (
                          <div className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button size="icon" variant="secondary" className="h-6 w-6 rounded-full">
                                  <MoreVertical className="h-3 w-3" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => startEdit(message)}>
                                  <Pencil className="h-4 w-4 mr-2" />
                                  Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => {
                                    setMessageToDelete(message.id)
                                    setDeleteDialogOpen(true)
                                  }}
                                  className="text-destructive"
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        )}

                        {!message.deleted && (
                          <div className="absolute -bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
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

                        {message.reactions && Object.keys(message.reactions).length > 0 && (
                          <div className="flex gap-1 mt-1 flex-wrap">
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
                      </div>
                    )}

                    <span className="text-xs text-muted-foreground px-2">
                      {formatDistanceToNow(new Date(message.timestamp), { addSuffix: true })}
                    </span>
                  </div>
                </div>
              )
            })
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="bg-card/95 backdrop-blur-sm border-t border-border/50 p-4">
        <div className="max-w-4xl mx-auto">
          <form onSubmit={handleSendMessage} className="flex gap-2">
            <Input
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Type a message..."
              disabled={loading}
              className="flex-1"
            />
            <Button type="submit" disabled={loading || !newMessage.trim()}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </form>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
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
