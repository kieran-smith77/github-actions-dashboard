import React, { useState, useEffect, useRef, useCallback } from 'react'
import '../styles/autocomplete.css'

interface RepoAutocompleteProps {
  value: string
  onChange: (value: string) => void
  onSelect: (repo: string) => void
  recentRepos: string[]
  placeholder?: string
  autoFocus?: boolean
}

export default function RepoAutocomplete({
  value,
  onChange,
  onSelect,
  recentRepos,
  placeholder = 'Enter repository name...',
  autoFocus = false
}: RepoAutocompleteProps) {
  const [filteredRepos, setFilteredRepos] = useState<string[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [prefetchedRepos, setPrefetchedRepos] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Prefetch a small set of recent repositories on mount for instant results
  useEffect(() => {
    const prefetchRepos = async () => {
      try {
        // Fetch a wildcard search to get some recent/popular repos
        const response = await fetch('/api/repositories/search?q=a&limit=20')
        const data = await response.json()
        if (data.repositories) {
          setPrefetchedRepos(data.repositories)
        }
      } catch (error) {
        console.error('Error prefetching repositories:', error)
      }
    }
    prefetchRepos()
  }, [])

  // Search repositories with debouncing
  useEffect(() => {
    // Clear previous timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }

    const query = value.trim()

    // If query is empty, check recent repos for matches
    if (!query) {
      setFilteredRepos([])
      setIsOpen(false)
      return
    }

    // Filter recent repos and prefetched repos locally for immediate feedback
    const queryLower = query.toLowerCase()
    const recentSet = new Set(recentRepos)

    const recentMatches = recentRepos.filter(repo =>
      repo.toLowerCase().includes(queryLower)
    )

    const prefetchedMatches = prefetchedRepos.filter(repo =>
      repo.toLowerCase().includes(queryLower) && !recentSet.has(repo)
    )

    const immediateResults = [...recentMatches, ...prefetchedMatches].slice(0, 10)

    if (immediateResults.length > 0) {
      setFilteredRepos(immediateResults)
      setIsOpen(true)
    } else {
      setFilteredRepos([])
    }

    // Debounce the API search
    setIsLoading(true)
    debounceTimerRef.current = setTimeout(async () => {
      try {
        const response = await fetch(`/api/repositories/search?q=${encodeURIComponent(query)}&limit=10`)
        const data = await response.json()

        if (data.repositories) {
          const queryLower = query.toLowerCase()
          const searchResults = data.repositories as string[]

          // Always include matching recent repos first (from local recentRepos)
          const recentMatches = recentRepos.filter(repo =>
            repo.toLowerCase().includes(queryLower)
          )

          // Add API search results that aren't already in recent matches
          const recentSet = new Set(recentMatches)
          const otherMatches = searchResults.filter(repo => !recentSet.has(repo))

          const combined = [...recentMatches, ...otherMatches].slice(0, 10)
          setFilteredRepos(combined)
          setSelectedIndex(0)
          setIsOpen(combined.length > 0)
        }
      } catch (error) {
        console.error('Error searching repositories:', error)
      } finally {
        setIsLoading(false)
      }
    }, 300) // 300ms debounce

    // Cleanup
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [value, recentRepos, prefetchedRepos])

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || filteredRepos.length === 0) {
      return
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex((prev: number) => (prev + 1) % filteredRepos.length)
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex((prev: number) => (prev - 1 + filteredRepos.length) % filteredRepos.length)
        break
      case 'Enter':
        e.preventDefault()
        if (filteredRepos[selectedIndex]) {
          handleSelect(filteredRepos[selectedIndex])
        }
        break
      case 'Escape':
        setIsOpen(false)
        break
    }
  }

  // Handle repo selection
  const handleSelect = (repo: string) => {
    onChange(repo)
    setIsOpen(false)
    onSelect(repo)
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Scroll selected item into view
  useEffect(() => {
    if (isOpen && dropdownRef.current) {
      const selectedItem = dropdownRef.current.querySelector(`[data-index="${selectedIndex}"]`)
      selectedItem?.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex, isOpen])

  const isRecentRepo = (repo: string) => recentRepos.includes(repo)

  return (
    <div className="autocomplete-wrapper">
      <input
        ref={inputRef}
        className="home-input"
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (value.trim() && filteredRepos.length > 0) {
            setIsOpen(true)
          }
        }}
        autoFocus={autoFocus}
        autoComplete="off"
      />

      {isOpen && filteredRepos.length > 0 && (
        <div ref={dropdownRef} className="autocomplete-dropdown">
          {filteredRepos.map((repo, index) => (
            <div
              key={repo}
              data-index={index}
              className={`autocomplete-item ${index === selectedIndex ? 'selected' : ''}`}
              onClick={() => handleSelect(repo)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <span className="autocomplete-repo-name">{repo}</span>
              {isRecentRepo(repo) && (
                <span className="autocomplete-badge">Recent</span>
              )}
            </div>
          ))}
        </div>
      )}

      {isLoading && value.trim() && (
        <div className="autocomplete-loading">Loading repositories...</div>
      )}
    </div>
  )
}
