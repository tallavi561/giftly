import { supabase } from './supabase.js';
import { Logger } from './logger.js';

const logger = new Logger('api');

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

// In dev, Vite proxies /api to localhost:3001 (see vite.config.ts), so a
// relative path works. In production the frontend and backend are separate
// deployments, so VITE_API_URL must point at the backend's own origin.
const API_BASE = import.meta.env.VITE_API_URL ?? '';

async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/api${path}`, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    logger.error(`${options.method ?? 'GET'} ${path} failed`, err);
    throw new ApiError(err.error || 'Request failed', res.status);
  }
  if (res.status === 204) return null as T;
  try {
    return await res.json();
  } catch (e) {
    // Empty/truncated body despite a 2xx status — typically a Render free-tier
    // cold start dropping the connection mid-response. Surface a retryable
    // message instead of the raw "Unexpected end of JSON input" exception.
    logger.error(`${options.method ?? 'GET'} ${path} returned an invalid response body`, e);
    throw new Error('החיבור לשרת נכשל, נסה שוב בעוד כמה שניות');
  }
}

export const api = {
  userProfile: {
    me: () => request<any>('/user-profile/me'),
    create: (body: object) => request<any>('/user-profile', { method: 'POST', body: JSON.stringify(body) }),
    update: (body: object) => request<any>('/user-profile', { method: 'PATCH', body: JSON.stringify(body) }),
    search: (q: string) => request<any[]>(`/user-profile/search?q=${encodeURIComponent(q)}`),
  },
  contacts: {
    list: () => request<any[]>('/contacts'),
    get: (id: string) => request<any>(`/contacts/${id}`),
    create: (body: object) => request<any>('/contacts', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: object) => request<any>(`/contacts/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    delete: (id: string) => request<null>(`/contacts/${id}`, { method: 'DELETE' }),
  },
  events: {
    list: (contactId?: string) => request<any[]>(`/events${contactId ? `?contact_id=${contactId}` : ''}`),
    create: (body: object) => request<any>('/events', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: object) => request<any>(`/events/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    delete: (id: string) => request<null>(`/events/${id}`, { method: 'DELETE' }),
  },
  gifts: {
    list: (contactId?: string) => request<any[]>(`/gifts${contactId ? `?contact_id=${contactId}` : ''}`),
    create: (body: object) => request<any>('/gifts', { method: 'POST', body: JSON.stringify(body) }),
    delete: (id: string) => request<null>(`/gifts/${id}`, { method: 'DELETE' }),
  },
  recommendations: {
    generate: (body: object) => request<any>('/recommendations', { method: 'POST', body: JSON.stringify(body) }),
    list: (contactId?: string, eventId?: string) => {
      const params = new URLSearchParams();
      if (contactId) params.set('contact_id', contactId);
      if (eventId) params.set('event_id', eventId);
      return request<any[]>(`/recommendations?${params}`);
    },
    searchMore: (contactId: string, batchId: string) =>
      request<{ done: boolean; reason?: string; items: any[] }>('/recommendations/search-more', {
        method: 'POST', body: JSON.stringify({ contact_id: contactId, batch_id: batchId }),
      }),
    rate: (id: string, fit: 'FIT' | 'NOT_FIT') =>
      request<any>(`/recommendations/${id}/rate`, { method: 'PATCH', body: JSON.stringify({ fit }) }),
  },
  selfRecommendations: {
    list: () => request<any[]>('/self-recommendations'),
    // feedback_reason is required by the backend whenever rating <= 3 (spec §7.1)
    rate: (id: string, rating: number, feedbackReason?: string) =>
      request<any>(`/self-recommendations/${id}/rate`, { method: 'PATCH', body: JSON.stringify({ rating, feedback_reason: feedbackReason }) }),
    generate: () => request<any>('/self-recommendations/generate', { method: 'POST' }),
  },
  contactRequests: {
    incoming: () => request<any[]>('/contact-requests/incoming'),
    outgoing: () => request<any[]>('/contact-requests/outgoing'),
    approve: (id: string, contactName: string, relationship: string | null) =>
      request<any>(`/contact-requests/${id}/approve`, {
        method: 'POST',
        body: JSON.stringify({ contact_name: contactName, relationship }),
      }),
    reject: (id: string) => request<null>(`/contact-requests/${id}/reject`, { method: 'POST' }),
  },
};
