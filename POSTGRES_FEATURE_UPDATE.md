# PostgreSQL + Email API Feature Update

This version changes the database from Firebase to PostgreSQL and adds the requested project modules, including real email sending through SMTP/Nodemailer.

## Included

- PostgreSQL connection using `pg`
- Automatic table creation from backend startup
- `backend/schema.sql` for manual pgAdmin setup
- Agent Gmail register/login stored in PostgreSQL
- Lead, buyer, enquiry, document, alert, payment, and history tables
- Availability API and slot conflict prevention
- Rule-based AI recommendations and confirmation message generation
- Payment/status tracking
- Notification preview logic for WhatsApp/Email style messages
- Automated reminders, confirmations, or follow-up messages generated where required
- Email API using SMTP/Nodemailer
- Automatic customer emails when `EMAIL_ENABLED=true` and customer email exists
- Manual email send API for existing alert messages
- Email API status and test email feature in frontend
- New Message Automation page for due reminders, generated message history, email status, and send-email buttons
- CSV report export
- React reports page

## New Email APIs

```txt
GET  /api/email/status
POST /api/email/test
POST /api/email/alerts/:id/send
```

## Tables

- `agents`: login accounts
- `buyers`: customer master records
- `enquiries`: enquiry source, budget, area, and timeline
- `leads`: main CRM workflow record
- `followup_history`: complete action history
- `documents`: document title/link/status storage
- `alerts`: notification preview/reminder/email status messages
- `payments`: payment tracking records

## Automated Messaging Rules

The backend creates message records automatically in the PostgreSQL `alerts` table and sends customer emails when Email API is enabled:

- New lead saved: customer confirmation + follow-up reminder
- Lead processed: confirmation/follow-up messages based on current CRM data
- Status changed to Site Visit or Booking: booking confirmation message
- Payment updated: payment confirmation/update message
- Follow-up added: next follow-up reminder message
- Message Automation page: shows reminders due on or before the selected date

## Email Status Values

- `Email Sent`: email successfully sent to the customer
- `Email Disabled`: SMTP sending is disabled in `.env`
- `No Customer Email`: customer email is missing
- `Email Failed`: SMTP configuration or send failed
- `Agent Reminder`: reminder stored for admin/agent only

## Date/Time Notification Fix

The automated reminder date now stores `alerts.due_at` as a PostgreSQL `DATE` value instead of `TIMESTAMPTZ`. This prevents timezone shifting where an India date such as `2026-06-25` could display as `2026-06-24` in the frontend. Reminder cards also show the preferred slot beside the due date.

If you already created alerts using an older version, restart the backend once. It automatically runs this migration:

```sql
ALTER TABLE alerts
ALTER COLUMN due_at TYPE DATE USING due_at::date;
```

If old alerts still look wrong, delete old alerts from the Message Automation page/database and regenerate required messages for the lead.
