export type ProductivityTaskPriority = "low" | "normal" | "high" | "urgent";
export type ProductivityTaskStatus = "pending" | "in_progress" | "done" | "cancelled";
export type ProductivityTaskRefType = "service_order" | "vehicle" | "module";

export type ProductivityTaskRow = {
  id: string;
  workshop_id: string;
  title: string;
  description: string;
  priority: ProductivityTaskPriority;
  status: ProductivityTaskStatus;
  requester_user_id: string | null;
  requester_name: string | null;
  assignee_user_id: string | null;
  assignee_name: string | null;
  due_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  ref_type: ProductivityTaskRefType | null;
  ref_id: string | null;
  ref_label: string | null;
  notes: string;
  created_by_user_id: string | null;
  created_by_name: string | null;
  updated_by_user_id: string | null;
  updated_by_name: string | null;
  client_request_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ProductivityTaskEventRow = {
  id: string;
  workshop_id: string;
  task_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_user_id: string | null;
  actor_name: string | null;
  note: string | null;
  meta: Record<string, unknown>;
  created_at: string;
};

export type ProductivityTaskView = {
  id: string;
  title: string;
  description: string;
  priority: ProductivityTaskPriority;
  status: ProductivityTaskStatus;
  requesterUserId: string | null;
  requesterName: string | null;
  assigneeUserId: string | null;
  assigneeName: string | null;
  dueAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  refType: ProductivityTaskRefType | null;
  refId: string | null;
  refLabel: string | null;
  notes: string;
  createdByUserId: string | null;
  createdByName: string | null;
  updatedByUserId: string | null;
  updatedByName: string | null;
  clientRequestId: string | null;
  createdAt: string;
  updatedAt: string;
  overdue: boolean;
};

export type ProductivityTaskFilters = {
  status?: ProductivityTaskStatus | ProductivityTaskStatus[] | "open" | "all";
  assigneeUserId?: string | null;
  priority?: ProductivityTaskPriority | null;
  overdueOnly?: boolean;
  q?: string | null;
  limit?: number;
};

export type ProductivityAssignablePerson = {
  id: string;
  displayName: string;
  username: string | null;
  jobTitle: string | null;
  isTechnician: boolean;
};

export type CreateProductivityTaskInput = {
  title: string;
  description?: string;
  priority?: ProductivityTaskPriority;
  assigneeUserId?: string | null;
  assigneeName?: string | null;
  dueAt?: string | null;
  refType?: ProductivityTaskRefType | null;
  refId?: string | null;
  refLabel?: string | null;
  notes?: string;
  clientRequestId?: string | null;
};

export type UpdateProductivityTaskInput = {
  title?: string;
  description?: string;
  priority?: ProductivityTaskPriority;
  status?: ProductivityTaskStatus;
  assigneeUserId?: string | null;
  assigneeName?: string | null;
  dueAt?: string | null;
  notes?: string;
  refType?: ProductivityTaskRefType | null;
  refId?: string | null;
  refLabel?: string | null;
};

export type ProductivityPendingSummary = {
  openCount: number;
  overdueCount: number;
  dueSoonCount: number;
  doneLast7d: number;
  byAssignee: Array<{
    assigneeUserId: string | null;
    assigneeName: string | null;
    openCount: number;
    overdueCount: number;
  }>;
  topOverdue: ProductivityTaskView[];
};
