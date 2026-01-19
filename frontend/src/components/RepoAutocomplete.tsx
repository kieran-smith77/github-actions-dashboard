import React, { useState, useEffect, useRef, useCallback } from 'react'

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
  const [allRepos, setAllRepos] = useState<string[]>([])
  const [filteredRepos, setFilteredRepos] = useState<string[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Fetch all repositories from the org
  useEffect(() => {
    const fetchRepos = async () => {
      setIsLoading(true)
      try {
        const response = await fetch('/api/repositories')
        const data = await response.json()
        if (data.repositories) {
          setAllRepos(data.repositories)
        }
      } catch (error) {
        console.error('Error fetching repositories:', error)
      } finally {
        setIsLoading(false)
      }
    }
    fetchRepos()
  }, [])

  // Filter and prioritize repos based on search input
  const filterRepos = useCallback((query: string, repos: string[], recent: string[]) => {
    if (!query.trim()) {
      return []
    }

    const queryLower = query.toLowerCase()
    const recentSet = new Set(recent)

    // Filter repos that match the query anywhere in the name
    const matches = repos.filter(repo => 
      repo.toLowerCase().includes(queryLower)
    )

    // Separate into recent and non-recent
    const recentMatches = matches.filter(repo => recentSet.has(repo))
    const otherMatches = matches.filter(repo => !recentSet.has(repo))

    // Sort recent matches by most recently visited (order in recentRepos array)
    recentMatches.sort((a, b) => {
      const indexA = recent.indexOf(a)
      const indexB = recent.indexOf(b)
      return indexA - indexB
    })

    // Sort other matches alphabetically
    otherMatches.sort()

    // Combine: recent matches first, then other matches
    return [...recentMatches, ...otherMatches].slice(0, 10) // Limit to 10 results
  }, [])

  // Update filtered repos when input changes
  useEffect(() => {
    const filtered = filterRepos(value, allRepos, recentRepos)
    setFilteredRepos(filtered)
    setSelectedIndex(0)
    setIsOpen(filtered.length > 0 && value.trim().length > 0)
  }, [value, allRepos, recentRepos, filterRepos])

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
    <div style={{ position: 'relative', flex: 1 }}>
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

      <style>{`
        .autocomplete-dropdown {
          position: absolute;
          top: calc(100% + 4px);
          left: 0;
          right: 0;
          background: var(--app-panel-bg);
          border: 1px solid var(--app-panel-border);
          border-radius: 8px;
          box-shadow: 0 4px 16px -2px var(--app-shadow);
          max-height: 300px;
          overflow-y: auto;
          z-index: 1000;
        }

        .autocomplete-item {
          padding: 12px 16px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: space-between;
          transition: background-color 0.15s;
          border-bottom: 1px solid var(--app-panel-border);
        }

        .autocomplete-item:last-child {
          border-bottom: none;
        }

        .autocomplete-item:hover,
        .autocomplete-item.selected {
          background: var(--app-bg);
        }

        .autocomplete-repo-name {
          color: var(--app-text-strong);
          font-weight: 500;
        }

        .autocomplete-badge {
          font-size: 0.75rem;
          padding: 2px 8px;
          border-radius: 4px;
          background: var(--app-accent);
          color: white;
          font-weight: 600;
        }

        .autocomplete-loading {
          position: absolute;
          top: calc(100% + 4px);
          left: 0;
          right: 0;
          padding: 12px 16px;
          background: var(--app-panel-bg);
          border: 1px solid var(--app-panel-border);
          border-radius: 8px;
          box-shadow: 0 4px 16px -2px var(--app-shadow);
          color: var(--app-text-muted);
          font-size: 0.9rem;
          text-align: center;
        }
      `}</style>
    </div>
  )
}
