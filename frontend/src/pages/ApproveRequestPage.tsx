import { useSearchParams, useNavigate } from 'react-router-dom';

export default function ApproveRequestPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const result = params.get('result');
  const error  = params.get('error');

  if (error) {
    const msg = error === 'notfound'
      ? 'הבקשה לא נמצאה — ייתכן שכבר טופלה או שהקישור פג תוקף.'
      : 'אירעה שגיאה בטיפול בבקשה. נסה שוב מהאפליקציה.';
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1>🎁 Giftly</h1>
          <p className="error" style={{ fontSize: '1rem' }}>{msg}</p>
          <button onClick={() => navigate('/')}>לדף הבית</button>
        </div>
      </div>
    );
  }

  if (result === 'approved') {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1>🎁 Giftly</h1>
          <h2 style={{ color: '#16a34a' }}>✅ הבקשה אושרה!</h2>
          <p style={{ color: '#555', fontSize: '0.95rem' }}>
            האיש קשר נוסף לרשימה שלהם. הם יוכלו כעת לקבל המלצות מתנה עבורך.
          </p>
          <button onClick={() => navigate('/')}>לדשבורד שלי</button>
        </div>
      </div>
    );
  }

  if (result === 'rejected') {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1>🎁 Giftly</h1>
          <h2 style={{ color: '#dc2626' }}>❌ הבקשה נדחתה</h2>
          <p style={{ color: '#555', fontSize: '0.95rem' }}>
            הבקשה נדחתה בהצלחה. לא יישמר עליך שום מידע אצלם.
          </p>
          <button onClick={() => navigate('/')}>לדשבורד שלי</button>
        </div>
      </div>
    );
  }

  // ללא result — המשתמש הגיע לדף ישירות
  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>🎁 Giftly</h1>
        <p style={{ color: '#555' }}>הגעת לדף זה בטעות. השתמש בקישור שנשלח אליך במייל.</p>
        <button onClick={() => navigate('/')}>לדף הבית</button>
      </div>
    </div>
  );
}
