import 'server-only';
import { z } from 'zod';
import type { ApiClient } from '@/lib/api/client';
import { apiPath } from '@/lib/api/path';
import type { Activity, DashboardSummary, ReadingStatistics } from '@/lib/dashboard/types';
import { activitySchema, statisticsSchema, summarySchema } from './dashboard-schemas';

/** The three read-only dashboard endpoints. Every number is computed by the API on each request. */
export function getSummary(api: ApiClient, asOf?: string): Promise<DashboardSummary> {
  return api.get(apiPath`/dashboard/summary`, {
    query: { asOf },
    parse: (data) => summarySchema.parse(data),
  });
}

export function getReadingStatistics(api: ApiClient): Promise<ReadingStatistics> {
  return api.get(apiPath`/dashboard/reading-statistics`, {
    parse: (data) => statisticsSchema.parse(data),
  });
}

/** The newest recorded resources (1–20, default 10), in the API's order. */
export function getRecentActivity(api: ApiClient, limit = 10): Promise<Activity[]> {
  return api.get(apiPath`/dashboard/recent-activity`, {
    query: { limit },
    parse: (data) => z.array(activitySchema).max(20).parse(data),
  });
}
