export interface User {
  id: string;
  walletAddress: string;
  username: string;
  email?: string;
  bio?: string;
  avatarUrl?: string;
  role: "CLIENT" | "FREELANCER";
  twoFactorEnabled?: boolean;
  skills?: string[];
  averageRating?: number;
  reviewCount?: number;
}

export interface Milestone {
  id: string;
  jobId: string;
  title: string;
  description: string;
  amount: number;
  status: "PENDING" | "IN_PROGRESS" | "SUBMITTED" | "APPROVED" | "REJECTED";
  order: number;
  onChainIndex?: number;
  contractDeadline?: string;
}

export interface RevisionProposalMilestone {
  id: number;
  description: string;
  amountStroops: string;
  deadline: number;
  status: string;
}

export interface RevisionProposal {
  proposer: string;
  status: "PENDING" | "ACCEPTED" | "REJECTED";
  newTotalStroops: string;
  milestones: RevisionProposalMilestone[];
  createdAt: number;
}

export interface Job {
  id: string;
  title: string;
  description: string;
  budget: number;
  category: string;
  skills: string[];
  deadline: string;
  status: "OPEN" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED" | "DISPUTED";
  client: User;
  freelancer?: User;
  milestones: Milestone[];
  contractJobId?: string;
  escrowStatus: "UNFUNDED" | "FUNDED" | "COMPLETED" | "CANCELLED" | "DISPUTED";
  revisionProposal?: RevisionProposal | null;
  createdAt: string;
  _count?: { applications: number };
}

export interface RecommendedJob extends Job {
  relevanceScore: number;
}

export interface Application {
  id: string;
  jobId: string;
  freelancerId: string;
  proposal: string;
  bidAmount: number;
  estimatedDuration: string;
  status: "PENDING" | "ACCEPTED" | "REJECTED";
  freelancer: User;
  createdAt: string;
}

export interface ServiceListing {
  id: string;
  title: string;
  description: string;
  price: number;
  category: string;
  freelancerId: string;
  freelancer: User;
  skills: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  senderId: string;
  receiverId: string;
  content: string;
  read: boolean;
  createdAt: string;
  sender: User;
}

export interface Review {
  id: string;
  jobId: string;
  reviewerId: string;
  revieweeId: string;
  rating: number;
  comment: string;
  reviewer: User;
  createdAt: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  totalPages: number;
}

export interface UserProfile extends User {
  reviewsReceived: Review[];
  clientJobs: Job[];
  freelancerJobs: Job[];
  averageRating: number;
  reviewCount: number;
  services: ServiceListing[];
  createdAt: string;
}

export interface Conversation {
  id: string;
  otherUser: User;
  job: { id: string; title: string } | null;
  lastMessage: Message;
  unreadCount: number;
}

export type NotificationType =
  | "JOB_APPLIED"
  | "APPLICATION_ACCEPTED"
  | "MILESTONE_SUBMITTED"
  | "MILESTONE_APPROVED"
  | "DISPUTE_RAISED"
  | "DISPUTE_RESOLVED"
  | "NEW_MESSAGE";

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface Vote {
  id: string;
  disputeId: string;
  voterId: string;
  choice: "CLIENT" | "FREELANCER";
  reason: string;
  createdAt: string;
  voter: User;
}

export interface Dispute {
  id: string;
  jobId: string;
  contractDisputeId?: string;
  initiatorId: string;
  respondentId: string;
  reason: string;
  status: "OPEN" | "VOTING" | "RESOLVED_CLIENT" | "RESOLVED_FREELANCER";
  votesForClient: number;
  votesForFreelancer: number;
  minVotes: number;
  createdAt: string;
  updatedAt: string;
  job: Job;
  initiator: User;
  respondent: User;
  votes: Vote[];
}
