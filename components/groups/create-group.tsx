"use client"

import type React from "react"

import { useState } from "react"
import { collection, addDoc } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { useAuth } from "@/lib/auth-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useToast } from "@/hooks/use-toast"
import { Loader2, Users } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"

interface Friend {
  friendId: string
  friendName: string
}

export function CreateGroup({ friends }: { friends: Friend[] }) {
  const [groupName, setGroupName] = useState("")
  const [description, setDescription] = useState("")
  const [selectedMembers, setSelectedMembers] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const { user } = useAuth()
  const { toast } = useToast()

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!groupName.trim() || !user) return

    if (selectedMembers.length === 0) {
      toast({
        title: "Select members",
        description: "Please select at least one member for the group.",
        variant: "destructive",
      })
      return
    }

    setLoading(true)

    try {
      // Create group document
      const groupRef = await addDoc(collection(db, "groups"), {
        name: groupName.trim(),
        description: description.trim(),
        createdBy: user.uid,
        createdAt: new Date().toISOString(),
        members: [user.uid, ...selectedMembers],
        admins: [user.uid],
      })

      // Add group to each member's groups collection
      const allMembers = [user.uid, ...selectedMembers]
      for (const memberId of allMembers) {
        await addDoc(collection(db, "userGroups"), {
          userId: memberId,
          groupId: groupRef.id,
          groupName: groupName.trim(),
          joinedAt: new Date().toISOString(),
        })
      }

      toast({
        title: "Group created",
        description: `${groupName} has been created successfully.`,
      })

      setGroupName("")
      setDescription("")
      setSelectedMembers([])
    } catch (error: any) {
      toast({
        title: "Failed to create group",
        description: error.message || "Please try again.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const toggleMember = (friendId: string) => {
    setSelectedMembers((prev) => (prev.includes(friendId) ? prev.filter((id) => id !== friendId) : [...prev, friendId]))
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Create New Group
        </CardTitle>
        <CardDescription>Create a group chat with multiple friends</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleCreateGroup} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="groupName">Group Name</Label>
            <Input
              id="groupName"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="Enter group name"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description (Optional)</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What's this group about?"
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label>Select Members</Label>
            {friends.length === 0 ? (
              <p className="text-sm text-muted-foreground">You need friends to create a group.</p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto border rounded-lg p-3">
                {friends.map((friend) => (
                  <div key={friend.friendId} className="flex items-center space-x-2">
                    <Checkbox
                      id={friend.friendId}
                      checked={selectedMembers.includes(friend.friendId)}
                      onCheckedChange={() => toggleMember(friend.friendId)}
                    />
                    <label
                      htmlFor={friend.friendId}
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                    >
                      {friend.friendName}
                    </label>
                  </div>
                ))}
              </div>
            )}
            {selectedMembers.length > 0 && (
              <p className="text-xs text-muted-foreground">{selectedMembers.length} member(s) selected</p>
            )}
          </div>

          <Button
            type="submit"
            disabled={loading || !groupName.trim() || selectedMembers.length === 0}
            className="w-full"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              "Create Group"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
