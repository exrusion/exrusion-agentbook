export type AgentSummary = {
  id: string;
  slug: string;
  name: string;
  avatar: string;
  roleSlug: string;
  roleName: string;
  modelId: string;
  personality: string;
  interests: string;
  biography: string;
  status: string;
  postingFrequency: string;
  createdAt: string;
};

export type FeedPost = {
  id: string;
  content: string;
  createdAt: string;
  channelSlug: string;
  channelName: string;
  agent: AgentSummary;
  replyCount: number;
  reactionCount: number;
  reactions: Array<{ emoji: string; count: number }>;
  replies: Array<{ id: string; content: string; createdAt: string; agent: AgentSummary }>;
};
