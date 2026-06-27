# Agent Follow-up CRM Workflow - PostgreSQL + Email API Version

Full-stack working prototype for **Agent Follow-up CRM Workflow** with React frontend, Node.js Express backend, PostgreSQL database, booking conflict prevention, rule-based AI suggestions, automated reminder/confirmation/follow-up message generation, real Email API support through SMTP/Nodemailer, notification previews, and CSV reports.

## Updated Stack

| Layer | Technology | Role in This Project |
|---|---|---|
| Frontend | HTML, CSS, React | Booking calendar, availability screen, customer form, confirmation page, admin booking list, message automation page, reports page |
| Backend | Node.js Express | Availability APIs, booking validation, conflict prevention, payment/status tracking, notification logic, email sending APIs |
| AI Layer | Rule-based prompts, OpenAI/Gemini-ready | Suggest suitable slots/packages and generate booking confirmation messages |
| Database | PostgreSQL | Stores leads, buyers, enquiries, budgets, areas, timelines, documents, scores, alerts, payments, and follow-up history |
| Messaging/Reports | Email API / WhatsApp preview / CSV export | Automated confirmations, reminders, and follow-up messages are generated where required and customer emails are sent when SMTP is configured |

## Main Features Added

- Gmail-only agent registration and login
- Lead/customer form with 10-digit phone validation and email validation
- PostgreSQL database instead of Firebase
- Buyers and enquiries saved separately in PostgreSQL
- Lead score, priority, recommended package, suggested slots, and confirmation message
- Booking calendar and availability screen
- Conflict prevention for duplicate active booking slots
- Admin booking list for Site Visit, Booking, and Payment stages
- Payment tracking with payment history table
- Follow-up history table
- Document link storage table
- Alert/message storage table
- Automated confirmations, reminders, payment messages, booking messages, and follow-up messages
- **Email API using Nodemailer SMTP**
- Customer confirmation/follow-up emails sent automatically when `EMAIL_ENABLED=true`
- Manual **Send Email** button for stored alert messages
- **Send Test Email** option in Message Automation page
- Reports page with CSV export

## PostgreSQL Database Setup in Windows

1. Open **pgAdmin 4**.
2. Expand **Servers** and enter your PostgreSQL password.
3. Right-click **Databases**.
4. Click **Create → Database**.
5. Database name:

```txt
agent_followup_crm
```

6. Click **Save**.

The backend creates all required tables automatically when it starts. If you want to create them manually, open **backend/schema.sql** in pgAdmin Query Tool and run it.

## Backend Setup

```bash
cd backend
npm install
copy .env.example .env
npm run dev
```

Open `backend/.env` and change this line to your PostgreSQL password:

```txt
PGPASSWORD=your_postgres_password_here
```

Backend URL:

```txt
http://localhost:5000
```

Health check:

```txt
http://localhost:5000/api/health
```

## Email API Setup

Open `backend/.env` and fill these values:

```txt
EMAIL_ENABLED=true
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_gmail_app_password_here
EMAIL_FROM_NAME=Lohitha Dharma Projects CRM
```

For Gmail, use a **Gmail App Password**, not your normal Gmail password.

After saving `.env`, restart backend:

```bash
npm run dev
```

Then open frontend:

```txt
Message Automation → Email API Status → Send Test Email
```

If email is configured correctly, the test email will be sent. After that, customer emails will be sent automatically when confirmation, booking, payment, or follow-up messages are generated.

## Frontend Setup

Open a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Frontend URL:

```txt
http://localhost:5173
```

## How Email Sending Works

- When a lead is created, a confirmation email is generated and sent if the customer email exists.
- When status becomes **Site Visit** or **Booking**, a booking/site-visit email is generated and sent.
- When payment is updated, a payment confirmation email is generated and sent.
- When follow-up is added, a follow-up email is generated and sent.
- If Email API is disabled, messages are still generated and stored in PostgreSQL as alerts.
- If customer email is missing, the alert status becomes **No Customer Email**.
- If SMTP details are wrong, the alert status becomes **Email Failed**.

## How to Use

1. Open the frontend URL.
2. Register using a Gmail address and password of at least 6 characters.
3. Login with the same Gmail and password.
4. Add a lead from **Lead Entry** and include customer email.
5. Select date and slot, then click **Check Availability**.
6. Click **Generate AI Recommendation**.
7. Save the lead.
8. Open **Message Automation** to view generated messages, email status, due reminders, and latest alerts.
9. Use **Send Test Email** to check SMTP.
10. Use **Send Email** next to an alert if you want to resend a stored message manually.

## Important API Routes

```txt
POST /api/auth/agent-register
POST /api/auth/agent-login
GET  /api/email/status
POST /api/email/test
POST /api/email/alerts/:id/send
GET  /api/packages
POST /api/ai/recommend
GET  /api/availability?date=YYYY-MM-DD
POST /api/bookings/validate
POST /api/leads
GET  /api/leads
GET  /api/leads/:id
PUT  /api/leads/:id/status
POST /api/leads/:id/followup
POST /api/leads/:id/process
PUT  /api/leads/:id/payment
POST /api/leads/:id/documents
POST /api/notifications/preview
POST /api/automation/messages/:id
GET  /api/reminders/due?date=YYYY-MM-DD
GET  /api/alerts
GET  /api/dashboard
GET  /api/reports/summary
GET  /api/reports/leads.csv
```

## PostgreSQL Tables

```txt
agents
buyers
enquiries
leads
followup_history
documents
alerts
payments
```

## Notes

- Firebase files were removed from this version.
- Email API is fully added through SMTP/Nodemailer.
- WhatsApp is still kept as a safe preview/API-ready layer.
- CSV reports download from the Reports page.


## Theme Update

The frontend theme has been updated to a professional **blue and white** color palette. The sidebar, hero cards, buttons, badges, forms, login page, customer portal, booking screens, reports, alerts, and email automation screens use the updated clean color scheme.

### Notification date/time fix

Reminder due dates are stored as PostgreSQL `DATE` values, and reminder cards show the selected date plus preferred slot. This avoids the common timezone issue where a selected India date can appear one day earlier in notifications.


## Booking Calendar Fix

- The Availability screen now blocks slots for any saved lead that already uses the same date and slot.
- Clicking an available slot from the Availability page fills the Lead Entry form automatically.
- The frontend uses local laptop date format instead of UTC date, so selected dates do not shift.
- The Admin Booking List now shows all scheduled leads with a date and slot.


### Delete / Cleanup Features

- Delete any lead from Dashboard, Lead Detail, or Admin Booking List.
- Deleting a lead also removes related follow-up history, documents, payments, alerts, and reminder records.
- Delete a single notification/reminder from Message Automation.
- Clear all notification/reminder history from Message Automation.
- Clear all notification/reminder history for one selected lead from Lead Detail.

New APIs:

```txt
DELETE /api/leads/:id
DELETE /api/alerts/:id
DELETE /api/alerts
DELETE /api/leads/:id/alerts
```


## Deployment Ready Check

This version is prepared for deployment according to the internship deployment requirement. Production setup notes are included in this README.

Important production values:

```env
FRONTEND_URL=https://your-frontend-url.vercel.app
DATABASE_URL=postgresql://user:password@host:5432/database
PGSSL=true
```

Frontend production value:

```env
VITE_API_URL=https://your-backend-url
```

Do not deploy with local PostgreSQL settings like `PGHOST=localhost`; those are only for your laptop.
