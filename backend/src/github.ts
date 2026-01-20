export interface Repository {
  name: string;
  full_name: string;
  default_branch: string;
}

export interface Workflow {
  id: number;
  name: string;
  path: string;
  state: string;
  html_url: string;
  badge_url: string;
}

export interface WorkflowRun {
  id: number;
  name: string;
  head_branch: string;
  head_sha: string;
  status: string;
  conclusion: string | null;
  html_url: string;
  created_at: string;
  updated_at: string;
  run_number: number;
  event: string;
  workflow_id?: number;
}

interface Paginated<T> { total_count: number; workflows?: T[]; workflow_runs?: T[]; }

const API_BASE = 'https://api.github.com';

function getToken(): string {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN not set');
  return token;
}

function getOwner(): string {
  const owner = process.env.GITHUB_OWNER;
  if (!owner) throw new Error('GITHUB_OWNER not set');
  return owner;
}

async function ghFetch<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${getToken()}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    }
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API ${res.status}: ${text}`);
  }
  return res.json();
}

export async function fetchWorkflows(repo: string): Promise<Workflow[]> {
  const owner = getOwner();
  let workflows: Workflow[] = [];
  let page = 1;
  let total = 0;
  do {
    const url = `${API_BASE}/repos/${owner}/${repo}/actions/workflows?per_page=100&page=${page}`;
    const data = await ghFetch<Paginated<Workflow>>(url);
    if (data.workflows) workflows.push(...data.workflows);
    total = data.total_count || workflows.length;
    page++;
  } while (workflows.length < total);
  return workflows;
}

export async function fetchWorkflowRuns(repo: string, workflowId: number, perPage = 20): Promise<WorkflowRun[]> {
  const owner = getOwner();
  const url = `${API_BASE}/repos/${owner}/${repo}/actions/workflows/${workflowId}/runs?per_page=${perPage}`;
  const data = await ghFetch<Paginated<WorkflowRun>>(url);
  return data.workflow_runs || [];
}

export async function fetchAllRecentRuns(repo: string, perPage = 100): Promise<WorkflowRun[]> {
  const owner = getOwner();
  const url = `${API_BASE}/repos/${owner}/${repo}/actions/runs?per_page=${perPage}`;
  const data = await ghFetch<Paginated<WorkflowRun>>(url);
  return data.workflow_runs || [];
}

export async function fetchRepository(repo: string): Promise<Repository> {
  const owner = getOwner();
  const data = await ghFetch<Repository>(`${API_BASE}/repos/${owner}/${repo}`);
  return data;
}

export async function fetchOrgRepositories(): Promise<string[]> {
  const owner = getOwner();
  let repositories: string[] = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const url = `${API_BASE}/orgs/${owner}/repos?per_page=${perPage}&page=${page}&sort=updated`;
    const data = await ghFetch<Array<{ name: string }>>(url);
    
    if (!data || data.length === 0) break;
    
    repositories.push(...data.map(repo => repo.name));
    
    if (data.length < perPage) break;
    page++;
  }

  return repositories;
}

export async function searchOrgRepositories(query: string, limit = 10): Promise<string[]> {
  const owner = getOwner();
  
  if (!query || query.trim().length === 0) {
    return [];
  }

  // Use GitHub's search API for efficient searching
  // Search in repository name and optionally expand if needed
  const searchQuery = `${query} in:name org:${owner}`;
  const url = `${API_BASE}/search/repositories?q=${encodeURIComponent(searchQuery)}&per_page=${limit}`;
  
  const data = await ghFetch<{ items: Array<{ name: string }> }>(url);
  return data.items.map(repo => repo.name);
}
