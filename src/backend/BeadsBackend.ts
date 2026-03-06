export interface BeadsIssue {
  id: string;
  title: string;
  description?: string;
  design?: string;
  acceptance_criteria?: string;
  notes?: string;
  status: string;
  priority: number;
  issue_type?: string;
  assignee?: string;
  labels?: string[];
  estimated_minutes?: number;
  external_ref?: string;
  created_at?: string;
  updated_at?: string;
  closed_at?: string;
  dependencies?: Array<Record<string, unknown>>;
  dependents?: Array<Record<string, unknown>>;
  comments?: Array<{ id: number; author: string; text: string; created_at: string }>;
}

export interface CreateIssueArgs {
  title: string;
  issue_type?: string;
  priority?: number;
  description?: string;
  design?: string;
  acceptance_criteria?: string;
  assignee?: string;
  labels?: string[];
}

export interface UpdateIssueArgs {
  id: string;
  title?: string;
  type?: string;
  issue_type?: string;
  description?: string;
  design?: string;
  acceptance_criteria?: string;
  notes?: string;
  status?: string;
  priority?: number;
  assignee?: string;
  external_ref?: string;
  estimated_minutes?: number;
  estimate?: number;
  add_labels?: string[];
  remove_labels?: string[];
  set_labels?: string[];
}

export interface CloseIssueArgs {
  id: string;
  reason?: string;
}

export interface DependencyArgs {
  from_id: string;
  to_id: string;
  dep_type?: string;
}

export interface AddCommentArgs {
  id: string;
  author?: string;
  text: string;
}

export interface BackendCompatibility {
  supported: boolean;
  detectedVersion?: string;
  minimumVersion: string;
  message: string;
}

export interface BeadsBackend {
  checkCompatibility(): Promise<BackendCompatibility>;
  info(): Promise<Record<string, unknown>>;
  list(): Promise<BeadsIssue[]>;
  show(id: string): Promise<BeadsIssue | null>;
  create(args: CreateIssueArgs): Promise<BeadsIssue>;
  update(args: UpdateIssueArgs): Promise<BeadsIssue>;
  close(args: CloseIssueArgs): Promise<BeadsIssue>;
  addDependency(args: DependencyArgs): Promise<void>;
  removeDependency(args: DependencyArgs): Promise<void>;
  listComments(id: string): Promise<Array<{ id: number; author: string; text: string; created_at: string }>>;
  addComment(args: AddCommentArgs): Promise<void>;
}
