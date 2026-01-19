import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import Autocomplete from './Autocomplete'
import { Repository, AutocompleteOption } from '../types'

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
  const [repositories, setRepositories] = useState<Repository[]>([])
  const [reposLoading, setReposLoading] = useState(false)
  const [reposError, setReposError] = useState<string | null>(null)
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    (typeof window !== 'undefined' && localStorage.getItem('theme') === 'dark') ? 'dark' : 'light'
  )
  const navigate = useNavigate()

  useEffect(() => {
    setRecentRepos(getRecentRepos())
  }, [])

  // Fetch repositories on mount
  useEffect(() => {
    async function loadRepositories() {
      setReposLoading(true)
      setReposError(null)
      try {
        const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001'
        const response = await fetch(`${apiBase}/api/repositories`)
        if (!response.ok) {
          throw new Error(`Failed to fetch repositories: ${response.statusText}`)
        }
        const data = await response.json()
        setRepositories(data.repositories || [])
      } catch (error: any) {
        console.error('Error fetching repositories:', error)
        setReposError(error.message)
      } finally {
        setReposLoading(false)
      }
    }

    loadRepositories()
  }, [])

  useEffect(() => {
    if (theme === 'dark') {
      document.body.classList.add('theme-dark')
    } else {
      document.body.classList.remove('theme-dark')
    }
    localStorage.setItem('theme', theme)
  }, [theme])

  // Transform repositories into autocomplete options
  const autocompleteOptions = useMemo<AutocompleteOption[]>(() => {
    const recentSet = new Set(recentRepos)

    // Create options from all repositories
    const allOptions: AutocompleteOption[] = repositories.map(repo => ({
      value: repo.name,
      label: repo.name,
      description: repo.description || undefined,
      isRecent: recentSet.has(repo.name),
    }))

    // Sort: recent repos first (in visit order), then alphabetically
    const recentOptions = recentRepos
      .map(recentName => allOptions.find(opt => opt.value === recentName))
      .filter((opt): opt is AutocompleteOption => opt !== undefined)

    const nonRecentOptions = allOptions
      .filter(opt => !opt.isRecent)
      .sort((a, b) => a.label.localeCompare(b.label))

    return [...recentOptions, ...nonRecentOptions]
  }, [repositories, recentRepos])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const repo = repoInput.trim()
    if (repo) {
      addRecentRepo(repo)
      navigate(`/${repo}`)
    }
  }

  function handleSelectRepo(repo: string) {
    setRepoInput(repo)
    addRecentRepo(repo)
    setRecentRepos(getRecentRepos())
    navigate(`/${repo}`)
  }

  function goToRepo(repo: string) {
    addRecentRepo(repo)
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
      <style>{`
        :root {
          --app-bg: #f8fafc;
          --app-bg-gradient-start: #f8fafc;
          --app-bg-gradient-end: #e0e7ff;
          --app-panel-bg: #ffffff;
          --app-panel-border: #e0e7ff;
          --app-shadow: #c7d2fe;
          --app-text-strong: #1f2937;
          --app-text-muted: #64748b;
          --app-link: #5661ff;
          --app-heading: #3730a3;
          --app-accent: #6366f1;
        }
        body.theme-dark {
          --app-bg: #111827;
          --app-bg-gradient-start: #111827;
          --app-bg-gradient-end: #1e293b;
          --app-panel-bg: #1f2937;
          --app-panel-border: #374151;
          --app-shadow: #000000;
          --app-text-strong: #f3f4f6;
          --app-text-muted: #9ca3af;
          --app-link: #a5b4fc;
          --app-heading: #a5b4fc;
          --app-accent: #818cf8;
        }
        .home-root {
          min-height: 100vh;
          background: linear-gradient(135deg, var(--app-bg-gradient-start) 0%, var(--app-bg-gradient-end) 100%);
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 60px 20px;
        }
        .home-card {
          background: var(--app-panel-bg);
          border-radius: 16px;
          box-shadow: 0 4px 24px -4px var(--app-shadow);
          padding: 40px;
          width: 100%;
          max-width: 500px;
          border: 1px solid var(--app-panel-border);
        }
        .home-logo {
          width: 80px;
          height: 80px;
          margin: 0 auto 16px auto;
          display: block;
        }
        .home-title {
          font-size: 1.8rem;
          font-weight: 700;
          color: var(--app-heading);
          margin: 0 0 8px 0;
          text-align: center;
        }
        .home-subtitle {
          color: var(--app-text-muted);
          text-align: center;
          margin-bottom: 32px;
          font-size: 1rem;
        }
        .home-form {
          display: flex;
          gap: 12px;
          margin-bottom: 32px;
        }
        .home-input {
          flex: 1;
          padding: 12px 16px;
          border-radius: 8px;
          border: 1px solid var(--app-panel-border);
          background: var(--app-bg);
          font-size: 1rem;
          color: var(--app-text-strong);
          box-shadow: 0 2px 8px -2px var(--app-shadow);
        }
        .home-input:focus {
          outline: none;
          border-color: var(--app-accent);
          box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
        }
        .home-btn {
          padding: 12px 24px;
          border-radius: 8px;
          border: none;
          background: linear-gradient(90deg, #6366f1 0%, #818cf8 100%);
          color: #fff;
          font-weight: 600;
          cursor: pointer;
          box-shadow: 0 2px 8px -2px #818cf8;
          transition: all 0.2s;
          white-space: nowrap;
        }
        .home-btn:hover {
          background: linear-gradient(90deg, #4f46e5 0%, #6366f1 100%);
          transform: translateY(-1px);
        }
        .home-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          transform: none;
        }
        .home-section-title {
          font-size: 1rem;
          font-weight: 600;
          color: var(--app-accent);
          margin-bottom: 12px;
        }
        .home-recent-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .home-recent-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          border-radius: 8px;
          background: var(--app-bg);
          border: 1px solid var(--app-panel-border);
          cursor: pointer;
          transition: all 0.2s;
        }
        .home-recent-item:hover {
          border-color: var(--app-accent);
          box-shadow: 0 2px 8px -2px var(--app-shadow);
          transform: translateX(4px);
        }
        .home-recent-name {
          font-weight: 500;
          color: var(--app-text-strong);
        }
        .home-recent-org {
          font-size: 0.85rem;
          color: var(--app-text-muted);
        }
        .home-recent-remove {
          background: none;
          border: none;
          color: var(--app-text-muted);
          cursor: pointer;
          padding: 4px 8px;
          font-size: 1.1rem;
          opacity: 0.5;
          transition: all 0.2s;
        }
        .home-recent-remove:hover {
          opacity: 1;
          color: #ef4444;
        }
        .home-empty {
          text-align: center;
          color: var(--app-text-muted);
          padding: 20px;
          font-size: 0.95rem;
        }
        .home-theme-toggle {
          position: fixed;
          top: 20px;
          right: 20px;
          padding: 8px 16px;
          border-radius: 8px;
          border: none;
          background: var(--app-panel-bg);
          color: var(--app-text-strong);
          cursor: pointer;
          box-shadow: 0 2px 8px -2px var(--app-shadow);
          border: 1px solid var(--app-panel-border);
        }
        .home-hint {
          font-size: 0.85rem;
          color: var(--app-text-muted);
          text-align: center;
          margin-top: -20px;
          margin-bottom: 24px;
        }
      `}</style>

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
          <Autocomplete
            value={repoInput}
            onChange={setRepoInput}
            onSelect={handleSelectRepo}
            options={autocompleteOptions}
            placeholder="Enter repository name..."
            className="home-input"
            loading={reposLoading}
            autoFocus
          />
          <button className="home-btn" type="submit" disabled={!repoInput.trim()}>
            Go
          </button>
        </form>

        {reposError && (
          <p className="home-error" style={{ color: '#ef4444', fontSize: '0.85rem', textAlign: 'center', marginTop: '-20px', marginBottom: '24px' }}>
            Unable to load repositories. You can still enter a repository name manually.
          </p>
        )}

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
