import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import RepoAutocomplete from './RepoAutocomplete'
import '../styles/home.css'

const RECENT_REPOS_KEY = 'recentRepos'
const MAX_RECENT_REPOS = 10

function getRecentRepos(): string[] {
  try {
    const stored = localStorage.getItem(RECENT_REPOS_KEY)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

export function addRecentRepo(repo: string): void {
  const recent = getRecentRepos().filter(r => r !== repo)
  recent.unshift(repo)
  localStorage.setItem(RECENT_REPOS_KEY, JSON.stringify(recent.slice(0, MAX_RECENT_REPOS)))
}

export default function Home() {
  const [repoInput, setRepoInput] = useState('')
  const [recentRepos, setRecentRepos] = useState<string[]>([])
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    (typeof window !== 'undefined' && localStorage.getItem('theme') === 'dark') ? 'dark' : 'light'
  )
  const navigate = useNavigate()

  useEffect(() => {
    setRecentRepos(getRecentRepos())
  }, [])

  useEffect(() => {
    if (theme === 'dark') {
      document.body.classList.add('theme-dark')
    } else {
      document.body.classList.remove('theme-dark')
    }
    localStorage.setItem('theme', theme)
  }, [theme])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const repo = repoInput.trim()
    if (repo) {
      navigate(`/${repo}`)
    }
  }

  function handleRepoSelect(repo: string) {
    navigate(`/${repo}`)
  }

  function goToRepo(repo: string) {
    navigate(`/${repo}`)
  }

  function removeRecentRepo(repo: string, e: React.MouseEvent) {
    e.stopPropagation()
    const updated = recentRepos.filter(r => r !== repo)
    setRecentRepos(updated)
    localStorage.setItem(RECENT_REPOS_KEY, JSON.stringify(updated))
  }

  return (
    <div className="home-root">
      <button
        className="home-theme-toggle"
        onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
        aria-label="Toggle dark mode"
      >
        {theme === 'light' ? '🌙' : '☀️'}
      </button>

      <div className="home-card">
        <img src="/logo.png" alt="Actions Dashboard" className="home-logo" />
        <h1 className="home-title">GitHub Actions Dashboard</h1>
        <p className="home-subtitle">View workflows for any repository</p>

        <form className="home-form" onSubmit={handleSubmit}>
          <RepoAutocomplete
            value={repoInput}
            onChange={setRepoInput}
            onSelect={handleRepoSelect}
            recentRepos={recentRepos}
            placeholder="Enter repository name..."
            autoFocus
          />
          <button className="home-btn" type="submit" disabled={!repoInput.trim()}>
            Go
          </button>
        </form>

        <p className="home-hint">e.g., my-app, my-infrastructure</p>

        {recentRepos.length > 0 && (
          <>
            <h2 className="home-section-title">Recent Repositories</h2>
            <div className="home-recent-list">
              {recentRepos.map(repo => (
                <div
                  key={repo}
                  className="home-recent-item"
                  onClick={() => goToRepo(repo)}
                >
                  <div>
                    <div className="home-recent-name">{repo}</div>
                  </div>
                  <button
                    className="home-recent-remove"
                    onClick={(e) => removeRecentRepo(repo, e)}
                    aria-label={`Remove ${repo} from recent`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        {recentRepos.length === 0 && (
          <div className="home-empty">
            No recent repositories. Enter a repo name above to get started.
          </div>
        )}
      </div>
    </div>
  )
}
