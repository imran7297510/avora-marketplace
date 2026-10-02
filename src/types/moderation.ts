export interface Report {
  id: string;
  listingId: string;
  reporterId: string;
  reason: string;
  subcategory?: string;
  description: string;
  screenshotUrl?: string;
  isAnonymous: boolean;
  status: 'OPEN' | 'UNDER_REVIEW' | 'RESOLVED' | 'DISMISSED';
  riskScore: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ModerationLog {
  id: string;
  reportId: string;
  moderatorId: string;
  action: string;
  reason: string;
  timestamp: Date;
}
