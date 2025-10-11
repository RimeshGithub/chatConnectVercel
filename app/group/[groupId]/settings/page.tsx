"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import {
  doc,
  getDoc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  collection,
  query,
  where,
  getDocs,
  addDoc,
  deleteDoc,
  onSnapshot,
} from "firebase/firestore"
import { db, database } from "@/lib/firebase"
import { ref, onValue, off } from "firebase/database"
import { useAuth } from "@/lib/auth-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { useToast } from "@/hooks/use-toast"
import { ArrowLeft, Loader2, UserPlus, Shield, Trash2, Crown, LogOut, User } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { is } from "date-fns/locale"

interface GroupInfo {
  name: string
  description: string
  members: string[]
  admins: string[]
  createdBy: string
}

interface MemberInfo {
  userId: string
  displayName: string
  email: string
  isAdmin: boolean
  photoURL?: string
  status?: string
}

interface Friend {
  friendId: string
  friendName: string
  photoURL?: string
}

export default function GroupSettingsPage() {
  const params = useParams()
  const groupId = params.groupId as string
  const { user } = useAuth()
  const router = useRouter()
  const { toast } = useToast()

  const [groupInfo, setGroupInfo] = useState<GroupInfo | null>(null)
  const [members, setMembers] = useState<MemberInfo[]>([])
  const [friends, setFriends] = useState<Friend[]>([])
  const [selectedFriends, setSelectedFriends] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [groupName, setGroupName] = useState("")
  const [description, setDescription] = useState("")
  const [showAddMembers, setShowAddMembers] = useState(false)
  const [showLeaveDialog, setShowLeaveDialog] = useState(false)
  const [memberToRemove, setMemberToRemove] = useState<string | null>(null)
  const [memberToTransferTo, setMemberToTransferTo] = useState<string | null>(null)
  const [showDeleteGroupDialog, setShowDeleteGroupDialog] = useState(false)

  const isAdmin = groupInfo?.admins.includes(user?.uid || "")
  const isCreator = groupInfo?.createdBy === user?.uid

  useEffect(() => {
    if (!groupId || !user) return

    const statusUnsubscribers: (() => void)[] = []

    // 🔹 Listen for realtime status updates per member
    const listenToMemberStatus = (memberId: string) => {
      const memberStatusRef = ref(database, `status/${memberId}`)
      const unsubscribe = onValue(memberStatusRef, (snapshot) => {
        const data = snapshot.val()
        if (data?.status) {
          setMembers((prev) =>
            prev.map((m) =>
              m.userId === memberId ? { ...m, status: data.status } : m
            )
          )
        }
      })
      statusUnsubscribers.push(() => off(memberStatusRef))
    }

    // 🔹 Load group + member info
    const loadGroupData = async (groupData?: GroupInfo) => {
      const data =
        groupData ?? (await getDoc(doc(db, "groups", groupId))).data() as GroupInfo
      if (!data) return

      setGroupInfo(data)
      setGroupName(data.name)
      setDescription(data.description)

      // Keep previously known statuses
      setMembers((prev) => {
        const prevStatuses = Object.fromEntries(
          prev.map((m) => [m.userId, m.status])
        )

        return data.members.map((memberId) => {
          const old = prev.find((m) => m.userId === memberId)
          return (
            old ?? {
              userId: memberId,
              displayName: "",
              email: "",
              photoURL: null,
              isAdmin: data.admins.includes(memberId),
              status: prevStatuses[memberId] || "loading...",
            }
          )
        })
      })

      // Load user info for members missing details
      const memberInfoData: MemberInfo[] = []
      for (const memberId of data.members) {
        const userDoc = await getDoc(doc(db, "users", memberId))
        if (userDoc.exists()) {
          const userData = userDoc.data()
          const displayName =
            userData.displayName || userData.email?.split("@")[0] || "Unknown User"
          const email = userData.email || "No email"

          memberInfoData.push({
            userId: memberId,
            displayName,
            email,
            photoURL: userData.photoURL || null,
            isAdmin: data.admins.includes(memberId),
            status: "loading...",
          })

          // Start listening for realtime updates (only once per member)
          listenToMemberStatus(memberId)
        }
      }

      // Merge new member info with existing status
      setMembers((prev) =>
        memberInfoData.map((m) => ({
          ...m,
          status: prev.find((p) => p.userId === m.userId)?.status || "loading...",
        }))
      )
    }

    // 🔹 Firestore group listener
    const unsubscribeGroup = onSnapshot(doc(db, "groups", groupId), (snapshot) => {
      if (snapshot.exists()) {
        loadGroupData(snapshot.data() as GroupInfo)
      }
    })

    // 🔹 Initial load
    loadGroupData()

    // 🔹 Cleanup
    return () => {
      unsubscribeGroup()
      statusUnsubscribers.forEach((unsub) => unsub())
    }
  }, [groupId, user])

  useEffect(() => {
    if (!user) return

    console.log("[v0] Loading friends for user:", user.uid)

    const friendsRef = collection(db, "friends")
    const q = query(friendsRef, where("userId", "==", user.uid))

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const friendsData = snapshot.docs.map((doc) => ({
        friendId: doc.data().friendId,
        friendName: doc.data().friendName,
        photoURL: doc.data().photoURL,
      }))
      console.log("[v0] Friends loaded:", friendsData.length, friendsData)
      setFriends(friendsData)
    })

    return () => unsubscribe()
  }, [user, groupId])

  const handleUpdateGroup = async () => {
    if (!groupId || !groupName.trim()) return

    setLoading(true)
    try {
      await updateDoc(doc(db, "groups", groupId), {
        name: groupName.trim(),
        description: description.trim(),
      })

      // Update group name in userGroups
      const userGroupsRef = collection(db, "userGroups")
      const q = query(userGroupsRef, where("groupId", "==", groupId))
      const snapshot = await getDocs(q)
      const updatePromises = snapshot.docs.map((doc) =>
        updateDoc(doc.ref, {
          groupName: groupName.trim(),
        }),
      )
      await Promise.all(updatePromises)

      toast({
        title: "Group updated",
        description: "Group information has been updated successfully.",
      })
    } catch (error: any) {
      toast({
        title: "Failed to update group",
        description: error.message || "Please try again.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleAddMembers = async () => {
    if (!groupId || selectedFriends.length === 0) return

    setLoading(true)
    try {
      // Add members to group
      await updateDoc(doc(db, "groups", groupId), {
        members: arrayUnion(...selectedFriends),
      })

      // Add group to each new member's userGroups
      for (const friendId of selectedFriends) {
        await addDoc(collection(db, "userGroups"), {
          userId: friendId,
          groupId: groupId,
          groupName: groupInfo?.name,
          joinedAt: new Date().toISOString(),
        })
      }

      toast({
        title: "Members added",
        description: `${selectedFriends.length} member(s) added to the group.`,
      })

      setSelectedFriends([])
      setShowAddMembers(false)
      // setTimeout(() => window.location.reload(), 2500)
    } catch (error: any) {
      toast({
        title: "Failed to add members",
        description: error.message || "Please try again.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleRemoveMember = async (memberId: string, fromLeaveGroup: boolean = false) => {
    if (!groupId) return

    setLoading(true)
    try {
      // Remove member from group
      await updateDoc(doc(db, "groups", groupId), {
        members: arrayRemove(memberId),
        admins: arrayRemove(memberId),
      })

      // Remove group from member's userGroups
      const userGroupsRef = collection(db, "userGroups")
      const q = query(userGroupsRef, where("userId", "==", memberId), where("groupId", "==", groupId))
      const snapshot = await getDocs(q)
      const deletePromises = snapshot.docs.map((doc) => deleteDoc(doc.ref))
      await Promise.all(deletePromises)

      toast({
        title: fromLeaveGroup ? "Group left" : "Member removed",
        description: fromLeaveGroup ? "You have successfully left the group." : "Member has been removed from the group.",
      })

      setMemberToRemove(null)
      // setTimeout(() => window.location.reload(), 2500)
    } catch (error: any) {
      toast({
        title: fromLeaveGroup ? "Failed to leave group" : "Failed to remove member",
        description: error.message || "Please try again.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleToggleAdmin = async (memberId: string, isCurrentlyAdmin: boolean) => {
    if (!groupId) return

    try {
      if (isCurrentlyAdmin) {
        await updateDoc(doc(db, "groups", groupId), {
          admins: arrayRemove(memberId),
        })
        toast({ title: "Admin removed" })
      } else {
        await updateDoc(doc(db, "groups", groupId), {
          admins: arrayUnion(memberId),
        })
        toast({ title: "Admin added" })
      }
      // setTimeout(() => window.location.reload(), 2500)
    } catch (error: any) {
      toast({
        title: "Failed to update admin",
        description: error.message || "Please try again.",
        variant: "destructive",
      })
    }
  }

  const handleTransferOwnership = async (newOwnerId: string) => {
    if (!groupId || !user) return

    setLoading(true)
    try {
      // First, remove current user from admins
      // await updateDoc(doc(db, "groups", groupId), {
      //   admins: arrayRemove(user.uid),
      // })

      // Then, update the group's createdBy field and ensure new owner is an admin
      await updateDoc(doc(db, "groups", groupId), {
        createdBy: newOwnerId,
        admins: arrayUnion(newOwnerId),
      })

      toast({
        title: "Ownership transferred",
        description: "Group ownership has been transferred successfully.",
      })

      setMemberToTransferTo(null)
      // setTimeout(() => window.location.reload(), 2500)
    } catch (error: any) {
      toast({
        title: "Failed to transfer ownership",
        description: error.message || "Please try again.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteGroup = async () => {
    if (!groupId || !user) return

    setLoading(true)
    try {
      // Delete all messages in the group
      const messagesRef = collection(db, "groups", groupId, "messages")
      const messagesSnapshot = await getDocs(messagesRef)
      const deleteMessagePromises = messagesSnapshot.docs.map((doc) => deleteDoc(doc.ref))
      await Promise.all(deleteMessagePromises)

      // Remove group from all members' userGroups
      const userGroupsRef = collection(db, "userGroups")
      const q = query(userGroupsRef, where("groupId", "==", groupId))
      const snapshot = await getDocs(q)
      const deleteUserGroupPromises = snapshot.docs.map((doc) => deleteDoc(doc.ref))
      await Promise.all(deleteUserGroupPromises)

      // Delete the group document
      await deleteDoc(doc(db, "groups", groupId))

      toast({
        title: "Group deleted",
        description: "The group has been deleted successfully.",
      })

      router.push("/dashboard")
    } catch (error: any) {
      toast({
        title: "Failed to delete group",
        description: error.message || "Please try again.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleLeaveGroup = async () => {
    if (!groupId || !user) return

    setLoading(true)
    try {
      if (isCreator && members.length > 1) {
        toast({
          title: "Cannot leave group",
          description: "As the owner, you must transfer ownership or delete the group first.",
          variant: "destructive",
        })
        setShowLeaveDialog(false)
        setLoading(false)
        return
      }

      await handleRemoveMember(user.uid, true)
      router.push("/dashboard")
    } catch (error: any) {
      toast({
        title: "Failed to leave group",
        description: error.message || "Please try again.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  if (!user || !groupInfo) {
    return (
      <div className="min-h-screen gradient-bg flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen gradient-bg">
      <div className="max-w-4xl mx-auto p-4 md:p-6 lg:p-8">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => router.push(`/group/${groupId}`)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold text-foreground">Group Settings</h1>
        </div>

        <div className="space-y-6">
          {/* Group Info */}
          <Card className="py-6">
            <CardHeader>
              <CardTitle>Group Information</CardTitle>
              {isAdmin && <CardDescription>Update group name and description</CardDescription>}
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="groupName">Group Name</Label>
                <Input
                  id="groupName"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="Enter group name"
                  readOnly={!isAdmin}
                  autoComplete="off"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={isAdmin ? "What's this group about?" : "No description available"}
                  rows={3}
                  className="resize-none"
                  readOnly={!isAdmin}
                  autoComplete="off"
                />
              </div>
              {isAdmin && (
                <Button onClick={handleUpdateGroup} disabled={loading || !groupName.trim()}>
                  {loading ? <Loader2 className="mr-0.5 h-4 w-4 animate-spin" /> : null}
                  {loading ? "Saving..." : "Save Changes"}
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Members */}
          <Card className="py-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">Members <Badge variant="secondary">{members.length}</Badge></CardTitle>
              {isAdmin && <CardDescription className="mt-0">Manage group members and permissions</CardDescription>}
              {isAdmin && (
                <Button onClick={() => setShowAddMembers(true)} className="sm:w-[200px] sm:ml-auto">
                  <UserPlus className="h-4 w-4 mr-2" />
                  Add Members
                </Button>
              )}
            </CardHeader>
            <CardContent className="max-h-80 overflow-y-auto px-0 mx-5">
              <div className="space-y-2  overflow-x-hidden">
                {members.map((member) => 
                  member.displayName && (
                  <div key={member.userId} className="flex sm:items-center justify-between p-3 rounded-lg border max-sm:flex-col">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <Avatar className="h-12 w-12">
                          <AvatarFallback className="bg-primary text-primary-foreground">
                            {member.photoURL ? <img src={member.photoURL} alt="Profile" /> : member.displayName?.charAt(0).toUpperCase() || <User />}
                          </AvatarFallback>
                        </Avatar>
                        <div
                          className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-card ${
                            member.status === "online" ? "bg-green-500" : "bg-gray-400"
                          }`}
                        />
                      </div>
                      <div>
                        <div className="font-medium text-foreground flex sm:items-center gap-2 sm:mb-1 max-sm:flex-col">
                          {member.displayName || "Unknown User"}
                          {(member.userId === user.uid || member.userId === groupInfo.createdBy || member.isAdmin ) && <div className="flex gap-1 max-sm:mb-2">
                            {member.userId === user.uid && <Badge variant="secondary">You</Badge>}
                            {member.isAdmin && <Badge variant="secondary"><Shield className="h-4 w-4 text-primary" /> Admin</Badge>}
                            {member.userId === groupInfo.createdBy && <Badge variant="secondary"><Crown className="h-4 w-4 text-yellow-500" /> Owner</Badge>}
                          </div>}
                        </div>
                        <p className="text-sm text-muted-foreground">{member.email}</p>
                      </div>
                    </div>
                    {isAdmin && member.userId !== user.uid && (!member.isAdmin || isCreator) && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="sm" className="mt-2.5">
                            Manage
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {isCreator && (
                            <>
                              <DropdownMenuItem className="group" onClick={() => setMemberToTransferTo(member.userId)}>
                                <Crown className="h-4 w-4 mr-0.5 group-hover:text-white" />
                                Transfer Ownership
                              </DropdownMenuItem>
                              <DropdownMenuItem className="group" onClick={() => handleToggleAdmin(member.userId, member.isAdmin)}>
                                <Shield className="h-4 w-4 mr-0.5 group-hover:text-white" />
                                {member.isAdmin ? "Remove Admin" : "Make Admin"}
                              </DropdownMenuItem>
                            </>
                          )}
                          <DropdownMenuItem
                            onClick={() => setMemberToRemove(member.userId)}
                            className="text-destructive group"
                          >
                            <Trash2 className="h-4 w-4 mr-0.5 text-red-500 group-hover:text-white" />
                            Remove
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Danger Zone */}
          <Card className="py-6">
            <CardHeader>
              <CardTitle className="text-destructive">Danger Zone</CardTitle>
              <CardDescription>Irreversible actions</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {members.length > 1 && 
                <div>
                  <Button variant="destructive" onClick={() => setShowLeaveDialog(true)}>
                    <LogOut className="h-4 w-4 mr-2" />
                    Leave Group
                  </Button>
                </div>
              }

              {isCreator && (
                <div>
                  <Button variant="destructive" onClick={() => setShowDeleteGroupDialog(true)}>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Group
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Add Members Dialog */}
      <Dialog open={showAddMembers} onOpenChange={setShowAddMembers}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Members</DialogTitle>
            <DialogDescription>Select friends to add to the group</DialogDescription>
          </DialogHeader>
          <div className="px-2 py-0.5 border rounded-lg">
            {friends.filter((friend) => !members.some((member) => member.userId === friend.friendId)).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No friends to add
              </p>
            ) : (
              <div className="max-h-50 py-2 overflow-y-auto grid gap-2 grid-cols-1">
                {friends.filter((friend) => !members.some((member) => member.userId === friend.friendId)).map((friend) => (
                  <label
                    key={friend.friendId}
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                  >
                    <Card className="flex flex-row items-center pl-5 py-1.5 gap-2 rounded-sm shadow-none hover:shadow-sm">
                      <Checkbox
                        checked={selectedFriends.includes(friend.friendId)}
                        onCheckedChange={() =>
                          setSelectedFriends((prev) =>
                            prev.includes(friend.friendId)
                              ? prev.filter((id) => id !== friend.friendId)
                              : [...prev, friend.friendId],
                          )
                        }
                      />
                        <div className="flex items-center gap-2">
                          <Avatar className="h-10 w-10">
                            <AvatarFallback className="bg-primary text-primary-foreground">
                              {friend.photoURL ? <img src={friend.photoURL} alt="Profile" /> : friend.friendName?.charAt(0).toUpperCase() || <User />}
                            </AvatarFallback>
                          </Avatar>
                          {friend.friendName}
                        </div>
                    </Card>
                  </label>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddMembers(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddMembers} disabled={loading || selectedFriends.length === 0}>
              {loading ? <Loader2 className="mr-0.5 h-4 w-4 animate-spin" /> : null}
              {loading ? "Adding..." : "Add Members"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Member Dialog */}
      <Dialog open={!!memberToRemove} onOpenChange={() => setMemberToRemove(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Member</DialogTitle>
            <DialogDescription>Are you sure you want to remove this member from the group?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMemberToRemove(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => memberToRemove && handleRemoveMember(memberToRemove)}>
              {loading ? <Loader2 className="mr-0.5 h-4 w-4 animate-spin" /> : null}
              {loading ? "Removing..." : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transfer Ownership Dialog */}
      <Dialog open={!!memberToTransferTo} onOpenChange={() => setMemberToTransferTo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transfer Ownership</DialogTitle>
            <DialogDescription>
              Are you sure you want to transfer group ownership to this member? You will no longer be the owner, but
              you will remain an admin.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMemberToTransferTo(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => memberToTransferTo && handleTransferOwnership(memberToTransferTo)}
              disabled={loading}
            >
              {loading ? <Loader2 className="mr-0.5 h-4 w-4 animate-spin" /> : null}
              {loading ? "Transferring..." : "Transfer Ownership"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Group Dialog */}
      <Dialog open={showDeleteGroupDialog} onOpenChange={setShowDeleteGroupDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Group</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this group? This action cannot be undone. All messages and group data will
              be permanently deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteGroupDialog(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteGroup} disabled={loading}>
              {loading ? <Loader2 className="mr-0.5 h-4 w-4 animate-spin" /> : null}
              {loading ? "Deleting..." : "Delete Group"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Leave Group Dialog */}
      <Dialog open={showLeaveDialog} onOpenChange={setShowLeaveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Leave Group</DialogTitle>
            <DialogDescription>
              Are you sure you want to leave this group? You will need to be re-invited to join again.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLeaveDialog(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleLeaveGroup} disabled={loading}>
              {loading ? <Loader2 className="mr-0.5 h-4 w-4 animate-spin" /> : null}
              {loading ? "Leaving..." : "Leave Group"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
