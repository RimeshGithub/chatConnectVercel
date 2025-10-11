"use client"

import { useEffect, useState } from "react"
import { collection, query, where, onSnapshot, orderBy, limit } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { useAuth } from "@/lib/auth-context"
import { Card, CardContent } from "@/components/ui/card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { CreateGroup } from "@/components/groups/create-group"
import { Users, Plus } from "lucide-react"
import { useRouter } from "next/navigation"
import { formatDistanceToNow } from "date-fns"
import { Button } from "@/components/ui/button"

interface Group {
  id: string
  name: string
  description: string
  memberCount: number
  lastMessage?: string
  lastMessageTime?: string
  lastMessageSender?: string
  lastMessageSenderId?: string
  unreadCount: number
}

interface Friend {
  friendId: string
  friendName: string
}

export function GroupsList({ friends }: { friends: Friend[] }) {
  const [groups, setGroups] = useState<Group[]>([])
  const [showCreateGroupDialog, setShowCreateGroupDialog] = useState(false)
  const { user } = useAuth()
  const router = useRouter()
  const [now, setNow] = useState(Date.now()) // keeps track of current time

  useEffect(() => {
    // Update every second
    const interval = setInterval(() => {
      setNow(Date.now()) // triggers re-render
    }, 1000)

    return () => clearInterval(interval) // cleanup on unmount
  }, [])

  useEffect(() => {
    if (!user) return

    const userGroupsRef = collection(db, "userGroups")
    const q = query(userGroupsRef, where("userId", "==", user.uid))

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const groupsData: Group[] = []

      for (const userGroupDoc of snapshot.docs) {
        const userGroup = userGroupDoc.data()
        const groupId = userGroup.groupId

        const messagesRef = collection(db, "groups", groupId, "messages")
        const groupsRef = collection(db, "groups")
        const lastMessageQuery = query(messagesRef, orderBy("timestamp", "desc"), limit(1))

        onSnapshot(groupsRef, (groupsSnapshot) => {
          if (!groupsSnapshot.empty) {
            const groupDoc = groupsSnapshot.docs.find((doc) => doc.id === groupId)
            if (groupDoc) {
              const groupData = groupDoc.data()
              groupData.id = groupDoc.id

              if (!groupsData.find((g) => g.id === groupId)) {
                groupsData.push({
                  id: groupId,
                  name: userGroup.groupName || "Group",
                  description: userGroup.groupDescription || "",
                  memberCount: userGroup.memberCount || 0,
                  unreadCount: 0,
                })
                setGroups([...groupsData])
              }

              const existingGroupIndex = groupsData.findIndex((g) => g.id === groupId)
              if (existingGroupIndex >= 0) {
                groupsData[existingGroupIndex].description = groupData.description
                groupsData[existingGroupIndex].memberCount = groupData.members.length
              }
            }
          }
        })

        onSnapshot(lastMessageQuery, (messagesSnapshot) => {
          if (!messagesSnapshot.empty) {
            const lastMessage = messagesSnapshot.docs[0].data()

            const allMessagesQuery = query(messagesRef, orderBy("timestamp", "desc"))
            onSnapshot(allMessagesQuery, (allSnapshot) => {
              const unreadCount = allSnapshot.docs.filter((doc) => {
                const msg = doc.data()
                return msg.senderId !== user.uid && !msg.seenBy?.includes(user.uid)
              }).length

              const existingGroupIndex = groupsData.findIndex((g) => g.id === groupId)

              const groupData = {
                id: groupId,
                name: userGroup.groupName || "Group",
                lastMessage: lastMessage.text,
                lastMessageTime: lastMessage.timestamp,
                lastMessageSender: lastMessage.senderName,
                lastMessageSenderId: lastMessage.senderId,
                unreadCount,
              }

              if (existingGroupIndex >= 0) {
                groupsData[existingGroupIndex] = { ...groupsData[existingGroupIndex], ...groupData }
              } else {
                groupsData.push({ ...groupData, memberCount: userGroup.memberCount || 0 , description: userGroup.groupDescription || ""})
              }

              setGroups(
                [...groupsData].sort(
                  (a, b) => new Date(b.lastMessageTime || 0).getTime() - new Date(a.lastMessageTime || 0).getTime(),
                ),
              )
            })
          } else {
            if (!groupsData.find((g) => g.id === groupId)) {
              groupsData.push({
                id: groupId,
                name: userGroup.groupName || "Group",
                description: userGroup.groupDescription || "",
                memberCount: userGroup.memberCount || 0,
                unreadCount: 0,
              })
              setGroups([...groupsData])
            }
          }
        })
      }
    })

    return () => unsubscribe()
  }, [user])

  const handleGroupClick = (groupId: string) => {
    router.push(`/group/${groupId}`)
  }

  const toggleDiaglogBox = () => {
    setShowCreateGroupDialog(!showCreateGroupDialog)
  }

  return (
    <div className="space-y-4">
      {showCreateGroupDialog && <CreateGroup friends={friends} toggleDiaglogBox={toggleDiaglogBox} />}
      <div className="flex items-center gap-2 max-sm:px-4">
        <Users className="h-5 w-5 text-muted-foreground" />
        <h3 className="text-lg font-semibold text-foreground">My Groups</h3>
        {!showCreateGroupDialog && (
          <Button onClick={() => setShowCreateGroupDialog(true)} className="flex items-center ml-auto">
            <Plus className="mr-0.5 h-4 w-4" /> Create Group
          </Button>
        )}
      </div>

      {groups.length === 0 ? (
        <Card className="max-sm:mx-3">
          <CardContent className="p-8 text-center">
            <Users className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
            <p className="text-muted-foreground">No groups yet. Create one to get started!</p>
          </CardContent>
        </Card>
      ) : (
        <div className="sm:space-y-2">
          {groups.map((group) => (
            <Card
              key={group.id}
              className="cursor-pointer sm:hover:shadow-md transition-shadow max-sm:shadow-none max-sm:rounded-none"
              onClick={() => handleGroupClick(group.id)}
            >
              <CardContent>
                <div className="flex items-center gap-3">
                  <Avatar className="h-12 w-12">
                    <AvatarFallback className="bg-primary text-primary-foreground">
                      <Users className="h-6 w-6" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <p className="font-semibold text-foreground max-sm:flex max-sm:flex-col">{group.name} <span className="sm:ml-2 text-muted-foreground text-[10px] sm:text-xs">{`${group.memberCount} members`}</span></p>
                      {group.lastMessageTime && (
                        <span className="text-[10px] sm:text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(group.lastMessageTime), { addSuffix: true })}
                        </span>
                      )}
                    </div>
                    {group.lastMessage ? (
                      <div className="flex items-center justify-between gap-2 max-sm:mt-3">
                        <p
                          className={`text-sm truncate ${group.unreadCount > 0 ? "font-semibold text-foreground" : "text-muted-foreground"}`}
                        >
                          <span className="font-medium">{group.lastMessageSenderId === user?.uid ? "You" : group.lastMessageSender}: </span>
                          {group.lastMessage}
                        </p>
                        {group.unreadCount > 0 && (
                          <span className="flex-shrink-0 bg-primary text-primary-foreground text-xs font-semibold rounded-full h-5 min-w-5 px-1.5 flex items-center justify-center">
                            {group.unreadCount}
                          </span>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground truncate max-sm:mt-3">
                        {group.description || ""}
                      </p>
                    )}
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
