# פריסה ידנית ל-Render

הפרויקט הזה מותאם ל:
- PostgreSQL
- Web Service עבור backend
- Static Site עבור frontend

## 1. העלאה ל-GitHub
העלה את כל תוכן הפרויקט ל-repository אחד.

## 2. יצירת Database
ב-Render:
- New → PostgreSQL
- Name: `small-projects-db`

אחרי היצירה תהיה לך כתובת `Internal Database URL` או חיבור אוטומטי ל-ENV.

## 3. יצירת Backend
ב-Render:
- New → Web Service
- Connect Repository
- Root Directory: `backend`

### הגדרות
- Build Command:
```bash
npm install && npm run db:init
```

- Start Command:
```bash
npm start
```

### Environment Variables
- `DATABASE_URL` = חיבור ה-PostgreSQL של Render
- `CORS_ORIGIN` = כתובת ה-frontend שלך ב-Render
- `PORT` = Render מגדיר לבד, לא חובה

## 4. יצירת Frontend
ב-Render:
- New → Static Site
- Connect Repository
- Root Directory: `frontend`

### הגדרות
- Build Command:
```bash
npm install && npm run build
```

- Publish Directory:
```bash
dist
```

### Environment Variables
- `VITE_API_URL` = כתובת ה-backend, לדוגמה:
```env
https://your-backend-name.onrender.com
```

## 5. סדר עבודה נכון
1. להרים קודם Database
2. אחר כך Backend
3. לוודא ש-`/health` עובד
4. אחר כך Frontend
5. לעדכן `CORS_ORIGIN` ב-backend לכתובת האמיתית של ה-frontend

## 6. בדיקות
### backend
בדוק:
```text
https://your-backend-name.onrender.com/health
```

צריך לקבל:
```json
{"ok":true}
```

### frontend
בדוק שהאתר נטען ויודע ליצור פרויקט חדש.

## 7. אם יש שגיאה נפוצה
### CORS
וודא ש-`CORS_ORIGIN` ב-backend הוא בדיוק כתובת ה-frontend.

### Database
וודא ש-`DATABASE_URL` באמת מחובר למסד של Render.

### Build frontend
וודא ש-`VITE_API_URL` מצביע ל-backend ולא ל-localhost.
