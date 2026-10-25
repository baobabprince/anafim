#!/usr/bin/env python3
from pathlib import Path
import re

# --- CloudAccess.jsx ---
p = Path('family-viewer/src/CloudAccess.jsx')
t = p.read_text()
repls = [
(
"const stateLabel=!config?'ענן לא הוגדר':!cloudEnvironment()?'נדרש אתר HTTPS':!user?'שמירה מוצפנת בענן':phase==='loading'?'בודקים את הכספת':phase==='ready'?(error?'הכספת פתוחה · נדרשת בדיקה':auto?'סנכרון מוצפן פעיל':'כספת פתוחה · סנכרון ידני'):phase==='choice'||phase==='conflict'?'נדרשת בחירת גרסה':unlocked?'כספת פתוחה':'הכספת נעולה';",
"const stateLabel=!config?'סנכרון לא זמין':!cloudEnvironment()?'נדרש HTTPS':!user?'סנכרון בין מכשירים':phase==='loading'?'בודקים…':phase==='ready'?(error?'פתוח · יש לבדוק':auto?'מסונכרן':'פתוח'):phase==='choice'||phase==='conflict'?'בחירת גרסה':unlocked?'פתוח':'נעול';",
),
(
"{!config?'Google · Passkey · הצפנה מקצה לקצה':user?user.email:'הצפנה במכשיר לפני העלאה · בחירה שלכם'}",
"{!config?'אופציונלי':user?(user.email||'מחוברים'):'Google + סיסמת כספת'}",
),
(
"{user?'ניהול הכספת':config?'כניסה עם Google':'חשבון וענן'}",
"{user?'הגדרות סנכרון':config?'התחברות':'סנכרון'}",
),
(
'<Dialog title="הכספת המשפחתית" subtitle="חשבון אחד. המכשירים שלכם. מפתח שנשאר אצלכם." onClose={close} className="cloud-dialog">',
'<Dialog title="סנכרון בין מכשירים" subtitle="אופציונלי. שומר עותק מוצפן בענן — רק אתם יכולים לפתוח." onClose={close} className="cloud-dialog">',
),
(
'<div className="cloud-security-note"><ShieldCheck size={19}/><p><strong>Google מזהה את החשבון — אינו מפתח ההצפנה.</strong> האילן, שמות הקבצים והמידע המשפחתי מוצפנים במכשיר. לענן נשלחים עותק מוצפן ומטא־דאטה תפעוליים בלבד.</p></div>',
'<div className="cloud-security-note"><ShieldCheck size={19}/><p>התחברות עם Google לזיהוי בלבד. ההצפנה נעשית במכשיר שלכם עם סיסמת הכספת.</p></div>',
),
(
'aria-label="חשבון וסנכרון מוצפן"',
'aria-label="סנכרון אופציונלי"',
),
(
'className="cloud-entry"',
'className="cloud-entry cloud-entry-quiet"',
),
(
'<h3>יוצרים כספת שרק אתם יכולים לפתוח</h3><p>מפתח אקראי יצפין את האילן במכשיר. סיסמת הכספת (לא סיסמת Google) תפתח אותו בכל מכשיר. אחר כך תשמרו מפתח שחזור פרטי. לא נעלה דבר לפני אישור השחזור.</p>',
'<h3>סיסמת כספת</h3><p>בחרו סיסמה לכספת (לא סיסמת Google). אחר כך יוצג מפתח שחזור לשמירה — בלי זה לא נעלה כלום.</p>',
),
(
'<h3>הנתונים בענן מוצפנים</h3><p>גרסה {head?.generation} · {dateLabel(head?.updated_at)}. פתחו עם סיסמת הכספת, Passkey (אם נרשם) או מפתח השחזור.</p>',
'<h3>פתיחת הכספת</h3><p>גרסה {head?.generation} · {dateLabel(head?.updated_at)}</p>',
),
]
for a,b in repls:
    if a not in t:
        raise SystemExit(f'missing CloudAccess snippet: {a[:60]!r}')
    t = t.replace(a,b,1)
p.write_text(t)
print('CloudAccess ok')

# --- App.jsx: move below privacy ---
app = Path('family-viewer/src/App.jsx')
at = app.read_text()
old = '''        <div className="sidebar-cloud">
          <CloudAccess Dialog={Dialog} bundle={bundle} selectedId={person.id} onApplySnapshot={applyCloudSnapshot} onClear={clearCloudView} onUpload={()=>setModal('upload')} isModalOpen={!!modal||mobileMenu}/>
        </div>
        <div className="sidebar-privacy"><ShieldCheck size={14}/><span>המשפחה שלכם. לעיניים שלכם.</span></div>'''
new = '''        <div className="sidebar-privacy"><ShieldCheck size={14}/><span>המשפחה שלכם. לעיניים שלכם.</span></div>
        <div className="sidebar-cloud sidebar-cloud-secondary">
          <CloudAccess Dialog={Dialog} bundle={bundle} selectedId={person.id} onApplySnapshot={applyCloudSnapshot} onClear={clearCloudView} onUpload={()=>setModal('upload')} isModalOpen={!!modal||mobileMenu}/>
        </div>'''
if old not in at:
    raise SystemExit('App block missing')
app.write_text(at.replace(old, new, 1))
print('App ok')

# --- styles.css ---
css_path = Path('family-viewer/src/styles.css')
css = css_path.read_text()
old_css = '''.sidebar-cloud{padding:8px 12px 12px;border-top:1px solid var(--line)}
.sidebar-cloud .cloud-strip{flex-direction:column;align-items:stretch;gap:8px;padding:10px;margin:0;border-radius:12px;background:#f4f1ea;border:1px solid #e2ddd2}
.sidebar-cloud .cloud-strip>div{min-width:0}
.sidebar-cloud .cloud-entry{width:100%;justify-content:center}'''
new_css = '''.sidebar-cloud{padding:6px 12px 14px;border-top:none}
.sidebar-cloud-secondary{opacity:.78;margin-top:4px}
.sidebar-cloud-secondary:hover,.sidebar-cloud-secondary:focus-within{opacity:1}
.sidebar-cloud .cloud-strip{
  flex-direction:row;align-items:center;gap:8px;
  padding:6px 8px;margin:0;border-radius:8px;
  background:transparent;border:none;
}
.sidebar-cloud .cloud-strip-symbol{display:none}
.sidebar-cloud .cloud-strip>div{min-width:0;flex:1}
.sidebar-cloud .cloud-strip strong{font-size:12px;font-weight:600;color:var(--muted, #6b6560)}
.sidebar-cloud .cloud-strip small{font-size:11px;color:var(--muted, #8a847c)}
.sidebar-cloud .cloud-entry{
  width:auto;justify-content:flex-start;
  font-size:12px;padding:4px 8px;border-radius:6px;
  background:transparent;border:1px solid transparent;color:var(--muted, #6b6560);
}
.sidebar-cloud .cloud-entry:hover{border-color:var(--line,#e2ddd2);background:#f7f5f0;color:inherit}'''
if old_css not in css:
    raise SystemExit('css block missing')
css_path.write_text(css.replace(old_css, new_css, 1))
print('css ok')
