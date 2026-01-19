export interface Workflow {
  id: number
  name: string
  path: string
  state: string
  html_url: string
  badge_url: string
  pinned?: boolean
  latestRun?: WorkflowRun | null
}

export interface WorkflowRun {
  id: number
  name: string
  status: string
  conclusion: string | null
  run_number: number
  html_url: string
  event: string
  head_branch: string
  created_at: string
}

export type QuickFilter = 'all' | 'tf-dev' | 'tf-prd' | 'tf-all' | 'non-tf-obs'

export type Theme = 'light' | 'dark'

export interface Repository {
  name: string
  description: string | null
  updated_at: string
  private: boolean
}

export interface AutocompleteOption {
  value: string
  label: string
  description?: string
  isRecent?: boolean
}
