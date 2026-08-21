# Junie's Budget Tracker

A private, mobile-first personal budget tracker for credit-card balances, recurring bills, due dates, and monthly planning.

## Version 1 features

- Dashboard with total card balance, available credit, utilization, monthly amount due, remaining amount, next payment, and paid count
- Add, edit, and delete credit cards
- Add, edit, and delete recurring or one-time bills
- Monthly due-date calendar
- Per-month paid/unpaid status
- Balance privacy toggle
- JSON backup export and import
- Progressive Web App manifest and offline service worker
- Responsive layout designed for a phone browser

## Privacy

Version 1 stores financial data in the browser using `localStorage`. The repository contains application code only. Do not enter full credit-card numbers, passwords, CVVs, bank account numbers, or other credentials.

Because browser storage can be cleared, use **Settings → Export backup** periodically and before changing devices.

## Run locally

This is a static site. You can serve the project with any basic local web server, for example:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Deploy

The project can be deployed directly to Vercel as a static site. No build command is required.
