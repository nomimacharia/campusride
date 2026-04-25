// ============================================================
// CampusServe — Final script.js
// Bugs fixed:
//  • Provider nav home→screen-provider (not screen-dashboard)
//  • Provider back btn on profile→screen-provider
//  • Orders tab removed from provider dashboard
//  • ride-status back btn role-aware
//  • navigateTo no longer double-declared
//  • Chat screen uses CSS class toggle only (no .hidden conflict)
//  • Cart int id fix preserved
// ============================================================

const API_BASE = 'api';

const State = {
  user:           null,
  cart:           [],
  currentScreen:  'screen-auth',
  chatRideId:     null,
  chatPrevScreen: 'screen-dashboard',
  chatLastMsgId:  0,
  chatTimer:      null,
  rideTimer:      null,
  providerTimer:  null,
  notifications:  [],
  notifOpen:      false,
  provNotifOpen:  false,
  _lastRideCount: -1, // tracks pending rides for provider notification
};

// ── LOCATIONS & FARE ─────────────────────────────────────────
const LOCATIONS = [
  'Main Gate','Library','Admin Block','Science Block',
  'Engineering Block','Cafeteria','Student Centre','Sports Ground',
  'Hostels A','Hostels B','Hostels C','Lecture Hall 1',
  'Lecture Hall 2','ICT Centre','Health Centre','Parking Lot'
];
function calcFare(p, d) {
  if (!p || !d || p === d) return 0;
  return Math.max(40, Math.abs(LOCATIONS.indexOf(p) - LOCATIONS.indexOf(d)) * 15 + 40);
}

// ── DOM HELPERS ───────────────────────────────────────────────
const $ = id => document.getElementById(id);
const qs  = s  => document.querySelector(s);
const qsa = s  => document.querySelectorAll(s);

function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── TOAST ─────────────────────────────────────────────────────
function toast(msg, type = 'default', dur = 3500) {
  const icons = { success:'✅', error:'❌', info:'ℹ️', default:'💬' };
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<span>${icons[type]}</span><span>${escHtml(msg)}</span>`;
  $('toast-container').appendChild(t);
  setTimeout(() => t.remove(), dur);
}
function loading(show) { $('loading-overlay').classList.toggle('hidden', !show); }

// ── API ───────────────────────────────────────────────────────
async function api(endpoint, body = null, method = 'GET') {
  try {
    const opts = { method, headers:{'Content-Type':'application/json'}, credentials:'include' };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(`${API_BASE}/${endpoint}`, opts);
    return await res.json();
  } catch(e) {
    console.error(e);
    return { success:false, message:'Network error — check connection' };
  }
}

// ── TIME ──────────────────────────────────────────────────────
function fmtTime(ts) {
  if (!ts) return '';
  return new Date(ts.replace(' ','T')).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
}
function fmtDate(ts) {
  if (!ts) return '';
  const d = new Date(ts.replace(' ','T'));
  if (d.toDateString() === new Date().toDateString()) return 'Today, ' + fmtTime(ts);
  return d.toLocaleDateString('en-KE', { day:'numeric', month:'short' }) + ', ' + fmtTime(ts);
}
function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

// ── MODAL ─────────────────────────────────────────────────────
const Modal = {
  show(html) {
    $('modal-content').innerHTML = html;
    $('modal-backdrop').classList.remove('hidden');
    $('modal').classList.remove('hidden');
  },
  close() {
    $('modal-backdrop').classList.add('hidden');
    $('modal').classList.add('hidden');
  }
};

// ── NOTIFICATIONS ─────────────────────────────────────────────
const Notifications = {
  add(msg) {
    State.notifications.unshift({ id: Date.now(), msg, time: new Date(), read: false });
    if (State.notifications.length > 30) State.notifications.pop();
    Notifications.renderAll();
    Notifications.badgeAll();
  },

  // Render into both customer and provider notif lists
  renderAll() {
    const html = !State.notifications.length
      ? '<p class="notif-empty">No notifications yet</p>'
      : State.notifications.map(n => `
          <div class="notif-item ${n.read ? '' : 'unread'}">
            <div class="notif-dot-sm"></div>
            <div>
              <div class="notif-msg">${escHtml(n.msg)}</div>
              <div class="notif-time">${fmtTime(n.time.toISOString())}</div>
            </div>
          </div>`).join('');

    const el1 = $('notif-list');
    const el2 = $('prov-notif-list');
    if (el1) el1.innerHTML = html;
    if (el2) el2.innerHTML = html;
  },

  badgeAll() {
    const unread = State.notifications.filter(n => !n.read).length;
    $('notif-badge')?.classList.toggle('hidden', unread === 0);
    $('prov-notif-badge')?.classList.toggle('hidden', unread === 0);
  },

  // Customer dashboard bell
  toggle() {
    const panel = $('notif-panel');
    if (!panel) return;
    State.notifOpen = !State.notifOpen;
    panel.classList.toggle('hidden', !State.notifOpen);
    if (State.notifOpen) {
      State.notifications.forEach(n => n.read = true);
      Notifications.badgeAll();
      Notifications.renderAll();
    }
  },

  // Provider dashboard bell
  toggleProv() {
    const panel = $('prov-notif-panel');
    if (!panel) return;
    State.provNotifOpen = !State.provNotifOpen;
    panel.classList.toggle('hidden', !State.provNotifOpen);
    if (State.provNotifOpen) {
      State.notifications.forEach(n => n.read = true);
      Notifications.badgeAll();
      Notifications.renderAll();
    }
  },

  clearAll() {
    State.notifications = [];
    Notifications.renderAll();
    Notifications.badgeAll();
    $('notif-panel')?.classList.add('hidden');
    $('prov-notif-panel')?.classList.add('hidden');
    State.notifOpen     = false;
    State.provNotifOpen = false;
  }
};

// ── NAVIGATION ────────────────────────────────────────────────
function navigateTo(screenId) {
  // Clean up timers when leaving screens
  if (State.currentScreen === 'screen-ride-status') clearInterval(State.rideTimer);
  if (State.currentScreen === 'screen-provider')    clearInterval(State.providerTimer);
  if (State.currentScreen === 'screen-chat' && screenId !== 'screen-chat') Chat.stopPolling();

  // Close notif panels
  $('notif-panel')?.classList.add('hidden');
  $('prov-notif-panel')?.classList.add('hidden');
  State.notifOpen     = false;
  State.provNotifOpen = false;

  // Always hide chat overlay when navigating to any non-chat screen
  $('screen-chat').classList.remove('chat-visible');

  if (screenId === 'screen-chat') {
    // Just show the chat overlay — don't touch the screens behind it
    $('screen-chat').classList.add('chat-visible');
    State.currentScreen = 'screen-chat';
    return;
  }

  // For all other screens: hide all, show target
  qsa('.screen').forEach(s => s.classList.remove('active-screen'));
  const el = $(screenId);
  if (el) el.classList.add('active-screen');
  State.currentScreen = screenId;

  // Per-screen loaders
  if (screenId === 'screen-dashboard')   Dashboard.load();
  if (screenId === 'screen-provider')    Provider.load();
  if (screenId === 'screen-ride-status') RideStatus.load();
  if (screenId === 'screen-checkout')    Checkout.render();
  if (screenId === 'screen-profile')     Profile.load();
}

// ── AUTH TAB/ROLE HELPERS ─────────────────────────────────────
function switchAuthTab(tab) {
  qsa('.auth-tab').forEach(b => b.classList.remove('active'));
  qsa('.auth-form').forEach(f => f.classList.remove('active'));
  $(`tab-${tab}`)?.classList.add('active');
  $(`form-${tab}`)?.classList.add('active');
}

function selectRole(role) {
  qsa('.role-card').forEach(c => c.classList.remove('selected'));
  const card = $(`card-${role}`);
  if (card) {
    card.classList.add('selected');
    const r = card.querySelector('input[type=radio]');
    if (r) r.checked = true;
  }
}

function swapRoute() {
  const p = $('pickup-input'), d = $('dest-input');
  if (!p || !d) return;
  const tmp = p.value;
  p.value = d.value;
  d.value = tmp;
  updateFarePreview();
}

function updateFarePreview() {
  const p  = $('pickup-input')?.value;
  const d  = $('dest-input')?.value;
  const fp = $('fare-preview');
  if (p && d && p !== d) {
    $('fare-preview-amount').textContent = `KES ${calcFare(p, d)}`;
    fp?.classList.remove('hidden');
  } else {
    fp?.classList.add('hidden');
  }
}

function toggleMpesa() {
  const isMpesa = qs('input[name="payment"]:checked')?.value === 'mpesa';
  $('mpesa-input-wrap')?.classList.toggle('hidden', !isMpesa);
}

// ── AUTH ──────────────────────────────────────────────────────
const Auth = {
  fillDemo(role) {
    switchAuthTab('login');
    $('login-email').value    = role === 'student' ? 'student@campus.ac.ke' : 'rider@campus.ac.ke';
    $('login-password').value = 'password';
    toast('Demo credentials filled — click Login', 'info');
  },

  async login() {
    const email    = $('login-email').value.trim();
    const password = $('login-password').value;
    if (!email || !password) return toast('Enter email and password', 'error');
    loading(true);
    const res = await api('auth.php?action=login', { email, password }, 'POST');
    loading(false);
    if (res.success) {
      toast(`Welcome back, ${res.user.name}! 👋`, 'success');
      Auth.enterApp(res.user);
    } else toast(res.message, 'error');
  },

  async register() {
    const name     = $('reg-name').value.trim();
    const phone    = $('reg-phone').value.trim();
    const email    = $('reg-email').value.trim();
    const password = $('reg-password').value;
    const role     = qs('.role-card.selected input[type=radio]')?.value || 'customer';
    if (!name || !email || !password) return toast('Fill all required fields', 'error');
    if (password.length < 6) return toast('Password must be at least 6 characters', 'error');
    loading(true);
    const res = await api('auth.php?action=register', { name, phone, email, password, role }, 'POST');
    loading(false);
    if (res.success) {
      toast(`Welcome, ${res.user.name}! 🎉`, 'success');
      Auth.enterApp(res.user);
    } else toast(res.message, 'error');
  },

  enterApp(user) {
    State.user = user;
    // Route to correct home screen by role
    navigateTo(user.role === 'provider' ? 'screen-provider' : 'screen-dashboard');
  },

  async checkSession() {
    const res = await api('auth.php?action=session');
    if (res.success) Auth.enterApp(res.user);
    // else: stay on auth screen
  }
};

// ── DASHBOARD (customer) ──────────────────────────────────────
const Dashboard = {
  async load() {
    $('dash-greeting').textContent  = greeting();
    $('dash-user-name').textContent = State.user?.name?.split(' ')[0] || 'User';
    Dashboard.populateLocations();
    Dashboard.checkActivePill();
    Dashboard.loadRecentRides();
    Food.load();
    History.load();
  },

  populateLocations() {
    // Populate the shared datalist for text input autocomplete
    const dl = $('locations-list');
    if (dl) {
      dl.innerHTML = LOCATIONS.map(l => `<option value="${escHtml(l)}"></option>`).join('');
    }
    // Attach oninput handlers (HTML already has oninput="updateFarePreview()" but set here too as safety)
    $('pickup-input') && ($('pickup-input').oninput = updateFarePreview);
    $('dest-input')   && ($('dest-input').oninput   = updateFarePreview);
  },

  async checkActivePill() {
    const [rRes, oRes] = await Promise.all([
      api('rides.php?action=active'),
      api('orders.php?action=list'),
    ]);
    const activeRide  = rRes.success && rRes.ride ? rRes.ride : null;
    const activeOrder = (oRes.orders || []).find(o =>
      ['pending','preparing','out_for_delivery'].includes(o.status));
    const pill = $('active-pill');
    if (activeRide) {
      pill.classList.remove('hidden');
      $('active-pill-text').textContent = `🏍️ Ride ${activeRide.status.replace(/_/g,' ')} · ${activeRide.pickup}`;
      $('active-pill-btn').onclick = () => navigateTo('screen-ride-status');
    } else if (activeOrder) {
      pill.classList.remove('hidden');
      const lbl = { pending:'placed', preparing:'being prepared', out_for_delivery:'on the way' };
      $('active-pill-text').textContent = `🍽️ Order ${lbl[activeOrder.status] || activeOrder.status}`;
      $('active-pill-btn').onclick = () => {};
    } else {
      pill.classList.add('hidden');
    }
  },

  async loadRecentRides() {
    const res = await api('rides.php?action=history');
    const el  = $('recent-rides-list');
    if (!el) return;
    const rides = (res.rides || []).slice(0, 3);
    if (!rides.length) {
      el.innerHTML = '<p style="font-size:.85rem;color:var(--gray);padding:8px 0">No rides yet — book your first ride above!</p>';
      return;
    }
    el.innerHTML = rides.map(r => `
      <div class="listing-card" onclick="navigateTo('screen-ride-status')">
        <div class="listing-accent ${r.status==='completed'?'green':'blue'}"></div>
        <div class="listing-body">
          <div class="listing-top">
            <div>
              <div class="listing-name">${escHtml(r.pickup)} → ${escHtml(r.destination)}</div>
              <div class="listing-location">${fmtDate(r.updated_at)} · KES ${parseFloat(r.fare).toFixed(0)}</div>
            </div>
            <span class="badge ${r.status}">${r.status.replace(/_/g,' ')}</span>
          </div>
          ${r.provider_name ? `<div class="listing-rating">Driver: ${escHtml(r.provider_name)}</div>` : ''}
        </div>
      </div>`).join('');
  }
};

// ── DASHBOARD TAB SWITCH ──────────────────────────────────────
function switchDashTab(tab) {
  qsa('#screen-dashboard .dash-tab').forEach(b => b.classList.remove('active'));
  qsa('#screen-dashboard .tab-panel').forEach(p => p.classList.remove('active'));
  const map = { rides:0, food:1, history:2 };
  const btns   = qsa('#screen-dashboard .dash-tab');
  const panels = ['panel-rides','panel-food','panel-history'];
  const idx    = map[tab] ?? 0;
  if (btns[idx]) btns[idx].classList.add('active');
  $(panels[idx])?.classList.add('active');
}

// ── PROVIDER TAB SWITCH ───────────────────────────────────────
function switchProvTab(tab) {
  qsa('#screen-provider .dash-tab').forEach(b => b.classList.remove('active'));
  qsa('#screen-provider .tab-panel').forEach(p => p.classList.remove('active'));
  const map    = { rides:0, earnings:1 };
  const btns   = qsa('#screen-provider .dash-tab');
  const panels = ['prov-panel-rides','prov-panel-earnings'];
  const idx    = map[tab] ?? 0;
  if (btns[idx]) btns[idx].classList.add('active');
  $(panels[idx])?.classList.add('active');
  if (tab === 'rides') Provider.loadRides();
}

// ── RIDES ─────────────────────────────────────────────────────
const Rides = {
  async bookRide() {
    const pickupRaw = $('pickup-input')?.value.trim();
    const destRaw   = $('dest-input')?.value.trim();
    if (!pickupRaw || !destRaw) return toast('Enter pickup and destination', 'error');

    // Case-insensitive match against known locations
    const pickup = LOCATIONS.find(l => l.toLowerCase() === pickupRaw.toLowerCase()) || pickupRaw;
    const dest   = LOCATIONS.find(l => l.toLowerCase() === destRaw.toLowerCase())   || destRaw;

    if (pickup.toLowerCase() === dest.toLowerCase()) return toast('Pickup and destination must be different', 'error');

    const fare = calcFare(pickup, dest);
    if (fare === 0) {
      // Unknown locations — still allow booking with flat fare
    }

    loading(true);
    const res = await api('rides.php?action=book', {
      pickup, destination: dest, fare: fare || 50
    }, 'POST');
    loading(false);
    if (res.success) {
      toast('Ride booked! Searching for a driver… 🏍️', 'success');
      Notifications.add(`Ride booked: ${pickup} → ${dest}`);
      // Clear inputs
      $('pickup-input').value = '';
      $('dest-input').value   = '';
      $('fare-preview')?.classList.add('hidden');
      navigateTo('screen-ride-status');
    } else toast(res.message, 'error');
  },

  async cancelRide() {
    const res = await api('rides.php?action=active');
    if (!res.success || !res.ride) return toast('No active ride', 'error');
    loading(true);
    const upd = await api('rides.php?action=update', { ride_id:res.ride.id, status:'cancelled' }, 'POST');
    loading(false);
    if (upd.success) {
      toast('Ride cancelled', 'info');
      navigateTo('screen-dashboard');
    } else toast(upd.message, 'error');
  },

  async update(rideId, status) {
    loading(true);
    const res = await api('rides.php?action=update', { ride_id:rideId, status }, 'POST');
    loading(false);
    if (res.success) {
      const msgs = {
        accepted:    'Ride accepted! Head to pickup 🏍️',
        in_progress: 'Ride started!',
        completed:   'Ride completed! Earnings updated 💰',
        cancelled:   'Ride cancelled'
      };
      toast(msgs[status] || 'Updated', status === 'cancelled' ? 'error' : 'success');
      Notifications.add(msgs[status] || 'Ride status updated');
      Provider.loadRides();
      Provider.loadEarnings();
    } else toast(res.message, 'error');
  },

  buildRideCard(ride) {
    const role   = State.user?.role;
    const status = ride.status;
    const custNm = escHtml(ride.customer_name  || 'Customer');
    const provNm = escHtml(ride.provider_name  || 'Rider');
    const custAv = ride.customer_avatar || '🧑';
    const provAv = ride.provider_avatar || '🏍️';
    let actions  = '';

    if (role === 'provider') {
      if (status === 'pending')
        actions = `<button class="btn-accept" onclick="Rides.update(${ride.id},'accepted')">Accept</button>`;
      else if (status === 'accepted')
        actions = `<button class="btn-start" onclick="Rides.update(${ride.id},'in_progress')">Start</button>
                   <button class="btn-chat-sm" onclick="Chat.open(${ride.id},'${custNm}','${custAv}','screen-provider')">💬</button>`;
      else if (status === 'in_progress')
        actions = `<button class="btn-complete" onclick="Rides.update(${ride.id},'completed')">Complete ✓</button>
                   <button class="btn-chat-sm" onclick="Chat.open(${ride.id},'${custNm}','${custAv}','screen-provider')">💬</button>`;
    } else {
      if (status === 'pending')
        actions = `<button class="btn-cancel" onclick="Rides.cancelRide()">Cancel</button>`;
      else if (['accepted','in_progress'].includes(status))
        actions = `<button class="btn-chat-sm" onclick="Chat.open(${ride.id},'${provNm}','${provAv}','screen-dashboard')">💬 Chat Driver</button>`;
    }

    const personLine = role === 'provider'
      ? `<div class="person-mini">${custAv} ${custNm}</div>`
      : (ride.provider_name
          ? `<div class="person-mini">${provAv} Driver: ${provNm}</div>`
          : '<div class="person-mini">⏳ Looking for a driver…</div>');

    return `<div class="ride-card-item">
      <div class="rcard-hd">
        <span class="rcard-id">#${String(ride.id).padStart(4,'0')}</span>
        <span class="badge ${status}">${status.replace(/_/g,' ')}</span>
      </div>
      <div class="ride-route">
        <div class="route-pt"><div class="dot dot-g"></div><span>${escHtml(ride.pickup)}</span></div>
        <div class="route-pt"><div class="dot dot-r"></div><span>${escHtml(ride.destination)}</span></div>
      </div>
      <div class="rcard-ft">
        <div><div class="ride-fare">KES ${parseFloat(ride.fare).toFixed(0)}</div>${personLine}</div>
        <div class="rcard-actions">${actions}</div>
      </div>
    </div>`;
  }
};

// ── RIDE STATUS ───────────────────────────────────────────────
const RideStatus = {
  async load() {
    clearInterval(State.rideTimer);
    // Back button goes to correct home screen for current user's role
    const backBtn = $('ride-status-back');
    if (backBtn) {
      backBtn.onclick = () => navigateTo(
        State.user?.role === 'provider' ? 'screen-provider' : 'screen-dashboard'
      );
    }
    // Home nav button in ride status screen also needs role-awareness
    const homeBtn = $('rs-home-btn');
    if (homeBtn) {
      homeBtn.onclick = () => navigateTo(
        State.user?.role === 'provider' ? 'screen-provider' : 'screen-dashboard'
      );
    }

    await RideStatus.refresh();
    State.rideTimer = setInterval(() => {
      if (State.currentScreen === 'screen-ride-status') RideStatus.refresh();
    }, 5000);
  },

  async refresh() {
    const res = await api('rides.php?action=active');
    if (!res.success || !res.ride) {
      $('ride-header-sub').textContent  = 'No active ride';
      $('ride-status-badge').textContent = '— NONE';
      $('ride-status-badge').className   = 'status-badge';
      $('btn-cancel-ride')?.classList.add('hidden');
      $('driver-info-wrap')?.classList.add('hidden');
      return;
    }
    const ride = res.ride;

    $('ride-header-sub').textContent = `${ride.pickup} → ${ride.destination}`;
    $('status-pickup').textContent   = ride.pickup;
    $('status-dest').textContent     = ride.destination;
    $('status-fare').textContent     = `KES ${parseFloat(ride.fare).toFixed(0)}`;

    const labels = {
      pending:     '⏳ PENDING',
      accepted:    '✅ ACCEPTED',
      in_progress: '🚗 EN ROUTE',
      completed:   '🏁 COMPLETED',
      cancelled:   '❌ CANCELLED'
    };
    const badge = $('ride-status-badge');
    badge.textContent = labels[ride.status] || ride.status;
    badge.className   = `status-badge ${ride.status}`;

    // Driver info
    const driverWrap = $('driver-info-wrap');
    if (ride.provider_name) {
      driverWrap.classList.remove('hidden');
      $('driver-avatar').textContent = ride.provider_avatar || '🏍️';
      $('driver-name').textContent   = ride.provider_name;
      $('driver-phone').textContent  = ride.provider_phone || '';
      $('btn-chat-ride').onclick = () =>
        Chat.open(ride.id, ride.provider_name, ride.provider_avatar || '🏍️', 'screen-ride-status');
    } else {
      driverWrap.classList.add('hidden');
    }

    // Cancel button — only for pending/accepted
    $('btn-cancel-ride').classList.toggle('hidden', !['pending','accepted'].includes(ride.status));

    // Stepper
    const stepOrder = { pending:1, accepted:2, in_progress:3, completed:4, cancelled:4 };
    const cur = stepOrder[ride.status] || 1;
    const stepTitles = ['Searching for driver','Driver assigned','Ride in progress','Completed'];
    for (let i = 1; i <= 4; i++) {
      const circle    = $(`sc-${i}`);
      const connector = $(`scon-${i}`);
      const body      = $(`sb-${i}`);
      const timeEl    = $(`step-${i}-time`);
      if (!circle) continue;

      if (i < cur) {
        circle.className = 'step-circle completed';
        circle.textContent = '✓';
        connector?.classList.add('done');
        body?.classList.remove('current');
      } else if (i === cur) {
        circle.className = 'step-circle current';
        circle.textContent = String(i);
        body?.classList.add('current');
      } else {
        circle.className = 'step-circle upcoming';
        circle.textContent = String(i);
        body?.classList.remove('current');
      }

      if (timeEl) {
        timeEl.textContent = i <= cur ? (i === cur ? 'Now' : 'Done') : 'Pending';
      }
    }
  }
};

// ── FOOD ──────────────────────────────────────────────────────
const Food = {
  all:      [],
  filtered: [],
  _cat:     'all',
  _fetched: 0,

  async load() {
    const now = Date.now();
    if (!Food.all.length || now - Food._fetched > 300000) {
      const res = await api('orders.php?action=menu');
      if (res.success) {
        // Normalise IDs to integers to avoid === mismatches
        Food.all     = res.items.map(i => ({ ...i, id: parseInt(i.id) }));
        Food._fetched = now;
      }
    }
    Food.filtered = [...Food.all];
    Food.render();
  },

  filterCat(el, cat) {
    qsa('.filter-scroll .filter-chip').forEach(c => c.classList.remove('active'));
    el.classList.add('active');
    Food._cat     = cat;
    Food.filtered = cat === 'all' ? [...Food.all] : Food.all.filter(i => i.category === cat);
    Food.render();
  },

  render() {
    const el = $('menu-list');
    if (!el) return;
    if (!Food.filtered.length) {
      el.innerHTML = '<p style="font-size:.85rem;color:var(--gray);padding:8px 0">No items found</p>';
      Food.updateCartBar();
      return;
    }
    el.innerHTML = Food.filtered.map(item => {
      const qty = State.cart.find(c => c.id === item.id)?.qty || 0;
      return `<div class="menu-item">
        <div class="menu-emoji">${item.emoji || '🍽️'}</div>
        <div class="menu-info">
          <div class="menu-name">${escHtml(item.name)}</div>
          <div class="menu-desc">${escHtml(item.description || '')}</div>
          <div class="menu-price">KES ${parseFloat(item.price).toFixed(0)}</div>
        </div>
        <div class="menu-actions">
          ${qty > 0
            ? `<button class="qty-btn" onclick="Food.changeQty(${item.id},-1)">−</button>
               <span class="qty-num">${qty}</span>
               <button class="qty-btn" onclick="Food.changeQty(${item.id},+1)">+</button>`
            : `<button class="add-to-cart-btn" onclick="Food.add(${item.id})">Add</button>`}
        </div>
      </div>`;
    }).join('');
    Food.updateCartBar();
  },

  add(itemId) {
    itemId = parseInt(itemId);
    const item = Food.all.find(i => i.id === itemId);
    if (!item) return;
    const ex = State.cart.find(c => c.id === itemId);
    if (ex) ex.qty++;
    else State.cart.push({ id:itemId, name:item.name, price:item.price, emoji:item.emoji, qty:1 });
    toast(`${item.emoji || '🍽️'} Added to cart`, 'success', 1800);
    Food.render();
  },

  changeQty(itemId, delta) {
    itemId = parseInt(itemId);
    const idx = State.cart.findIndex(c => c.id === itemId);
    if (idx === -1) return;
    State.cart[idx].qty += delta;
    if (State.cart[idx].qty <= 0) State.cart.splice(idx, 1);
    Food.render();
  },

  updateCartBar() {
    const count = State.cart.reduce((s, c) => s + c.qty, 0);
    const price = State.cart.reduce((s, c) => s + c.qty * parseFloat(c.price), 0);
    const bar   = $('cart-bar');
    if (!bar) return;
    if (count > 0) {
      $('cart-count').textContent     = count;
      $('cart-total-bar').textContent = `KES ${price.toFixed(0)}`;
      bar.classList.remove('hidden');
    } else {
      bar.classList.add('hidden');
    }
  },

  getTotal: () => State.cart.reduce((s, c) => s + c.qty * parseFloat(c.price), 0),
};

// ── CHECKOUT ──────────────────────────────────────────────────
const Checkout = {
  render() {
    const itemsList = $('cart-items-list');
    const formWrap  = $('checkout-form-wrap');
    const emptyEl   = $('empty-cart');
    if (!itemsList) return;

    if (!State.cart.length) {
      itemsList.innerHTML = '';
      emptyEl?.classList.remove('hidden');
      formWrap?.classList.add('hidden');
      return;
    }
    emptyEl?.classList.add('hidden');
    formWrap?.classList.remove('hidden');

    itemsList.innerHTML = State.cart.map(item => `
      <div class="cart-item">
        <div class="cart-item-emoji">${item.emoji || '🍽️'}</div>
        <div class="cart-item-info">
          <div class="cart-item-name">${escHtml(item.name)}</div>
          <div class="cart-item-unit">KES ${parseFloat(item.price).toFixed(0)} each</div>
        </div>
        <div class="cart-item-qty-ctrl">
          <button class="qty-btn" onclick="Checkout.changeQty(${item.id},-1)">−</button>
          <span class="cart-item-qty-badge">×${item.qty}</span>
          <button class="qty-btn" onclick="Checkout.changeQty(${item.id},+1)">+</button>
        </div>
        <div class="cart-item-subtotal">KES ${(item.qty * parseFloat(item.price)).toFixed(0)}</div>
      </div>`).join('');

    // Delivery dropdown
    const sel     = $('delivery-location');
    const prevLoc = sel?.value;
    if (sel) {
      sel.innerHTML = '<option value="">-- Select location --</option>';
      LOCATIONS.forEach(l => sel.innerHTML += `<option value="${l}" ${l===prevLoc?'selected':''}>${l}</option>`);
    }

    const sub = Food.getTotal();
    if ($('checkout-subtotal')) $('checkout-subtotal').textContent = `KES ${sub.toFixed(0)}`;
    if ($('checkout-total'))    $('checkout-total').textContent    = `KES ${(sub + 30).toFixed(0)}`;

    // Payment radio handlers
    qsa('input[name="payment"]').forEach(r => {
      r.onchange = toggleMpesa;
    });
  },

  changeQty(itemId, delta) {
    itemId = parseInt(itemId);
    const idx = State.cart.findIndex(c => c.id === itemId);
    if (idx === -1) return;
    State.cart[idx].qty += delta;
    if (State.cart[idx].qty <= 0) State.cart.splice(idx, 1);
    Food.updateCartBar();
    Checkout.render();
  },

  clearCart() {
    State.cart = [];
    Food.updateCartBar();
    Checkout.render();
    toast('Cart cleared', 'info');
  },

  async placeOrder() {
    if (!State.cart.length) return toast('Cart is empty', 'error');
    const loc     = $('delivery-location')?.value;
    const payment = qs('input[name="payment"]:checked')?.value || 'cash';
    if (!loc) return toast('Select a delivery location', 'error');

    if (payment === 'mpesa') {
      const num = $('mpesa-number')?.value.trim();
      if (!num) return toast('Enter your M-Pesa number', 'error');
      Modal.show(`
        <div style="text-align:center;padding:10px 0">
          <div style="font-size:3rem;margin-bottom:10px">📱</div>
          <h3 style="font-weight:800;margin-bottom:8px">M-Pesa STK Push</h3>
          <p style="font-size:.88rem;color:var(--gray);margin-bottom:16px">Request sent to <strong>${escHtml(num)}</strong>. Confirm on your phone.</p>
          <div class="spinner" style="margin:0 auto 10px"></div>
          <p style="font-size:.78rem;color:var(--gray-light)">Waiting…</p>
        </div>`);
      await new Promise(r => setTimeout(r, 2500));
      Modal.close();
      toast('M-Pesa confirmed ✅', 'success');
      await new Promise(r => setTimeout(r, 400));
    }

    const items = State.cart.map(c => ({ id:c.id, name:c.name, qty:c.qty, price:c.price, emoji:c.emoji }));
    const total = Food.getTotal() + 30;
    loading(true);
    const res = await api('orders.php?action=place', {
      items, total, payment_method: payment, delivery_location: loc
    }, 'POST');
    loading(false);

    if (res.success) {
      toast('Order placed! 🍽️ Preparing soon…', 'success');
      Notifications.add(`Order placed — ${items.length} item(s) — KES ${total}`);
      State.cart = [];
      Food.updateCartBar();
      navigateTo('screen-dashboard');
      switchDashTab('history');
    } else toast(res.message, 'error');
  }
};

// ── HISTORY ───────────────────────────────────────────────────
const History = {
  async load() {
    await Promise.all([History.loadRides(), History.loadOrders()]);
  },

  switchTab(el, which) {
    qsa('#panel-history .filter-chip').forEach(c => c.classList.remove('active'));
    el.classList.add('active');
    $('history-rides-list')?.classList.toggle('hidden',  which !== 'rides');
    $('history-orders-list')?.classList.toggle('hidden', which !== 'orders');
  },

  async loadRides() {
    const res = await api('rides.php?action=history');
    const el  = $('history-rides-list');
    if (!el) return;
    if (!res.success || !res.rides?.length) {
      el.innerHTML = '<p style="font-size:.85rem;color:var(--gray);padding:8px 0">No ride history yet</p>';
      return;
    }
    el.innerHTML = res.rides.map(r => `
      <div class="history-item">
        <div class="hist-hd">
          <span class="hist-date">${fmtDate(r.updated_at)}</span>
          <span class="badge ${r.status}">${r.status.replace(/_/g,' ')}</span>
        </div>
        <div class="hist-route">📍 ${escHtml(r.pickup)} → 🏁 ${escHtml(r.destination)}</div>
        <div class="hist-ft">
          <span class="hist-amount">KES ${parseFloat(r.fare).toFixed(0)}</span>
          <span class="hist-meta">#${String(r.id).padStart(4,'0')}</span>
        </div>
      </div>`).join('');
  },

  async loadOrders() {
    const res = await api('orders.php?action=history');
    const el  = $('history-orders-list');
    if (!el) return;
    if (!res.success || !res.orders?.length) {
      el.innerHTML = '<p style="font-size:.85rem;color:var(--gray);padding:8px 0">No order history yet</p>';
      return;
    }
    el.innerHTML = res.orders.map(o => {
      const items = (o.items || []).map(i => `${i.emoji||'🍽️'} ${i.name} ×${i.qty}`).join(', ');
      return `<div class="history-item">
        <div class="hist-hd">
          <span class="hist-date">${fmtDate(o.updated_at)}</span>
          <span class="badge ${o.status}">${o.status.replace(/_/g,' ')}</span>
        </div>
        <div class="hist-route" style="font-size:.82rem">${escHtml(items)}</div>
        <div class="hist-ft">
          <span class="hist-amount">KES ${parseFloat(o.total).toFixed(0)}</span>
          <span class="hist-meta">${o.payment_method==='mpesa'?'📱 M-Pesa':'💵 Cash'}</span>
        </div>
      </div>`;
    }).join('');
  }
};

// ── PROVIDER ──────────────────────────────────────────────────
const Provider = {
  async load() {
    clearInterval(State.providerTimer);
    $('prov-user-name').textContent = State.user?.name?.split(' ')[0] || 'Rider';
    Provider.loadProfile();
    Provider.loadRides();
    Provider.loadEarnings();
    // Auto-refresh rides every 8s, notify on new incoming requests
    State.providerTimer = setInterval(async () => {
      if (State.currentScreen === 'screen-provider') {
        await Provider.loadRides(true); // true = check for new rides
      }
    }, 8000);
  },

  async loadProfile() {
    const res = await api('profile.php?action=get');
    if (res.success) Provider.setAvail(res.user.is_available);
  },

  setAvail(on) {
    $('avail-toggle')?.classList.toggle('on', !!on);
    const lbl = $('avail-label');
    if (lbl) lbl.textContent = on ? 'Online' : 'Offline';
  },

  async toggleAvailability() {
    const res = await api('profile.php?action=toggle_availability', {}, 'POST');
    if (res.success) {
      Provider.setAvail(res.is_available);
      toast(res.is_available ? '🟢 You are now Online!' : '⚫ You are now Offline', 'info');
      Notifications.add(res.is_available ? 'You went online — accepting requests' : 'You went offline');
    } else toast(res.message, 'error');
  },

  async loadRides(checkNew = false) {
    const [availRes, activeRes] = await Promise.all([
      api('rides.php?action=available'),
      api('rides.php?action=active'),
    ]);

    const rides     = availRes.rides || [];
    const rideCount = rides.length;

    // Notify if new ride requests arrived since last check
    if (checkNew && State._lastRideCount >= 0 && rideCount > State._lastRideCount) {
      const newCount = rideCount - State._lastRideCount;
      Notifications.add(`🏍️ ${newCount} new ride request${newCount > 1 ? 's' : ''}!`);
      // Visual pulse on the Rides tab
      const ridesTab = $('ptab-rides-btn');
      if (ridesTab) {
        ridesTab.classList.add('tab-pulse');
        setTimeout(() => ridesTab.classList.remove('tab-pulse'), 2000);
      }
    }
    State._lastRideCount = rideCount;

    // Pending requests
    const list = $('provider-rides-list');
    if (list) {
      list.innerHTML = rides.length
        ? rides.map(r => Rides.buildRideCard(r)).join('')
        : '<div class="empty-state" style="padding:28px 0"><div class="empty-icon">🏍️</div><p>No pending ride requests</p></div>';
    }

    // Active ride
    const activeEl = $('provider-active-ride');
    if (activeEl) {
      activeEl.innerHTML = (activeRes.success && activeRes.ride)
        ? Rides.buildRideCard(activeRes.ride)
        : '<p style="font-size:.85rem;color:var(--gray);padding:8px 0">No active ride right now</p>';
    }
  },

  async loadEarnings() {
    const res = await api('profile.php?action=stats');
    const el  = $('provider-stats-cards');
    if (!el || !res.success) return;
    const s = res.stats;
    el.innerHTML = `
      <div class="stat-card">
        <div class="stat-label">Total Earnings</div>
        <div class="stat-value">KES ${parseFloat(s.earnings||0).toFixed(0)}</div>
        <div class="stat-sub">All time</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Completed Trips</div>
        <div class="stat-value">${s.total_trips || 0}</div>
        <div class="stat-sub">Rides + deliveries</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Active Rides</div>
        <div class="stat-value">${s.pending_rides || 0}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Pending Orders</div>
        <div class="stat-value">${s.pending_orders || 0}</div>
      </div>`;
  }
};

// ── CHAT ──────────────────────────────────────────────────────
const Chat = {
  // Called from ride cards only — always pass rideId
  open(rideId, partnerName, partnerAvatar, prevScreen) {
    rideId     = parseInt(rideId);
    prevScreen = prevScreen || State.currentScreen || 'screen-dashboard';

    // Validate we have a real ride
    if (!rideId || isNaN(rideId)) { toast('No active ride to chat on', 'error'); return; }

    // Reset state for this specific ride
    State.chatRideId     = rideId;
    State.chatPrevScreen = prevScreen;
    State.chatLastMsgId  = 0;

    // Set header
    $('chat-partner-name').textContent   = partnerName || 'Driver';
    $('chat-ride-ref').textContent       = `Ride #${String(rideId).padStart(4,'0')}`;
    const initials = String(partnerName || '?').split(' ').map(w => w[0] || '').join('').slice(0,2).toUpperCase();
    $('chat-avatar-initials').textContent = initials || '?';

    // Back button returns to where we came from
    $('chat-back-btn').onclick = () => {
      Chat.stopPolling();
      navigateTo(State.chatPrevScreen);
    };

    // Enter key sends
    const input = $('chat-input-field');
    input.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); Chat.sendMessage(); } };

    // Clear old messages
    $('chat-messages').innerHTML = '<div class="chat-date">Today</div>';

    // Navigate and start
    navigateTo('screen-chat');
    Chat.loadMessages();
    Chat.startPolling();

    // Focus input after a tick (let render complete)
    setTimeout(() => input.focus(), 150);
  },

  async loadMessages() {
    // Guard: never poll without a valid ride
    if (!State.chatRideId) return;

    const res = await api(`messages.php?action=get&ride_id=${State.chatRideId}&since=${State.chatLastMsgId}`);
    if (!res.success) return;

    const msgs = res.messages || [];
    const myId = parseInt(res.user_id);
    const box  = $('chat-messages');

    msgs.forEach(msg => {
      const mine  = parseInt(msg.sender_id) === myId;
      const msgId = parseInt(msg.id);
      if (msgId > State.chatLastMsgId) State.chatLastMsgId = msgId;

      const div = document.createElement('div');
      div.className = `bubble ${mine ? 'sent' : 'received'}`;
      div.innerHTML = `
        ${!mine ? `<div class="bubble-sender">${escHtml(msg.sender_name)}</div>` : ''}
        <div>${escHtml(msg.message)}</div>
        <div class="bubble-time">${fmtTime(msg.created_at)}${mine ? ' ✓✓' : ''}</div>`;
      box.appendChild(div);
    });

    if (msgs.length) box.scrollTop = box.scrollHeight;
  },

  async sendMessage() {
    if (!State.chatRideId) { toast('No active ride', 'error'); return; }
    const input = $('chat-input-field');
    const text  = input?.value.trim();
    if (!text) return;
    input.value = '';
    const res = await api('messages.php?action=send', {
      ride_id: State.chatRideId, message: text
    }, 'POST');
    if (res.success) {
      Chat.loadMessages();
    } else {
      input.value = text; // restore on failure
      toast(res.message || 'Failed to send', 'error');
    }
  },

  startPolling() { Chat.stopPolling(); State.chatTimer = setInterval(Chat.loadMessages, 2500); },
  stopPolling()  { clearInterval(State.chatTimer); State.chatTimer = null; },

  // Called from bottom nav — only re-open if we already have an active chat session
  async navBtn() {
    if (State.chatRideId) {
      // Re-enter the existing chat
      navigateTo('screen-chat');
      Chat.loadMessages();
      Chat.startPolling();
      setTimeout(() => $('chat-input-field')?.focus(), 150);
      return;
    }
    // Try to find an active ride and open its chat
    const res = await api('rides.php?action=active');
    if (res.success && res.ride &&
        ['accepted','in_progress'].includes(res.ride.status) &&
        res.ride.provider_id) {
      const role = State.user?.role;
      if (role === 'customer') {
        Chat.open(res.ride.id, res.ride.provider_name || 'Rider',
                  res.ride.provider_avatar || '🏍️', State.currentScreen);
      } else {
        Chat.open(res.ride.id, res.ride.customer_name || 'Customer',
                  res.ride.customer_avatar || '🧑', State.currentScreen);
      }
    } else {
      toast('No active ride — chat opens when your ride is accepted', 'info');
    }
  }
};

// ── PROFILE ───────────────────────────────────────────────────
const Profile = {
  async load() {
    const res = await api('profile.php?action=get');
    if (!res.success) return;
    const u = res.user;

    $('profile-avatar').textContent       = u.avatar || '🧑';
    $('profile-name-display').textContent = u.name;

    const badge = $('profile-role-badge');
    if (badge) {
      badge.textContent = u.role === 'provider' ? 'Rider' : 'Student';
      badge.className   = `badge ${u.role === 'provider' ? 'accepted' : 'completed'}`;
    }

    $('profile-name').value  = u.name;
    $('profile-phone').value = u.phone || '';
    $('profile-email').value = u.email;

    if ($('profile-member-since') && u.created_at) {
      $('profile-member-since').textContent = new Date(u.created_at.replace(' ','T'))
        .toLocaleDateString('en-KE', { day:'numeric', month:'long', year:'numeric' });
    }

    // Back button — goes to correct home screen for role
    const backBtn = $('profile-back-btn');
    if (backBtn) {
      backBtn.onclick = () => navigateTo(
        State.user?.role === 'provider' ? 'screen-provider' : 'screen-dashboard'
      );
    }

    // Mini stats
    const sRes = await api('profile.php?action=stats');
    if (sRes.success) {
      const s    = sRes.stats;
      const mini = $('profile-stats-mini');
      if (mini) {
        mini.innerHTML = u.role === 'provider'
          ? `<div class="psm-item"><div class="psm-val">KES ${parseFloat(s.earnings||0).toFixed(0)}</div><div class="psm-key">Earned</div></div>
             <div class="psm-item"><div class="psm-val">${s.total_trips||0}</div><div class="psm-key">Trips</div></div>`
          : `<div class="psm-item"><div class="psm-val">${s.total_rides||0}</div><div class="psm-key">Rides</div></div>
             <div class="psm-item"><div class="psm-val">${s.total_orders||0}</div><div class="psm-key">Orders</div></div>`;
      }
    }
  },

  async save() {
    const name    = $('profile-name').value.trim();
    const phone   = $('profile-phone').value.trim();
    const newPass = $('profile-new-password')?.value || '';

    if (!name) return toast('Name is required', 'error');
    if (newPass && newPass.length < 6) return toast('New password must be at least 6 characters', 'error');

    loading(true);
    const payload = { name, phone };
    if (newPass) payload.new_password = newPass;
    const res = await api('profile.php?action=update', payload, 'POST');
    loading(false);

    if (res.success) {
      toast('Profile updated ✅', 'success');
      if ($('profile-new-password')) $('profile-new-password').value = '';
      State.user.name = name;
      $('dash-user-name') && ($('dash-user-name').textContent = name.split(' ')[0]);
      $('prov-user-name') && ($('prov-user-name').textContent = name.split(' ')[0]);
      $('profile-name-display').textContent = name;
    } else toast(res.message, 'error');
  },

  logout() {
    Modal.show(`
      <div style="text-align:center;padding:8px 0">
        <div style="font-size:2.5rem;margin-bottom:10px">👋</div>
        <h3 style="font-weight:800;margin-bottom:8px">Sign out?</h3>
        <p style="font-size:.88rem;color:var(--gray);margin-bottom:20px">You'll need to sign in again.</p>
        <div style="display:flex;gap:10px">
          <button class="btn-outline" style="flex:1" onclick="Modal.close()">Cancel</button>
          <button class="btn-primary" style="flex:1" onclick="Profile._doLogout()">Sign Out</button>
        </div>
      </div>`);
  },

  async _doLogout() {
    Modal.close();
    loading(true);
    await api('auth.php?action=logout');
    loading(false);

    // Reset all state
    State.user        = null;
    State.cart        = [];
    State.chatRideId  = null;
    State.chatLastMsgId = 0;
    Chat.stopPolling();
    clearInterval(State.rideTimer);
    clearInterval(State.providerTimer);
    Food.all      = [];
    Food._fetched = 0;

    // Return to auth screen
    qsa('.screen').forEach(s => s.classList.remove('active-screen'));
    $('screen-auth').classList.add('active-screen');
    State.currentScreen = 'screen-auth';

    // Clear login fields
    $('login-email').value    = '';
    $('login-password').value = '';
    switchAuthTab('login');

    toast('Signed out. See you soon! 👋', 'info');
  }
};

// ── BOOTSTRAP ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Close any open notification panel on outside click
  document.addEventListener('click', e => {
    if (State.notifOpen &&
        !e.target.closest('#notif-panel') &&
        !e.target.closest('.notif-btn')) {
      $('notif-panel')?.classList.add('hidden');
      State.notifOpen = false;
    }
    if (State.provNotifOpen &&
        !e.target.closest('#prov-notif-panel') &&
        !e.target.closest('.notif-btn')) {
      $('prov-notif-panel')?.classList.add('hidden');
      State.provNotifOpen = false;
    }
  });

  Auth.checkSession();
});
