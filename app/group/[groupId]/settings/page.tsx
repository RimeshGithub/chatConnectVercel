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
} from "firebase/firestore"
import { db } from "@/lib/firebase"
import { useAuth } from "@/lib/auth-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { useToast } from "@/hooks/use-toast"
import { ArrowLeft, Loader2, UserPlus, Shield, Trash2, Crown, LogOut } from "lucide-react"
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
}

interface Friend {
  friendId: string
  friendName: string
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

    const loadGroupData = async () => {
      const groupDoc = await getDoc(doc(db, "groups", groupId))
      if (groupDoc.exists()) {
        const data = groupDoc.data() as GroupInfo
        setGroupInfo(data)
        setGroupName(data.name)
        setDescription(data.description)

        console.log("[v0] Loading members for group:", groupId)
        console.log("[v0] Group members array:", data.members)

        // Load member information
        const memberInfoData: MemberInfo[] = []
        for (const memberId of data.members) {
          console.log("[v0] Loading user document for:", memberId)
          const userDoc = await getDoc(doc(db, "users", memberId))
          if (userDoc.exists()) {
            const userData = userDoc.data()
            console.log("[v0] User data loaded:", {
              userId: memberId,
              displayName: userData.displayName,
              email: userData.email,
            })

            // Use fallback values if displayName or email is missing
            const displayName = userData.displayName || userData.email?.split("@")[0] || "Unknown User"
            const email = userData.email || "No email"

            memberInfoData.push({
              userId: memberId,
              displayName: displayName,
              email: email,
              isAdmin: data.admins.includes(memberId),
            })
          } else {
            console.log("[v0] User document does not exist for:", memberId)
          }
        }
        console.log("[v0] Final member info data:", memberInfoData)
        setMembers(memberInfoData)

        const friendsRef = collection(db, "friends")
        const q = query(friendsRef, where("userId", "==", user.uid))
        const snapshot = await getDocs(q)
        const friendsData = snapshot.docs
          .map((doc) => ({
            friendId: doc.data().friendId,
            friendName: doc.data().friendName,
          }))
          .filter((friend) => !data.members.includes(friend.friendId))
        setFriends(friendsData)
      }
    }

    loadGroupData()
  }, [groupId, user])

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
      window.location.reload()
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

  const handleRemoveMember = async (memberId: string) => {
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
        title: "Member removed",
        description: "Member has been removed from the group.",
      })

      setMemberToRemove(null)
      window.location.reload()
    } catch (error: any) {
      toast({
        title: "Failed to remove member",
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
      window.location.reload()
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
      await updateDoc(doc(db, "groups", groupId), {
        admins: arrayRemove(user.uid),
      })

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
      window.location.reload()
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
          description: "As the creator, you must transfer ownership or delete the group first.",
          variant: "destructive",
        })
        setShowLeaveDialog(false)
        setLoading(false)
        return
      }

      await handleRemoveMember(user.uid)
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
          {isAdmin && (
            <Card>
              <CardHeader>
                <CardTitle>Group Information</CardTitle>
                <CardDescription>Update group name and description</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="groupName">Group Name</Label>
                  <Input
                    id="groupName"
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    placeholder="Enter group name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What's this group about?"
                    rows={3}
                  />
                </div>
                <Button onClick={handleUpdateGroup} disabled={loading || !groupName.trim()}>
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Save Changes
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Members */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Members ({members.length})</CardTitle>
                  <CardDescription>Manage group members and permissions</CardDescription>
                </div>
                {isAdmin && (
                  <Button onClick={() => setShowAddMembers(true)} size="sm">
                    <UserPlus className="h-4 w-4 mr-2" />
                    Add Members
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {members.map((member) => (
                  <div key={member.userId} className="flex items-center justify-between p-3 rounded-lg border">
                    <div className="flex items-center gap-3">
                      <Avatar>
                        <AvatarFallback className="bg-primary text-primary-foreground">
                          {member.displayName?.charAt(0).toUpperCase() || "?"}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium text-foreground flex items-center gap-2">
                          {member.displayName || "Unknown User"}
                          {member.isAdmin && <Shield className="h-4 w-4 text-primary" />}
                          {member.userId === groupInfo.createdBy && <Crown className="h-4 w-4 text-yellow-500" />}
                        </p>
                        <p className="text-sm text-muted-foreground">{member.email}</p>
                      </div>
                    </div>
                    {isAdmin && member.userId !== user.uid && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            Manage
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {isCreator && (
                            <>
                              <DropdownMenuItem onClick={() => setMemberToTransferTo(member.userId)}>
                                <Crown className="h-4 w-4 mr-2" />
                                Transfer Ownership
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleToggleAdmin(member.userId, member.isAdmin)}>
                                <Shield className="h-4 w-4 mr-2" />
                                {member.isAdmin ? "Remove Admin" : "Make Admin"}
                              </DropdownMenuItem>
                            </>
                          )}
                          <DropdownMenuItem
                            onClick={() => setMemberToRemove(member.userId)}
                            className="text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
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
          <Card>
            <CardHeader>
              <CardTitle className="text-destructive">Danger Zone</CardTitle>
              <CardDescription>Irreversible actions</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Button variant="destructive" onClick={() => setShowLeaveDialog(true)}>
                  <LogOut className="h-4 w-4 mr-2" />
                  Leave Group
                </Button>
              </div>
              {isAdmin && (
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
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {friends.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                All your friends are already in this group.
              </p>
            ) : (
              friends.map((friend) => (
                <div key={friend.friendId} className="flex items-center space-x-2">
                  <Checkbox
                    id={friend.friendId}
                    checked={selectedFriends.includes(friend.friendId)}
                    onCheckedChange={() =>
                      setSelectedFriends((prev) =>
                        prev.includes(friend.friendId)
                          ? prev.filter((id) => id !== friend.friendId)
                          : [...prev, friend.friendId],
                      )
                    }
                  />
                  <label htmlFor={friend.friendId} className="text-sm font-medium cursor-pointer">
                    {friend.friendName}
                  </label>
                </div>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddMembers(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddMembers} disabled={loading || selectedFriends.length === 0}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Add Members
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
              Remove
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
              Are you sure you want to transfer group ownership to this member? You will no longer be the creator, but
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
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Transfer Ownership
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
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Delete Group
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
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Leave Group
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
