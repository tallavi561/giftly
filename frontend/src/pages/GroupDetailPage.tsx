import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { Logger } from '../lib/logger.js';
import type { Contact } from '../types/index.js';

const logger = new Logger('GroupDetailPage');

interface GroupDetail { id: string; name: string; role: 'owner' | 'member' }
interface MemberRow {
  id: string; user_id: string; status: 'INVITED' | 'MEMBER' | 'DECLINED';
  user_profiles: { display_name: string; nickname: string } | null;
}

const STATUS_LABEL: Record<MemberRow['status'], string> = { MEMBER: 'חבר', INVITED: 'ממתין לאישור', DECLINED: 'דחה' };

// Group detail — spec §9.2 in Specs/Front/FRONTEND_SPEC2.md.
export default function GroupDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [copying, setCopying] = useState(false);

  useEffect(() => {
    if (!id) return;
    Promise.all([api.groups.get(id), api.groups.members(id)]).then(([g, m]) => {
      setGroup(g);
      setMembers(m);
      setLoading(false);
    }).catch(err => { logger.error('Load group failed', err); setLoading(false); });
  }, [id]);

  function reloadMembers() {
    if (!id) return;
    api.groups.members(id).then(setMembers).catch(err => logger.error('Reload members failed', err));
  }

  function openInvite() {
    api.contacts.list().then(setContacts).catch(err => logger.error('Load contacts failed', err));
    setShowInvite(true);
  }

  async function inviteContact(contactId: string) {
    if (!id) return;
    try {
      await api.groups.invite(id, contactId);
      setShowInvite(false);
      reloadMembers();
    } catch (err) {
      alert((err as Error).message);
    }
  }

  async function copyInviteLink() {
    if (!id) return;
    setCopying(true);
    try {
      const link = await api.groups.inviteLink(id);
      const url = `${window.location.origin}/join/${link.token}`;
      await navigator.clipboard.writeText(url);
      alert('קישור ההזמנה הועתק');
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setCopying(false);
    }
  }

  if (loading) return <div className="loading">טוען...</div>;
  if (!group) return <div className="empty-state"><span className="material-symbols-outlined">error</span>קבוצה לא נמצאה</div>;

  const memberUserIds = new Set(members.map(m => m.user_id));
  const linkedInvitableContacts = contacts.filter(c => c.linked_user_id && !memberUserIds.has(c.linked_user_id));
  const isOwner = group.role === 'owner';
  const visibleMembers = isOwner ? members : members.filter(m => m.status === 'MEMBER');

  return (
    <>
      <div className="contact-page-header">
        <button className="icon-btn" onClick={() => navigate(-1)} title="חזרה">
          <span className="material-symbols-outlined">chevron_right</span>
        </button>
      </div>

      <div className="page-heading" style={{ marginBottom: 0 }}>
        <h1 style={{ fontSize: 28 }}>{group.name}</h1>
        <p>{visibleMembers.length} חברים</p>
      </div>

      {isOwner && (
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button className="btn-filled" onClick={openInvite}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>person_add</span>
            הזמן איש קשר
          </button>
          <button className="btn-tonal" onClick={copyInviteLink} disabled={copying}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>link</span>
            {copying ? '...' : 'העתק קישור הזמנה'}
          </button>
        </div>
      )}

      <div className="contacts-list" style={{ marginTop: 20 }}>
        {visibleMembers.map(m => (
          <div key={m.id} className="contact-list-item" style={{ cursor: 'default' }}>
            <div className="contact-list-main">
              <div className="contact-list-avatar" style={{ background: 'var(--secondary-container)', color: 'var(--on-secondary-container)' }}>
                {(m.user_profiles?.display_name ?? '?').trim().charAt(0)}
              </div>
              <h3 className="contact-list-name">{m.user_profiles?.display_name ?? 'משתמש'}</h3>
            </div>
            <span className="contact-list-badge">{STATUS_LABEL[m.status]}</span>
          </div>
        ))}
      </div>

      {showInvite && (
        <div className="modal-overlay" onClick={() => setShowInvite(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h3>
              <span className="material-symbols-outlined" style={{ color: 'var(--primary)', marginLeft: 8, fontSize: 22 }}>person_add</span>
              הזמנת איש קשר
            </h3>
            {linkedInvitableContacts.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--on-surface-variant)' }}>
                רק אנשי קשר עם פרופיל מקושר ניתן להזמין לקבוצה — ואין לך כאלה עדיין (או שכולם כבר בקבוצה).
              </p>
            ) : (
              <div className="search-results-list">
                {linkedInvitableContacts.map(c => (
                  <div key={c.id} className="search-result-item" onClick={() => inviteContact(c.id)}>
                    <strong>{(c.user_profile as any)?.display_name ?? c.name}</strong>
                    <span>{c.relationship || ''}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="form-row-btns">
              <button type="button" className="btn-surface" onClick={() => setShowInvite(false)}>סגור</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
