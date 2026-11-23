# שילוב הכפתור ב-FamilyExperience.jsx

ארבעה שינויים קצרים:

## 1. Import (אחרי EditPersonAiModal)

```js
import { FamilyChartDialog, FamilyChartButton } from './FamilyChartDialog.jsx';
```

## 2. State (אחרי relationshipPathOpen)

```js
const [familyChartOpen, setFamilyChartOpen] = useState(false);
```

## 3. כפתור (לפני כפתור ההדפסה ב-view-actions)

חפשו:
```jsx
<button className="text-button print-button" onClick={()=>window.print()}>
```

והוסיפו **לפניו**:
```jsx
<FamilyChartButton onClick={()=>setFamilyChartOpen(true)}/>
```

## 4. דיאלוג (לפני RelationshipPathDialog)

```jsx
{familyChartOpen && <FamilyChartDialog data={data} person={person} onClose={()=>setFamilyChartOpen(false)}/>}
```

---

### בדיקה מקומית

```bash
git checkout feature/family-chart-svg-v2
# ערכו את FamilyExperience.jsx לפי 4 הנקודות למעלה
npm run dev   # או build
```

אחרי השילוב: במבט משפחתי יופיע כפתור **תרשים משפחתי** ליד **הדפסה / PDF**.
