import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { addRecentRepo } from './Home'
import { Workflow, WorkflowRun, QuickFilter, Theme } from '../types'
import '../styles/dashboard.css'

// =============================================================================
// Configuration
// =============================================================================

const BACKGROUND_REFRESH_INTERVAL = 60_000 // Refresh data every 60 seconds when tab is visible
const STALE_TIME = 30_000 // Consider data stale after 30 seconds

// =============================================================================
// Utility Functions
// =============================================================================

function getRunStatus(run: { conclusion: string | null; status: string }) {
  const status = (run.conclusion || run.status || '').toLowerCase()

  if (status.includes('success')) return { color: 'var(--chip-success)', icon: '✓' }
  if (status.includes('failure')) return { color: 'var(--chip-failure)', icon: '✗' }
  if (status.includes('cancel')) return { color: 'var(--chip-cancel)', icon: '⊘' }
  if (status.includes('queued')) return { color: 'var(--chip-queued)', icon: '⋯' }
  if (status.includes('in_progress')) return { color: 'var(--chip-progress)', icon: '↻' }
  return { color: 'var(--chip-neutral)', icon: '○' }
}

function applyQuickFilter(workflows: Workflow[], filter: QuickFilter): Workflow[] {
  if (filter === 'all') return workflows

  return workflows.filter(w => {
    const path = w.path.toLowerCase()
    switch (filter) {
      case 'tf-dev':
        return path.endsWith('tf-plan-apply-dev.yml')
      case 'tf-prd':
        return path.endsWith('tf-plan-apply-prd.yml')
      case 'tf-all':
        return path.includes('tf-plan-apply')
      case 'non-tf-obs':
        return !path.includes('tf-plan-apply') && !path.includes('observability')
      default:
        return true
    }
  })
}

// =============================================================================
// Custom Hooks
// =============================================================================

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debouncedValue
}

function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() =>
    typeof window !== 'undefined' && localStorage.getItem('theme') === 'dark' ? 'dark' : 'light'
  )

  useEffect(() => {
    document.body.classList.toggle('theme-dark', theme === 'dark')
    localStorage.setItem('theme', theme)
  }, [theme])

  const toggleTheme = useCallback(() => {
    setTheme(t => t === 'light' ? 'dark' : 'light')
  }, [])

  return [theme, toggleTheme]
}

// =============================================================================
// Main Component
// =============================================================================

export default function App() {
  const { repo } = useParams<{ repo: string }>()
  const navigate = useNavigate()
  const [theme, toggleTheme] = useTheme()

  // Data state
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const lastFetchRef = useRef<number>(0)

  // Filter state - these don't trigger API calls, only filter cached data
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 500)
  const [pinnedOnly, setPinnedOnly] = useState(false)
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all')
  const [defaultBranchOnly, setDefaultBranchOnly] = useState(false)
  const [defaultBranch, setDefaultBranch] = useState<string>('')

  // Modal state
  const [selected, setSelected] = useState<Workflow | null>(null)
  const [runs, setRuns] = useState<WorkflowRun[]>([])
  const [runsLoading, setRunsLoading] = useState(false)
  const [runsError, setRunsError] = useState<string | null>(null)

  // ---------------------------------------------------------------------------
  // Data Fetching - Only fetch when repo changes or explicit refresh
  // ---------------------------------------------------------------------------

  const fetchWorkflows = useCallback(async (forceRefresh = false) => {
    if (!repo) return

    // Stale-while-revalidate: Return cached data immediately, refresh in background
    const now = Date.now()
    const isStale = now - lastFetchRef.current > STALE_TIME

    // Don't fetch if data is fresh and not forcing refresh
    if (!forceRefresh && !isStale && workflows.length > 0) {
      return
    }

    // Show loading only on initial load
    if (workflows.length === 0) {
      setLoading(true)
    }

    try {
      const params = new URLSearchParams({
        includeLatestRun: 'true',
        ...(forceRefresh && { refresh: 'true' })
      })

      const response = await fetch(`/api/${repo}/workflows?${params}`)
      const data = await response.json()

      if (!response.ok) {
        // Handle 404 - repo not found (GitHub returns 404, backend returns 500 with error message)
        if (response.status === 404 || (data.error && data.error.includes('GitHub API 404'))) {
          setLoading(false)
          navigate('/')
          return
        }

        const errorMsg = data.error || 'Failed to load workflows'
        setError(errorMsg.includes('rate limit')
          ? 'GitHub API rate limit exceeded. Please wait a few minutes and try again.'
          : `Error: ${errorMsg}`)
        if (workflows.length === 0) setWorkflows([])
      } else {
        setWorkflows(data.workflows || [])
        setError(null)
        lastFetchRef.current = Date.now()
        // Only add to recent repos after successful load
        addRecentRepo(repo)
      }
    } catch (e: any) {
      setError(`Network error: ${e.message}`)
      // Keep existing workflows on error
    } finally {
      setLoading(false)
    }
  }, [repo, workflows.length, navigate])

  // Initial fetch when repo changes
  useEffect(() => {
    if (repo) {
      setWorkflows([]) // Clear workflows when switching repos
      lastFetchRef.current = 0 // Reset cache timestamp
      setDefaultBranch('') // Reset default branch
      fetchWorkflows(true)
      // Fetch default branch
      fetch(`/api/${repo}/info`)
        .then(res => res.json())
        .then(data => setDefaultBranch(data.defaultBranch))
        .catch(err => console.error('Failed to fetch default branch:', err))
    }
  }, [repo]) // Only depend on repo, not fetchWorkflows

  // Background refresh when tab is visible
  useEffect(() => {
    if (!repo) return

    let intervalId: ReturnType<typeof setInterval>

    const startBackgroundRefresh = () => {
      intervalId = setInterval(() => {
        if (document.visibilityState === 'visible') {
          fetchWorkflows(false) // Silent background refresh
        }
      }, BACKGROUND_REFRESH_INTERVAL)
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Refresh immediately when tab becomes visible if data is stale
        const isStale = Date.now() - lastFetchRef.current > STALE_TIME
        if (isStale) {
          fetchWorkflows(false)
        }
      }
    }

    startBackgroundRefresh()
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      clearInterval(intervalId)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [repo, fetchWorkflows])

  // ---------------------------------------------------------------------------
  // Filtering - Entirely client-side on cached data
  // ---------------------------------------------------------------------------

  const filteredWorkflows = useMemo(() => {
    const searchLower = debouncedSearch.toLowerCase()
    return applyQuickFilter(workflows, quickFilter)
      .filter(w => !debouncedSearch || w.name.toLowerCase().includes(searchLower) || w.path.toLowerCase().includes(searchLower))
      .filter(w => !pinnedOnly || w.pinned)
      .filter(w => !defaultBranchOnly || !defaultBranch || (w.latestRun && w.latestRun.head_branch === defaultBranch))
  }, [workflows, debouncedSearch, pinnedOnly, quickFilter, defaultBranchOnly, defaultBranch])

  const pinnedWorkflows = useMemo(
    () => workflows.filter(w => w.pinned),
    [workflows]
  )

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const openWorkflow = useCallback(async (workflow: Workflow, perPage = 25) => {
    if (!repo) return

    setSelected(workflow)
    setRunsLoading(true)
    setRunsError(null)
    setRuns([])

    try {
      const response = await fetch(`/api/${repo}/workflows/${workflow.id}/runs?per_page=${perPage}`)
      const data = await response.json()

      if (!response.ok) {
        setRunsError(data.error || 'Failed to fetch runs')
      } else {
        setRuns(data.runs || [])
      }
    } catch (e: any) {
      setRunsError(e.message || 'Network error')
    } finally {
      setRunsLoading(false)
    }
  }, [repo])

  const togglePin = useCallback(async (workflow: Workflow) => {
    if (!repo) return

    const method = workflow.pinned ? 'DELETE' : 'POST'
    await fetch(`/api/${repo}/pins/${workflow.id}`, { method })

    // Optimistic update - update local state immediately
    setWorkflows(prev =>
      prev.map(w =>
        w.id === workflow.id ? { ...w, pinned: !w.pinned } : w
      )
    )
  }, [repo])

  const handleRefresh = useCallback(() => {
    fetchWorkflows(true)
  }, [fetchWorkflows])

  // ---------------------------------------------------------------------------
  // Keyboard Shortcuts
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selected) {
        setSelected(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selected])

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="dashboard-root">
      {/* Sidebar */}
      <aside className="dashboard-aside">
        <h2 className="dashboard-title">Filters</h2>

        <input
          className="dashboard-search"
          placeholder="Search by name/path..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          aria-label="Search workflows by name or path"
        />

        <button
          className={`dashboard-filter-toggle ${pinnedOnly ? 'active' : ''}`}
          onClick={() => setPinnedOnly(!pinnedOnly)}
        >
          {pinnedOnly ? '★' : '☆'} Show pinned only
        </button>

        <button
          className={`dashboard-filter-toggle ${defaultBranchOnly ? 'active' : ''}`}
          onClick={() => setDefaultBranchOnly(!defaultBranchOnly)}
          disabled={!defaultBranch}
        >
          Default branch only {defaultBranch && `(${defaultBranch})`}
        </button>

        <button className="dashboard-btn" onClick={handleRefresh}>
          Refresh
        </button>

        <h3 className="dashboard-pinned-list-title">
          Pinned
        </h3>

        <div className="dashboard-pinned-list">
          {pinnedWorkflows.length === 0 ? (
            <div className="dashboard-pinned-empty">No pins yet.</div>
          ) : (
            pinnedWorkflows.map(w => (
              <div key={w.id} className="dashboard-pinned-item">
                <button
                  className="dashboard-link dashboard-pinned-link"
                  onClick={() => openWorkflow(w)}
                >
                  {w.name}
                </button>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="dashboard-main">
        {/* Error Banner */}
        {error && (
          <div className="error-banner">
            <span className="error-icon">!</span>
            <div className="error-content">
              <div className="error-title">Unable to Load Workflows</div>
              <div className="error-message">{error}</div>
            </div>
            <button className="error-dismiss" onClick={() => setError(null)}>
              Dismiss
            </button>
          </div>
        )}

        {/* Header */}
        <div className="dashboard-header">
          <div className="dashboard-header-left">
            <Link to="/" title="Back to repo selection">
              <img src="/logo.png" alt="Home" className="dashboard-logo" />
            </Link>
            <div>
              <h1 className="dashboard-title dashboard-title-wrapper">{repo}</h1>
              <div className="dashboard-subtitle">
                GitHub Actions Workflows
              </div>
            </div>
          </div>

          <div
            className="dashboard-workflow-count"
            aria-live="polite"
            aria-atomic="true"
          >
            {filteredWorkflows.length} workflow{filteredWorkflows.length !== 1 ? 's' : ''}
            {quickFilter !== 'all' && ` (${workflows.length} total)`}
          </div>

          <button
            className="dashboard-btn"
            onClick={toggleTheme}
            aria-label="Toggle dark mode"
          >
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
        </div>

        {/* Quick Filters */}
        <QuickFilters value={quickFilter} onChange={setQuickFilter} />

        {/* Workflow Grid */}
        <div className="dashboard-workflow-grid">
          {loading && workflows.length === 0 ? (
            <LoadingSkeleton />
          ) : filteredWorkflows.length === 0 ? (
            <EmptyState
              error={error}
              search={debouncedSearch}
              quickFilter={quickFilter}
            />
          ) : (
            filteredWorkflows.map(w => (
              <WorkflowCard
                key={w.id}
                workflow={w}
                onOpen={openWorkflow}
                onTogglePin={togglePin}
              />
            ))
          )}
        </div>

        {/* Runs Modal */}
        {selected && (
          <RunsModal
            workflow={selected}
            runs={runs}
            loading={runsLoading}
            error={runsError}
            onClose={() => setSelected(null)}
            onRetry={() => openWorkflow(selected)}
            defaultBranch={defaultBranch}
            defaultBranchOnly={defaultBranchOnly}
            onDefaultBranchOnlyChange={setDefaultBranchOnly}
          />
        )}
      </main>
    </div>
  )
}

// =============================================================================
// Sub-Components
// =============================================================================

function QuickFilters({ value, onChange }: { value: QuickFilter; onChange: (v: QuickFilter) => void }) {
  const filters: { id: QuickFilter; label: string; description: string }[] = [
    { id: 'all', label: 'All', description: 'Show everything' },
    { id: 'tf-dev', label: 'TF Dev', description: '*tf-plan-apply-dev.yml' },
    { id: 'tf-prd', label: 'TF Prd', description: '*tf-plan-apply-prd.yml' },
    { id: 'tf-all', label: 'All TF', description: 'Contains tf-plan-apply' },
    { id: 'non-tf-obs', label: 'Other', description: 'Excludes TF & observability' },
  ]

  return (
    <div className="quick-filters">
      {filters.map(f => (
        <button
          key={f.id}
          className={`quick-filter-btn ${value === f.id ? 'active' : ''}`}
          onClick={() => onChange(f.id)}
        >
          {f.label}
          <span className="quick-filter-label">{f.description}</span>
        </button>
      ))}
    </div>
  )
}

function WorkflowCard({
  workflow,
  onOpen,
  onTogglePin,
}: {
  workflow: Workflow
  onOpen: (w: Workflow) => void
  onTogglePin: (w: Workflow) => void
}) {
  return (
    <div className="dashboard-workflow-card" onClick={() => onOpen(workflow)}>
      <div className="dashboard-workflow-header">
        <span className="dashboard-workflow-name" title={workflow.name}>
          {workflow.name}
        </span>
        <button
          className={`dashboard-pin-btn ${workflow.pinned ? 'pinned' : ''}`}
          onClick={e => { e.stopPropagation(); onTogglePin(workflow) }}
          aria-label={workflow.pinned ? `Unpin ${workflow.name}` : `Pin ${workflow.name}`}
        >
          {workflow.pinned ? '★' : '☆'}
        </button>
      </div>

      <a
        className="dashboard-workflow-path"
        href={workflow.html_url}
        target="_blank"
        rel="noreferrer"
        onClick={e => e.stopPropagation()}
      >
        {workflow.path}
      </a>

      <div className="dashboard-workflow-card-status">
        {workflow.latestRun ? (
          <>
            {(() => {
              const status = getRunStatus(workflow.latestRun)
              return (
                <span className="dashboard-status-chip" style={{ '--status-color': status.color } as React.CSSProperties}>
                  <span className="status-icon">{status.icon}</span>
                  {workflow.latestRun.conclusion || workflow.latestRun.status}
                </span>
              )
            })()}
            <a
              className="dashboard-link"
              href={workflow.latestRun.html_url}
              target="_blank"
              rel="noreferrer"
              onClick={e => e.stopPropagation()}
            >
              Open
            </a>
          </>
        ) : (
          <span className="dashboard-status-chip-neutral">
            <span className="status-icon">○</span>
            No recent run
          </span>
        )}
      </div>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="skeleton-card">
          <div className="skeleton-line skeleton-line-70" />
          <div className="skeleton-line skeleton-line-90" />
          <div className="skeleton-line skeleton-line-50" />
        </div>
      ))}
    </>
  )
}

function EmptyState({ error, search, quickFilter }: { error: string | null; search: string; quickFilter: QuickFilter }) {
  const message = error ? 'Unable to load workflows due to an error'
    : search ? `No workflows match "${search}"`
    : quickFilter !== 'all' ? 'No workflows match this filter'
    : 'No workflows available'

  return (
    <div className="empty-state">
      <div className="empty-state-title">No workflows found</div>
      <div className="empty-state-text">{message}</div>
    </div>
  )
}

function RunsModal({
  workflow,
  runs,
  loading,
  error,
  onClose,
  onRetry,
  defaultBranch,
  defaultBranchOnly,
  onDefaultBranchOnlyChange,
}: {
  workflow: Workflow
  runs: WorkflowRun[]
  loading: boolean
  error: string | null
  onClose: () => void
  onRetry: () => void
  defaultBranch: string
  defaultBranchOnly: boolean
  onDefaultBranchOnlyChange: (value: boolean) => void
}) {
  const filteredRuns = defaultBranchOnly && defaultBranch
    ? runs.filter(r => r.head_branch === defaultBranch)
    : runs

  return (
    <div className="dashboard-modal-bg" onClick={onClose}>
      <div className="dashboard-modal" onClick={e => e.stopPropagation()}>
        <div className="dashboard-modal-header">
          <span className="dashboard-modal-title">{workflow.name} runs</span>
          <button className="dashboard-modal-close" onClick={onClose}>Close</button>
        </div>

        {!loading && !error && defaultBranch && (
          <div className="dashboard-modal-branch-filter">
            <button
              className={`dashboard-filter-toggle ${defaultBranchOnly ? 'active' : ''}`}
              onClick={() => onDefaultBranchOnlyChange(!defaultBranchOnly)}
            >
              Default branch only ({defaultBranch})
            </button>
          </div>
        )}

        {loading ? (
          <div className="dashboard-modal-loading">Loading runs...</div>
        ) : error ? (
          <div className="dashboard-modal-error">
            <div className="dashboard-modal-error-title">Failed to load runs</div>
            <div className="dashboard-modal-error-message">{error}</div>
            <button className="dashboard-btn" onClick={onRetry}>Retry</button>
          </div>
        ) : filteredRuns.length === 0 ? (
          <div className="dashboard-modal-empty">
            {defaultBranchOnly ? `No runs on ${defaultBranch} branch` : 'No runs found'}
          </div>
        ) : (
          <table className="dashboard-table">
            <thead>
              <tr>
                <th>Run #</th>
                <th>Status</th>
                <th>Event</th>
                <th>Branch</th>
                <th>Started</th>
                <th>Link</th>
              </tr>
            </thead>
            <tbody>
              {filteredRuns.map(r => {
                const status = getRunStatus(r)
                return (
                  <tr key={r.id}>
                    <td>#{r.run_number}</td>
                    <td>
                      <span className="dashboard-status-chip" style={{ '--status-color': status.color } as React.CSSProperties}>
                        <span className="status-icon">{status.icon}</span>
                        {r.conclusion || r.status}
                      </span>
                    </td>
                    <td>{r.event}</td>
                    <td>{r.head_branch}</td>
                    <td>{new Date(r.created_at).toLocaleString()}</td>
                    <td>
                      <a className="dashboard-link" href={r.html_url} target="_blank" rel="noreferrer">
                        Open
                      </a>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
