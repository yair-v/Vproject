# מערכת ניהול פרויקטים קטנים — גרסת Render ידנית

מערכת קלה ומהירה לניהול מספר פרויקטים במקביל, עם עד 2500 שורות לכל פרויקט, ייבוא/ייצוא Excel, רשימות בחירה עם חיפוש, וכללי סטטוס מותאמים.

הגרסה הזו **מותאמת לפריסה ידנית ב-Render**:
- Backend כ-**Web Service**
- Frontend כ-**Static Site**
- Database כ-**PostgreSQL**

הפרויקט לא תלוי ב-Blueprint.

## טכנולוגיות
- Frontend: React + Vite
- Backend: Node.js + Express
- Database: PostgreSQL

## דגשים לביצועים
- הרשימה לא נטענת מחדש אחרי כל פעולה
- הוספה / עריכה / מחיקה מעדכנות מקומית את הטבלה
- Pagination מובנה
- חיפוש עם debounce
- שליפה רק לפי פרויקט נבחר
- שדות בחירה עם חיפוש מהיר

## חוקים עסקיים
- מספר סידורי ייחודי בתוך אותו פרויקט בלבד
- אותו מספר סידורי יכול להופיע בפרויקטים שונים
- כאשר סטטוס = `בוצע`:
  - שם מתקין חובה
  - אם תאריך יעד ו/או תאריך ביצוע חסרים, המערכת ממלאת אותם אוטומטית לפי תאריך היום
- פורמט תצוגת תאריך: `DD/MM/YYYY`

## מבנה תיקיות
- `backend` — Web Service
- `frontend` — Static Site
- `DEPLOY_RENDER_MANUAL.md` — הוראות פריסה מדויקות ל-Render

## הרצה מקומית

### 1. Backend
```bash
cd backend
cp .env.example .env
npm install
npm run db:init
npm run dev
```

### 2. Frontend
```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

## הגדרות ENV

### backend/.env
```env
PORT=4000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/small_projects_system
CORS_ORIGIN=http://localhost:5173
```

### frontend/.env
```env
VITE_API_URL=http://localhost:4000
```

## פריסה ידנית ל-Render
קובץ ההוראות המלא נמצא כאן:
- `DEPLOY_RENDER_MANUAL.md`

בקיצור:
1. צור PostgreSQL ב-Render
2. צור Web Service מתוך `backend`
3. צור Static Site מתוך `frontend`
4. חבר `DATABASE_URL`, `CORS_ORIGIN`, `VITE_API_URL`

## עמודות אקסל נתמכות
המערכת יודעת לקרוא את הכותרות הבאות:
- לקוח
- שם סניף
- מספר סניף
- מספר עמדה
- מספר סידורי
- שם מתקין
- תאריך יעד
- תאריך ביצוע
- סטטוס

## פקודות שימושיות
### Backend
```bash
npm install
npm run db:init
npm start
```

### Frontend
```bash
npm install
npm run build
npm run preview
```
