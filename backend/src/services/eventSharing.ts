// Audience resolution for hosted_events (spec §14.3-§14.4). Independent of
// the recommendation engine — this is purely "who gets to see this event".

import type { SupabaseClient } from '@supabase/supabase-js';
import type { HostedEvent } from '../types/index.js';

/**
 * All hosted_events visible to userId, via any of the three audience paths
 * (ALL_CONTACTS / CONTACT / GROUP), unioned and deduped by id — spec §14.3.
 * Requires an admin-equivalent client since it crosses ownership boundaries
 * (reading other users' hosted_events/event_audience rows by design).
 */
export async function getVisibleHostedEvents(db: SupabaseClient, userId: string): Promise<HostedEvent[]> {
  const [viaAllContacts, viaContact, viaGroup] = await Promise.all([
    db.from('event_audience')
      .select('hosted_events(*), hosted_event_id')
      .eq('target_type', 'ALL_CONTACTS')
      .then(async ({ data }) => {
        if (!data?.length) return [];
        const { data: owningContacts } = await db.from('contacts').select('user_id:owner_id').eq('linked_user_id', userId);
        const ownerIds = new Set((owningContacts ?? []).map((c: any) => c.user_id));
        return data.filter((row: any) => row.hosted_events && ownerIds.has(row.hosted_events.owner_user_id)).map((row: any) => row.hosted_events);
      }),
    db.from('event_audience')
      .select('hosted_events(*), contacts!event_audience_target_contact_id_fkey(linked_user_id)')
      .eq('target_type', 'CONTACT')
      .then(({ data }) => (data ?? []).filter((row: any) => row.contacts?.linked_user_id === userId).map((row: any) => row.hosted_events)),
    db.from('event_audience')
      .select('hosted_events(*), groups!event_audience_target_group_id_fkey(id, group_members(user_id, status))')
      .eq('target_type', 'GROUP')
      .then(({ data }) => (data ?? [])
        .filter((row: any) => (row.groups?.group_members ?? []).some((m: any) => m.user_id === userId && m.status === 'MEMBER'))
        .map((row: any) => row.hosted_events)),
  ]);

  const byId = new Map<string, HostedEvent>();
  for (const ev of [...viaAllContacts, ...viaContact, ...viaGroup]) {
    if (ev) byId.set(ev.id, ev);
  }
  return [...byId.values()];
}

/**
 * spec §14.4 reachability — a person can only be an event/group target if
 * they're reachable in-app: a contact must have linked_user_id populated.
 */
export async function assertContactReachable(db: SupabaseClient, contactId: string, ownerUserId: string): Promise<string> {
  const { data: contact, error } = await db.from('contacts').select('linked_user_id, owner_id').eq('id', contactId).single();
  if (error || !contact) throw new Error('Contact not found');
  if (contact.owner_id !== ownerUserId) throw new Error('Not your contact');
  if (!contact.linked_user_id) throw new Error('Contact is not linked to a registered user — not reachable for sharing');
  return contact.linked_user_id;
}
