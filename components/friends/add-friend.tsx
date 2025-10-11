"use client"

import type React from "react"

import { useState } from "react"
import { collection, query, where, getDocs, addDoc, orderBy, limit } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { useAuth } from "@/lib/auth-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { Loader2, Search, UserPlus, User } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { se } from "date-fns/locale"

export function AddFriend() {
  const [searchData, setSearchData] = useState("")
  const [loading, setLoading] = useState(false)
  const [searchResults, setSearchResults] = useState<any[]>([])
  const { user } = useAuth()
  const { toast } = useToast()

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!searchData.trim()) return

    setLoading(true)
    setSearchResults([])

    try {
      const usersRef = collection(db, "users")
      const searchTerm = searchData.trim().toLowerCase()

      // 🔍 Query 1: Exact email match (original behavior)
      const emailQuery = query(usersRef, where("email", "==", searchTerm))

      // 🔍 Query 2: Partial name matching using multiple approaches
      let nameQueries = []

      // Since Firestore doesn't support native partial text search, we'll use multiple strategies:
      
      // Strategy 1: Search by displayName (exact match, case-insensitive)
      // We store lowercase version for better search, or use the original
      const exactNameQuery = query(
        usersRef, 
        where("displayNameLower", ">=", searchTerm),
        where("displayNameLower", "<=", searchTerm + '\uf8ff'),
        limit(10)
      )

      // Strategy 2: If you have a lowercase field for search
      // If not, we'll rely on the exactNameQuery above
      const partialNameQuery = query(
        usersRef,
        where("searchKeywords", "array-contains", searchTerm),
        limit(10)
      )

      // Execute all queries
      const [emailSnapshot, exactNameSnapshot, partialNameSnapshot] = await Promise.all([
        getDocs(emailQuery),
        getDocs(exactNameQuery).catch(() => ({ docs: [] })), // Fallback if field doesn't exist
        getDocs(partialNameQuery).catch(() => ({ docs: [] })), // Fallback if field doesn't exist
      ])

      // 🟰 Combine all query results
      const allDocs = [
        ...emailSnapshot.docs,
        ...exactNameSnapshot.docs,
        ...partialNameSnapshot.docs,
      ]

      if (allDocs.length === 0) {
        // 🔍 Fallback: Client-side filtering if Firestore queries don't work
        const allUsersSnapshot = await getDocs(query(usersRef, limit(50)))
        const allUsers = allUsersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
        
        const filteredUsers = allUsers.filter(u => 
          u.uid !== user?.uid && (
            u.email?.toLowerCase().includes(searchTerm) ||
            u.displayName?.toLowerCase().includes(searchTerm) ||
            u.username?.toLowerCase().includes(searchTerm)
          ) 
        )

        if (filteredUsers.length === 0) {
          toast({
            title: "No users found",
            description: "No users found matching your search criteria.",
            variant: "destructive",
          })
        } else {
          setSearchResults(filteredUsers)
        }
      } else {
        // 🟰 Remove duplicates and filter out current user
        const uniqueUsers = allDocs.reduce((acc: any[], doc) => {
          const userData = { id: doc.id, ...doc.data() }
          if (!acc.find((u) => u.uid === userData.uid) && userData.uid !== user?.uid) {
            acc.push(userData)
          }
          return acc
        }, [])

        if (uniqueUsers.length === 0) {
          toast({
            title: "No users found",
            description: "No other users found matching your search criteria.",
            variant: "destructive",
          })
        } else {
          setSearchResults(uniqueUsers)
        }
      }
    } catch (error: any) {
      console.error("Search error:", error)
      
      // Fallback to client-side search if Firestore queries fail
      try {
        const usersRef = collection(db, "users")
        const allUsersSnapshot = await getDocs(query(usersRef, limit(100)))
        const allUsers = allUsersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
        
        const searchTerm = searchData.trim().toLowerCase()
        const filteredUsers = allUsers.filter(u => 
          u.uid !== user?.uid && (
            u.email?.toLowerCase().includes(searchTerm) ||
            u.displayName?.toLowerCase().includes(searchTerm) ||
            u.username?.toLowerCase().includes(searchTerm)
          )
        )

        if (filteredUsers.length === 0) {
          toast({
            title: "No users found",
            description: "No users found matching your search criteria.",
            variant: "destructive",
          })
        } else {
          setSearchResults(filteredUsers)
        }
      } catch (fallbackError) {
        toast({
          title: "Search failed",
          description: "Please try again with a different search term.",
          variant: "destructive",
        })
      }
    } finally {
      setLoading(false)
    }
  }

  const handleSendRequest = async (targetUser: any) => {
    if (!targetUser || !user) return

    setLoading(true)

    try {
      // Check if request already exists
      const requestsRef = collection(db, "friendRequests")
      const q = query(requestsRef, where("fromUserId", "==", user.uid), where("toUserId", "==", targetUser.uid))
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
      const friendQuery = query(friendsRef, where("userId", "==", user.uid), where("friendId", "==", targetUser.uid))
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
        toUserId: targetUser.uid,
        toUserName: targetUser.displayName,
        toUserEmail: targetUser.email,
        status: "pending",
        createdAt: new Date().toISOString(),
        photoURL: user.photoURL || null,
      })

      toast({
        title: "Request sent!",
        description: `Friend request sent to ${targetUser.displayName}.`,
      })

      // Remove the user from search results after sending request
      setSearchResults(prev => prev.filter(u => u.uid !== targetUser.uid))
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
      <div className="max-sm:mx-4">
        <div className="flex items-center gap-2">
          <UserPlus className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-lg font-semibold text-foreground">Add new Friend</h3>
        </div>
        <p className="text-muted-foreground mt-2 text-sm">
          Search for friends by their name or email address
        </p>
      </div>

      <form onSubmit={handleSearch} className="space-y-4 max-sm:mx-4">
        <div className="space-y-2">
          <div className="flex gap-2 max-sm:flex-col">
            <Input
              type="text"
              placeholder="Search by name or email..."
              value={searchData}
              onChange={(e) => setSearchData(e.target.value)}
              disabled={loading}
              className="flex-1 max-sm:mb-1"
            />
            <Button type="submit" disabled={loading || !searchData.trim()}>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Search className="h-4 w-4 mr-0.5" />
                  Search
                </>
              )}
            </Button>
          </div>
        </div>
      </form>

      {searchResults.length > 0 && (
        <div className="sm:space-y-2 sm:mx-1">
          <h3 className="font-semibold text-lg flex items-center gap-2 max-sm:mb-3 max-sm:mx-4">Search Results <Badge variant="secondary">{searchResults.length}</Badge></h3>
          {searchResults.map((result) => (
            <Card key={result.uid} className="sm:hover:shadow-md transition-shadow max-sm:shadow-none max-sm:rounded-none">
              <CardContent>
                <div className="flex items-center sm:justify-between max-sm:flex-col max-sm:items-start max-sm:gap-3">
                  <div className="flex items-center gap-4">
                    <Avatar className="h-12 w-12">
                      <AvatarFallback className="bg-primary text-primary-foreground">
                        {result.photoURL ? <img src={result.photoURL} alt="Profile" /> : result.displayName?.charAt(0).toUpperCase() || 
                         result.username?.charAt(0).toUpperCase() || 
                         result.email?.charAt(0).toUpperCase() || 
                         <User />}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-semibold text-foreground">
                        {result.displayName || result.username || "Unknown User"}
                      </p>
                      <p className="text-sm text-muted-foreground">{result.email}</p>
                      {result.username && (
                        <p className="text-xs text-muted-foreground">@{result.username}</p>
                      )}
                    </div>
                  </div>
                  <Button 
                    onClick={() => handleSendRequest(result)} 
                    disabled={loading}
                    size="sm"
                    className="max-sm:ml-auto"
                  >
                    {loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <UserPlus className="h-4 w-4 mr-2" />
                        Add Friend
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}