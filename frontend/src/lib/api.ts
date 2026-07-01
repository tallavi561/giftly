import { supabase } from './supabase.js';
import { Logger } from './logger.js';

const logger = new Logger('api');

async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = await authHeaders();
  const res = await fetch(`/api${path}`, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    logger.error(`${options.method ?? 'GET'} ${path} failed`, err);
    throw new Error(err.error || 'Request failed');
  }
  if (res.status === 204) return null as T;
  return res.json();
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
    generate: (body: object) => request<any[]>('/recommendations', { method: 'POST', body: JSON.stringify(body) }),
    list: (contactId?: string, eventId?: string) => {
      const params = new URLSearchParams();
      if (contactId) params.set('contact_id', contactId);
      if (eventId) params.set('event_id', eventId);
      return request<any[]>(`/recommendations?${params}`);
    },
  },
};
