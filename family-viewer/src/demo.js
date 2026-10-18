// Fictional, deliberately small example. The same real GEDCOM parser reads it.
export const DEMO_ROOT = '@I1@';
const persons = [
  { id:1, given:'תמר', surname:'לוין', sex:'F', birth:'12 MAY 1985', place:'תל אביב, ישראל', occupation:'אדריכלית', parents:1, families:[4], notes:['גדלה בתל אביב, בבית שתמיד היה פתוח למשפחה. אוהבת עיצוב, טיולים וסיפורים של פעם.','בכל יום שישי נפגשת המשפחה לארוחה משותפת — מסורת שעוברת כבר שלושה דורות.'], residence:'רמת גן, ישראל', sources:[1,2] },
  { id:2, given:'דוד', surname:'לוין', sex:'M', birth:'8 MAR 1954', place:'חיפה, ישראל', occupation:'מהנדס בניין', parents:2, families:[1], notes:['נולד בחיפה ועבר לתל אביב בתחילת שנות השבעים. אספן נלהב של תמונות וסיפורים משפחתיים.'] },
  { id:3, given:'רחל', surname:'לוין', sex:'F', birth:'21 JUL 1957', place:'ירושלים, ישראל', occupation:'מורה לספרות', parents:3, families:[1], alternate:'רחל /שפירא/', notes:['לבית שפירא. לימדה ספרות במשך שלושים שנה והעבירה לילדיה את האהבה לקריאה.'] },
  { id:4, given:'אורי', surname:'לוין', sex:'M', birth:'5 FEB 1981', place:'תל אביב, ישראל', parents:1, families:[5], occupation:'רופא ילדים' },
  { id:5, given:'יעל', surname:'לוין', sex:'F', birth:'19 NOV 1988', place:'תל אביב, ישראל', parents:1, families:[6], occupation:'מעצבת גרפית' },
  { id:6, given:'איתי', surname:'כהן', sex:'M', birth:'3 SEP 1983', place:'רמת גן, ישראל', parents:7, families:[4], occupation:'מפתח תוכנה' },
  { id:7, given:'נועה', surname:'כהן', sex:'F', birth:'17 JUN 2011', place:'תל אביב, ישראל', parents:4 },
  { id:8, given:'יואב', surname:'כהן', sex:'M', birth:'4 DEC 2014', place:'רמת גן, ישראל', parents:4 },
  { id:9, given:'מאיה', surname:'כהן', sex:'F', birth:'26 APR 2018', place:'רמת גן, ישראל', parents:4 },
  { id:10, given:'יוסף', surname:'לוין', sex:'M', birth:'14 OCT 1923', place:'ורשה, פולין', death:'6 JAN 2002', deathPlace:'חיפה, ישראל', parents:8, families:[2], immigration:'1948', notes:['עלה לישראל בשנת 1948 והשתקע בחיפה. פתח בית מלאכה קטן לנגרות.'] },
  { id:11, given:'מרים', surname:'לוין', sex:'F', birth:'2 FEB 1928', place:'קרקוב, פולין', death:'18 AUG 2011', deathPlace:'חיפה, ישראל', parents:9, families:[2], alternate:'מרים /רוזן/', immigration:'1949' },
  { id:12, given:'משה', surname:'שפירא', sex:'M', birth:'11 MAY 1930', place:'ירושלים, ישראל', death:'3 MAR 2016', deathPlace:'ירושלים, ישראל', families:[3] },
  { id:13, given:'לאה', surname:'שפירא', sex:'F', birth:'7 SEP 1932', place:'פתח תקווה, ישראל', death:'29 NOV 2020', deathPlace:'ירושלים, ישראל', families:[3] },
  { id:14, given:'שרה', surname:'בן דוד', sex:'F', birth:'24 JAN 1982', place:'הרצליה, ישראל', families:[5] },
  { id:15, given:'דניאל', surname:'ברק', sex:'M', birth:'15 AUG 1986', place:'חולון, ישראל', families:[6] },
  { id:16, given:'איתן', surname:'לוין', sex:'M', birth:'9 SEP 2010', place:'תל אביב, ישראל', parents:5 },
  { id:17, given:'יובל', surname:'לוין', sex:'F', birth:'13 JUL 2013', place:'תל אביב, ישראל', parents:5 },
  { id:18, given:'שירה', surname:'ברק', sex:'F', birth:'2 MAR 2017', place:'חולון, ישראל', parents:6 },
  { id:19, given:'אפרים', surname:'כהן', sex:'M', birth:'18 FEB 1955', place:'רמת גן, ישראל', families:[7] },
  { id:20, given:'ענת', surname:'כהן', sex:'F', birth:'30 OCT 1958', place:'רחובות, ישראל', families:[7] },
  { id:21, given:'שלמה', surname:'לוין', sex:'M', birth:'ABT 1897', place:'ורשה, פולין', death:'1971', families:[8] },
  { id:22, given:'רבקה', surname:'לוין', sex:'F', birth:'1900', place:'לודז׳, פולין', death:'1980', families:[8] },
  { id:23, given:'אברהם', surname:'רוזן', sex:'M', birth:'1902', place:'קרקוב, פולין', death:'1978', families:[9] },
  { id:24, given:'אסתר', surname:'רוזן', sex:'F', birth:'1905', place:'לבוב, אוקראינה', death:'1986', families:[9] },
];
const families = [
  {id:1, husband:2, wife:3, children:[4,1,5], date:'20 JUN 1979', place:'תל אביב, ישראל'},
  {id:2, husband:10, wife:11, children:[2], date:'1951', place:'חיפה, ישראל'},
  {id:3, husband:12, wife:13, children:[3], date:'1955', place:'ירושלים, ישראל'},
  {id:4, husband:6, wife:1, children:[7,8,9], date:'18 SEP 2009', place:'קיסריה, ישראל', source:2},
  {id:5, husband:4, wife:14, children:[16,17], date:'2008', place:'הרצליה, ישראל'},
  {id:6, husband:15, wife:5, children:[18], date:'2015', place:'תל אביב, ישראל'},
  {id:7, husband:19, wife:20, children:[6], date:'1980', place:'רמת גן, ישראל'},
  {id:8, husband:21, wife:22, children:[10], date:'1921', place:'ורשה, פולין'},
  {id:9, husband:23, wife:24, children:[11], date:'1926', place:'קרקוב, פולין'},
];
const lines = ['0 HEAD','1 SOUR ANAFIM-DEMO','2 NAME ענפים — משפחה לדוגמה','1 GEDC','2 VERS 5.5.1','2 FORM LINEAGE-LINKED','1 CHAR UTF-8','1 FILE משפחת-לוין.ged','1 NOTE כל האנשים והסיפורים בקובץ זה הם נתוני הדגמה בדויים.'];
for (const p of persons) {
  lines.push(`0 @I${p.id}@ INDI`, `1 NAME ${p.given} /${p.surname}/`, `2 GIVN ${p.given}`, `2 SURN ${p.surname}`, `1 SEX ${p.sex}`, '1 BIRT', `2 DATE ${p.birth}`, `2 PLAC ${p.place}`);
  if (p.alternate) lines.push(`1 NAME ${p.alternate}`, '2 TYPE birth');
  if (p.death) lines.push('1 DEAT', `2 DATE ${p.death}`, ...(p.deathPlace ? [`2 PLAC ${p.deathPlace}`] : []));
  if (p.occupation) lines.push(`1 OCCU ${p.occupation}`);
  if (p.residence) lines.push('1 RESI', `2 PLAC ${p.residence}`);
  if (p.immigration) lines.push('1 IMMI', `2 DATE ${p.immigration}`, '2 PLAC ישראל');
  if (p.parents) lines.push(`1 FAMC @F${p.parents}@`);
  for (const f of p.families || []) lines.push(`1 FAMS @F${f}@`);
  for (const n of p.notes || []) lines.push(`1 NOTE ${n}`);
  for (const source of p.sources || []) lines.push(`1 SOUR @S${source}@`, '2 PAGE רשומה לדוגמה');
}
for (const f of families) {
  lines.push(`0 @F${f.id}@ FAM`, `1 HUSB @I${f.husband}@`, `1 WIFE @I${f.wife}@`);
  for (const c of f.children) lines.push(`1 CHIL @I${c}@`);
  if (f.date) lines.push('1 MARR', `2 DATE ${f.date}`, `2 PLAC ${f.place}`);
  if (f.source) lines.push(`2 SOUR @S${f.source}@`, '3 PAGE אירוע נישואים לדוגמה');
}
lines.push('0 @S1@ SOUR','1 TITL אלבום משפחת לוין — נתוני הדגמה','1 AUTH ארכיון המשפחה (בדוי)','1 PUBL מקור בדוי להמחשת אופן הצגת מקורות בלבד','0 @S2@ SOUR','1 TITL ספר הסיפורים המשפחתי — נתוני הדגמה','1 AUTH משפחת לוין (בדויה)','1 PUBL מקור בדוי לצורכי הדגמה בלבד','0 TRLR');
export const DEMO_TEXT = lines.join('\n');
