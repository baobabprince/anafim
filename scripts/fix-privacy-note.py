#!/usr/bin/env python3
from pathlib import Path
p = Path('family-viewer/src/App.jsx')
t = p.read_text()
old = '<h3>פרטיות</h3>\n          <p>הפענוח מתבצע בדפדפן. במצב מקומי הקובץ לא נשלח לשרת.</p>'
new = '<h3>פרטיות</h3>\n          <p>הפענוח תמיד בדפדפן. במצב מקומי הקובץ נשאר אצלכם. אם מפעילים סנכרון — לענן עולה רק עותק מוצפן, בלי מפתח הפענוח.</p>'
if old not in t:
    # try single-line variants
    old2 = 'הפענוח מתבצע בדפדפן. במצב מקומי הקובץ לא נשלח לשרת.'
    new2 = 'הפענוח תמיד בדפדפן. במצב מקומי הקובץ נשאר אצלכם. אם מפעילים סנכרון — לענן עולה רק עותק מוצפן, בלי מפתח הפענוח.'
    if old2 not in t:
        raise SystemExit('privacy note not found')
    t = t.replace(old2, new2, 1)
else:
    t = t.replace(old, new, 1)
p.write_text(t)
print('ok')
