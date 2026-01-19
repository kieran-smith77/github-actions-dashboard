import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import { fetchWorkflows, fetchWorkflowRuns, fetchAllRecentRuns, fetchRepository, fetchOrgRepositories, Workflow, WorkflowRun, Repository, OrgRepository } from './github.js';
import { getPinnedIds, pinWorkflow, unpinWorkflow } from './db.js';

// =============================================================================
// App Setup
// =============================================================================

const app = express();
app.use(cors());
app.use(express.json());

const publicDir = path.join(process.cwd(), 'public');
app.use(express.static(publicDir));

// =============================================================================
// Cache Configuration
// =============================================================================

interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

interface RepoCache {
  workflows: CacheEntry<Workflow[]> | null;
  allRuns: CacheEntry<WorkflowRun[]> | null;
  workflowRuns: Map<number, CacheEntry<WorkflowRun[]>>;
  repository: CacheEntry<Repository> | null;
}

const repoCache = new Map<string, RepoCache>();

// Global cache for org repositories (not per-repo since it's shared)
let orgRepositoriesCache: CacheEntry<OrgRepository[]> | null = null;

const CACHE_TTL = {
  workflows: 5 * 60_000,      // 5 minutes
  allRuns: 2 * 60_000,        // 2 minutes
  workflowRuns: 3 * 60_000,   // 3 minutes
  repository: 60 * 60_000,    // 60 minutes (default branch rarely changes)
  orgRepositories: 5 * 60_000, // 5 minutes (org repos don't change frequently)
};

function getCache(repo: string): RepoCache {
  if (!repoCache.has(repo)) {
    repoCache.set(repo, { workflows: null, allRuns: null, workflowRuns: new Map(), repository: null });
  }
  return repoCache.get(repo)!;
}

function isCacheValid<T>(entry: CacheEntry<T> | null | undefined, ttl: number): entry is CacheEntry<T> {
  return entry !== null && entry !== undefined && (Date.now() - entry.fetchedAt) < ttl;
}

function setCacheEntry<T>(entry: CacheEntry<T> | null, data: T): CacheEntry<T> {
  return { data, fetchedAt: Date.now() };
}

// =============================================================================
// Data Fetching with Caching
// =============================================================================

async function getCachedWorkflows(repo: string, forceRefresh: boolean): Promise<Workflow[]> {
  const cache = getCache(repo);
  if (!forceRefresh && isCacheValid(cache.workflows, CACHE_TTL.workflows)) {
    return cache.workflows.data;
  }
  const data = await fetchWorkflows(repo);
  cache.workflows = setCacheEntry(cache.workflows, data);
  return data;
}

async function getCachedAllRuns(repo: string, forceRefresh: boolean): Promise<WorkflowRun[]> {
  const cache = getCache(repo);
  if (!forceRefresh && isCacheValid(cache.allRuns, CACHE_TTL.allRuns)) {
    return cache.allRuns.data;
  }
  const data = await fetchAllRecentRuns(repo, 100);
  cache.allRuns = setCacheEntry(cache.allRuns, data);
  return data;
}

async function getCachedWorkflowRuns(repo: string, workflowId: number, perPage: number, forceRefresh: boolean): Promise<WorkflowRun[]> {
  const cache = getCache(repo);
  const cached = cache.workflowRuns.get(workflowId);
  if (!forceRefresh && isCacheValid(cached, CACHE_TTL.workflowRuns)) {
    return cached.data.slice(0, perPage);
  }
  const data = await fetchWorkflowRuns(repo, workflowId, perPage);
  cache.workflowRuns.set(workflowId, setCacheEntry(null, data));
  return data;
}

async function getCachedRepository(repo: string, forceRefresh: boolean): Promise<Repository> {
  const cache = getCache(repo);
  if (!forceRefresh && isCacheValid(cache.repository, CACHE_TTL.repository)) {
    return cache.repository.data;
  }
  const data = await fetchRepository(repo);
  cache.repository = setCacheEntry(cache.repository, data);
  return data;
}

async function getCachedOrgRepositories(forceRefresh: boolean): Promise<OrgRepository[]> {
  if (!forceRefresh && isCacheValid(orgRepositoriesCache, CACHE_TTL.orgRepositories)) {
    return orgRepositoriesCache.data;
  }
  const data = await fetchOrgRepositories();
  orgRepositoriesCache = setCacheEntry(orgRepositoriesCache, data);
  return data;
}

// =============================================================================
// Input Validation
// =============================================================================

const REPO_NAME_REGEX = /^[a-zA-Z0-9._-]+$/;

function isValidRepoName(repo: string): boolean {
  return REPO_NAME_REGEX.test(repo) && repo.length <= 100;
}

function validateRepo(req: Request, res: Response): string | null {
  const repo = req.params.repo;
  if (!isValidRepoName(repo)) {
    res.status(400).json({ error: 'Invalid repository name' });
    return null;
  }
  return repo;
}

// =============================================================================
// Helper Functions
// =============================================================================

function buildLatestRunMap(runs: WorkflowRun[]): Map<number, WorkflowRun> {
  const latestByWorkflow = new Map<number, WorkflowRun>();

  for (const run of runs) {
    const workflowId = run.workflow_id;
    if (workflowId && !latestByWorkflow.has(workflowId)) {
      latestByWorkflow.set(workflowId, run);
    }
  }

  return latestByWorkflow;
}

function attachLatestRuns(
  workflows: (Workflow & { pinned: boolean })[],
  latestRunMap: Map<number, WorkflowRun>
): (Workflow & { pinned: boolean; latestRun: WorkflowRun | null })[] {
  return workflows.map(w => ({
    ...w,
    latestRun: latestRunMap.get(w.id) || null,
  }));
}

// =============================================================================
// API Routes
// =============================================================================

app.get('/api/:repo/workflows', async (req, res) => {
  const repo = validateRepo(req, res);
  if (!repo) return;

  try {
    const search = (req.query.search as string || '').toLowerCase();
    const pinnedOnly = req.query.pinnedOnly === 'true';
    const refresh = req.query.refresh === 'true';
    const includeLatestRun = req.query.includeLatestRun === 'true';

    const workflows = await getCachedWorkflows(repo, refresh);
    const pinnedIds = getPinnedIds(repo);
    const pinnedSet = new Set(pinnedIds);

    let result = workflows
      .map(w => ({ ...w, pinned: pinnedSet.has(w.id) }))
      .filter(w => !search || w.name.toLowerCase().includes(search) || w.path.toLowerCase().includes(search))
      .filter(w => !pinnedOnly || w.pinned);

    if (includeLatestRun) {
      try {
        const allRuns = await getCachedAllRuns(repo, refresh);
        const latestRunMap = buildLatestRunMap(allRuns);
        result = attachLatestRuns(result, latestRunMap);
      } catch (e) {
        console.error('Error fetching runs:', e);
        result = result.map(w => ({ ...w, latestRun: null }));
      }
    }

    res.json({ workflows: result, count: result.length, pinnedIds, repo });
  } catch (e: any) {
    console.error('Error fetching workflows:', e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/:repo/workflows/:id/runs', async (req, res) => {
  const repo = validateRepo(req, res);
  if (!repo) return;

  try {
    const workflowId = Number(req.params.id);
    const perPage = Math.min(Number(req.query.per_page) || 20, 100);
    const refresh = req.query.refresh === 'true';

    const runs = await getCachedWorkflowRuns(repo, workflowId, perPage, refresh);
    res.json({ runs });
  } catch (e: any) {
    console.error('Error fetching workflow runs:', e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/:repo/info', async (req, res) => {
  const repo = validateRepo(req, res);
  if (!repo) return;

  try {
    const refresh = req.query.refresh === 'true';
    const repoInfo = await getCachedRepository(repo, refresh);
    res.json({ defaultBranch: repoInfo.default_branch });
  } catch (e: any) {
    console.error('Error fetching repository info:', e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/:repo/pins', (req, res) => {
  const repo = validateRepo(req, res);
  if (!repo) return;

  res.json({ pinnedIds: getPinnedIds(repo) });
});

app.post('/api/:repo/pins/:id', (req, res) => {
  const repo = validateRepo(req, res);
  if (!repo) return;

  const workflowId = Number(req.params.id);
  pinWorkflow(repo, workflowId);
  res.json({ id: workflowId, pinned: true });
});

app.delete('/api/:repo/pins/:id', (req, res) => {
  const repo = validateRepo(req, res);
  if (!repo) return;

  const workflowId = Number(req.params.id);
  unpinWorkflow(repo, workflowId);
  res.json({ id: workflowId, pinned: false });
});

app.get('/api/repositories', async (req, res) => {
  try {
    const refresh = req.query.refresh === 'true';
    const repositories = await getCachedOrgRepositories(refresh);
    res.json({ repositories, count: repositories.length });
  } catch (e: any) {
    console.error('Error fetching org repositories:', e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/health', (_req, res) => {
  const configured = !!process.env.GITHUB_TOKEN;
  res.json({ status: 'ok', configured });
});

// SPA fallback - serve index.html for all non-API routes
app.get('*', (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// =============================================================================
// Server Startup
// =============================================================================

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Actions dashboard listening on http://localhost:${port}`);
});
