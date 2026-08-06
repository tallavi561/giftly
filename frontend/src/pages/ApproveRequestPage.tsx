import { useSearchParams, useNavigate } from 'react-router-dom';

export default function ApproveRequestPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const result = params.get('result');
  const error  = params.get('error');

  let icon = 'info';
  let iconClass = '';
  let heading = '';
  let message = '';
  let buttonLabel = 'לדף הבית';

  if (error) {
    icon = 'error';
    iconClass = 'error';
    heading = 'משהו השתבש';
    message = error === 'notfound'
      ? 'הבקשה לא נמצאה — ייתכן שכבר טופלה או שהקישור פג תוקף.'
      : 'אירעה שגיאה בטיפול בבקשה. נסה שוב מהאפליקציה.';
  } else if (result === 'approved') {
    icon = 'check_circle';
    iconClass = 'success';
    heading = 'הבקשה אושרה!';
    message = 'האיש קשר נוסף לרשימה שלהם. הם יוכלו כעת לקבל המלצות מתנה עבורך.';
    buttonLabel = 'לדשבורד שלי';
  } else if (result === 'rejected') {
    icon = 'cancel';
    iconClass = 'muted';
    heading = 'הבקשה נדחתה';
    message = 'הבקשה נדחתה בהצלחה. לא יישמר עליך שום מידע אצלם.';
    buttonLabel = 'לדשבורד שלי';
  } else {
    icon = 'help';
    iconClass = 'muted';
    heading = 'הגעת לכאן בטעות';
    message = 'השתמש בקישור שנשלח אליך במייל כדי לאשר או לדחות בקשת חיבור.';
  }

  return (
    <div className="approve-root">
      <div className="approve-logo">Giftly</div>
      <main className="approve-card">
        <div className={`approve-icon ${iconClass}`}>
          <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>{icon}</span>
        </div>
        <h1>{heading}</h1>
        <p>{message}</p>
        <button className="login-submit-btn" onClick={() => navigate('/')}>{buttonLabel}</button>
        <div className="approve-footer">
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>info</span>
          הפרטיות שלך תמיד בשליטתך
        </div>
      </main>
    </div>
  );
}
