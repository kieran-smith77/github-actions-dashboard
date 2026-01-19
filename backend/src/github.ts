export interface Repository {
  name: string;
  full_name: string;
  default_branch: string;
}

export interface OrgRepository {
  name: string;
  description: string | null;
  updated_at: string;
  private: boolean;
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

export async function fetchOrgRepositories(): Promise<OrgRepository[]> {
  const owner = getOwner();
  let repositories: OrgRepository[] = [];
  let page = 1;
  const maxRepos = 500; // Limit to 500 most recently updated repos for performance

  while (repositories.length < maxRepos) {
    const url = `${API_BASE}/orgs/${owner}/repos?per_page=100&page=${page}&sort=updated&direction=desc`;
    const data = await ghFetch<any[]>(url);

    if (data.length === 0) {
      break;
    }

    // Map to only the fields we need
    const mapped = data.map(repo => ({
      name: repo.name,
      description: repo.description,
      updated_at: repo.updated_at,
      private: repo.private
    }));

    repositories.push(...mapped);
    page++;

    // If we got less than 100, we've reached the end
    if (data.length < 100) {
      break;
    }
  }

  // Trim to max if we exceeded it
  return repositories.slice(0, maxRepos);
}
