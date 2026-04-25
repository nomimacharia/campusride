# 🎓 CampusServe v1.1 — Setup Guide

## Prerequisites
- PHP 7.4+ with `mysqli` extension enabled
- MySQL 5.7+ or MariaDB 10.3+
- Local server: **XAMPP**, **WAMP**, **Laragon**, or **MAMP**

---

## Quick Start

### 1. Database Setup
1. Open **phpMyAdmin** (http://localhost/phpmyadmin)
2. Click **Import**, select `schema.sql`, click **Go**
3. Two demo accounts are created automatically:

| Role | Email | Password |
|------|-------|----------|
| 🧑‍🎓 Student | `student@campus.ac.ke` | `password` |
| 🏍️ Rider | `rider@campus.ac.ke` | `password` |

### 2. Configure Database
Open `api/config.php` and update your credentials:
```php
define('DB_HOST', 'localhost');
define('DB_USER', 'root');     // your MySQL username
define('DB_PASS', '');         // your MySQL password
define('DB_NAME', 'campusserve');
```

### 3. Deploy Files
Copy the entire `campusserve/` folder into your web root:

| Server  | Web root path              |
|---------|---------------------------|
| XAMPP   | `C:\xampp\htdocs\`        |
| WAMP    | `C:\wamp64\www\`          |
| Laragon | `C:\laragon\www\`         |
| MAMP    | `/Applications/MAMP/htdocs/` |

### 4. Open in Browser
👉 **http://localhost/campusserve/**

---

## File Structure

```
campusserve/
├── index.html        ← Single-page app (all UI)
├── style.css         ← All styles (green + white theme)
├── script.js         ← All frontend logic
├── schema.sql        ← MySQL schema + seed data
├── .htaccess         ← URL rewrites + security headers
├── README.md
└── api/
    ├── config.php        ← DB connection + shared helpers
    ├── auth.php          ← Register / Login / Logout / Session
    ├── rides.php         ← Ride booking & management
    ├── orders.php        ← Menu, cart, order lifecycle
    ├── messages.php      ← Chat send + poll
    ├── send_message.php  ← Alias (spec compliance)
    ├── get_messages.php  ← Alias (spec compliance)
    └── profile.php       ← Profile, stats, availability
```

---

## Features

### 🧑‍🎓 Student (Customer)
- Register / Login with demo one-tap fill
- Book campus rides — dynamic fare calculation
- Live ride status tracker (Booked → Accepted → En Route → Arrived)
- Active order tracker (Placed → Preparing → On the way → Delivered)
- Browse food menu with search + category filter
- Add to cart, checkout (Cash or M-Pesa mock with STK push simulation)
- Real-time chat with rider per ride (2.5s polling)
- Full ride & order history
- Edit profile + change password

### 🏍️ Rider (Provider)
- Dashboard with earnings, trip count, pending counts
- Toggle online/offline availability
- Accept, start, complete rides — auto-refreshes every 10s
- Accept, prepare, dispatch, mark delivered for food orders — auto-refreshes every 8s
- Chat with customer per ride
- View all pending ride requests + active ride in tabbed view
- Full history

### 🔔 Notifications
- Bell icon with unread badge count
- Slide-down panel with timestamped messages
- Auto-adds alerts for ride bookings, status updates, order placements

---

## Real-Time Chat
Uses HTTP polling (every **2.5 seconds**):
- `POST api/messages.php?action=send` — send a message
- `GET  api/messages.php?action=get&ride_id=X&since=Y` — fetch new messages
- Aliases: `send_message.php`, `get_messages.php`

---

## M-Pesa (Mock)
Simulated STK push flow:
1. User enters phone number
2. Modal shows spinner for 2.5s
3. "Payment confirmed" toast fires
4. Order is placed

**Production:** Integrate [Safaricom Daraja API](https://developer.safaricom.co.ke/) into `orders.php`

---

## Campus Locations & Fare
16 campus locations. Fare = `max(40, |pickup_index - dest_index| × 15 + 40)` KES

---

## Security Notes (Production Checklist)
- [ ] Change default MySQL password
- [ ] Use HTTPS (Let's Encrypt)
- [ ] Add CSRF tokens to all POST forms
- [ ] Set `HttpOnly` + `Secure` + `SameSite` on session cookie in `php.ini`
- [ ] Move `api/config.php` credentials to `.env` file
- [ ] Rate-limit login endpoint
- [ ] Validate all inputs server-side ✅ (already done for core fields)
- [ ] Hash passwords with `password_hash()` ✅ (already done)

---

Made with 💚 for campus life — CampusServe v1.1
