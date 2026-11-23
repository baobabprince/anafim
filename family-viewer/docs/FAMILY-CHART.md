# תרשים משפחתי להדפסה

## קבצים חדשים

- `src/family-chart-data.js` — בניית מבנה הנתונים מה-GEDCOM
- `src/family-chart-svg.js` — רינדור SVG + הורדה/הדפסה
- `src/FamilyChartDialog.jsx` — דיאלוג אפשרויות

## תוכן התרשים

**תמיד:** אדם נבחר, בני זוג (שורה מרכזית), אחים, ילדים, הורים, סבים (3 דורות).

**אופציות:** 4 דורות (סב-סבים), בני דודים, landscape/portrait.

## שילוב

### 1. FamilyExperience.jsx

```js
import { FamilyChartDialog, FamilyChartButton } from './FamilyChartDialog.jsx';
```

```js
const [familyChartOpen, setFamilyChartOpen] = useState(false);
```

ליד כפתור ההדפסה:

```jsx
<FamilyChartButton onClick={() => setFamilyChartOpen(true)} />
```

לפני RelationshipPathDialog:

```jsx
{familyChartOpen && (
  <FamilyChartDialog data={data} person={person} onClose={() => setFamilyChartOpen(false)} />
)}
```

### 2. i18n (he.js / en.js)

הוסיפו מפתחות `fx.chartButton`, `fx.chartTitle`, `fx.chartHint`, `fx.chartGenerations`, `fx.chartGen3`, `fx.chartGen4`, `fx.chartCousins`, `fx.chartOrientation`, `fx.chartLandscape`, `fx.chartPortrait`, `fx.chartDownloadSvg`, `fx.chartPrint`, `fx.chartError`.

ראה commit ההודעה / קוד המודולים לניסוחים המלאים.
