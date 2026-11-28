/* StudentDays live mode.
   Connects the prototype screens to the real backend (sign-up/sign-in, trips, booking, Razorpay, tickets, My Trips, cancel, notify-me).
   Active ONLY when window.SD_CONFIG.apiBase is set in config.js. With apiBase empty the app stays a demo.
   Passport, VibeMate, Anonymous Chat, Updates and the in-app admin are still demo data (later phases). */
(function () {
  const CFG = window.SD_CONFIG || {};
  if (!CFG.apiBase) return;
  window.SD_LIVE = true;
  const BASE = CFG.apiBase === 'same-origin' ? '' : String(CFG.apiBase).replace(/\/+$/, '');
  const MIN_AGE = CFG.minAge || 18;

  /* ---------- session storage (tokens). Move to Keychain/Keystore plugin before store release. ---------- */
  const LS = window.localStorage;
  const store = {
    get a() { return LS.getItem('sd_a'); }, get r() { return LS.getItem('sd_r'); },
    set(a, r) { LS.setItem('sd_a', a); LS.setItem('sd_r', r); },
    clear() { LS.removeItem('sd_a'); LS.removeItem('sd_r'); },
  };
  const uuid = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID() : 'k' + Date.now() + Math.random().toString(16).slice(2));

  /* ---------- API client ---------- */
  class ApiError extends Error { constructor(s, c, m) { super(m); this.status = s; this.code = c; } }
  const msgOf = (e) => {
    if (e && e.code === 'validation') { try { return Object.values(JSON.parse(e.message)).join(' '); } catch (_) { /* plain text */ } }
    return (e && e.message) || 'Something went wrong. Please try again.';
  };
  async function raw(method, path, body, token, idem) {
    let r;
    try {
      r = await fetch(BASE + path, {
        method,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(idem ? { 'Idempotency-Key': idem } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (_) { throw new ApiError(0, 'network', 'No internet connection. Please try again.'); }
    let j = null; try { j = await r.json(); } catch (_) { /* empty */ }
    if (!r.ok) { const er = (j && j.error) || {}; throw new ApiError(r.status, er.code || 'error', er.message || 'Request failed'); }
    return j;
  }
  let refreshing = null;
  const refreshTokens = () => {
    if (!refreshing) refreshing = raw('POST', '/v1/auth/refresh', { refreshToken: store.r }).then((t) => { store.set(t.accessToken, t.refreshToken); return t; }).finally(() => { refreshing = null; });
    return refreshing;
  };
  async function api(method, path, body, idem) {
    try { return await raw(method, path, body, store.a, idem); } catch (e) {
      if (e.status === 401 && store.r) {
        try { await refreshTokens(); } catch (_) { store.clear(); throw e; }
        return raw(method, path, body, store.a, idem);
      }
      throw e;
    }
  }
  window.SDAPI = { api, raw };

  /* ---------- helpers ---------- */
  const cityName = (id) => CITIES.find((c) => c.toLowerCase() === id) || '';
  const cityId = (n) => String(n || '').toLowerCase();
  const inr = (paise) => money(paise / 100);
  const fd = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  const range = (b) => fd(b.startDate) + ' to ' + fd(b.endDate);
  let cityOnly = false;
  function setMe(s) {
    meStu = { id: s.id, name: s.name, mobile: s.mobile, email: s.email, college: s.college, year: s.year, age: s.age, city: cityName(s.cityId), status: 'active', joined: Date.now() };
    city = meStu.city;
    if (!students.find((x) => x.id === meStu.id)) students.push(meStu);
    updateDot();
  }

  /* ---------- screens and fields added in live mode ---------- */
  const yr = $('yr');
  if (yr) ['PG 1st year', 'PG 2nd year'].forEach((y) => { const o = document.createElement('option'); o.textContent = y; yr.appendChild(o); });
  ['mob-c', 'eml-c'].forEach((id) => { const el = $(id); if (el) { el.maxLength = 6; el.placeholder = 'Enter 6-digit OTP'; } });
  const hint = document.querySelector('#signin .hint');
  if (hint) hint.outerHTML = '<label class="chk"><input type="checkbox" id="consent" onchange="chk()"><span>I agree to the <a class="lnk" style="margin:0" onclick="showPolicy(\'terms\')">Terms</a> and <a class="lnk" style="margin:0" onclick="showPolicy(\'privacy\')">Privacy Policy</a>. You must be ' + MIN_AGE + ' or older.</span></label>';
  const ageEl = $('age'); if (ageEl) ageEl.placeholder = 'Age (' + MIN_AGE + '+)';
  const st = document.createElement('style');
  st.textContent = '.skipb{display:none!important}';
  document.head.appendChild(st);
  window.addEventListener('load', () => document.body.classList.add('prod')); // demo-only Admin/Host buttons stay hidden in live mode
  const wb = document.querySelectorAll('#welcome .mrow .btn'); if (wb[1]) wb[1].setAttribute('onclick', "go('login')");
  $('app').insertAdjacentHTML('beforeend',
    '<section class="screen" id="login"><div class="toprow"><button class="back" style="width:40px;height:40px" onclick="go(\'welcome\')" aria-label="Back">&lsaquo;</button></div>' +
    '<h1>Welcome back</h1><p class="sub">Sign in with your mobile number.</p>' +
    '<label>Mobile number</label><div class="row"><input id="lg-mob" inputmode="numeric" maxlength="10" placeholder="10-digit number"><button class="btn-s" onclick="lgSend()">Send OTP</button></div>' +
    '<div class="otp" id="lg-o"><input id="lg-c" inputmode="numeric" maxlength="6" placeholder="Enter 6-digit OTP"></div>' +
    '<div class="err" id="lg-err"></div><div class="spacer"></div>' +
    '<button class="btn" id="lgBtn" onclick="lgGo()" style="margin-top:20px">Sign in</button>' +
    '<p style="text-align:center;margin-top:14px"><a class="lnk" onclick="go(\'signin\')">New here? Create an account</a></p></section>');
  const av = document.querySelector('#home .hd2 .av'); if (av) av.setAttribute('onclick', 'profileMenu()');

  /* ---------- sign-up (real OTP) ---------- */
  const proofs = {};
  window.sendOtp = async function (k) {
    const val = $(k).value.trim();
    if (k === 'mob' && !/^[6-9]\d{9}$/.test(val)) return alert('Enter a valid 10-digit Indian mobile number.');
    if (k === 'eml' && !/^\S+@\S+\.\S+$/.test(val)) return alert('Enter a valid email address.');
    try {
      const r = await raw('POST', '/v1/auth/otp/send', { channel: k === 'mob' ? 'mobile' : 'email', target: val });
      $(k + '-o').classList.add('on'); $(k + '-c').focus();
      toast(r.devOtp ? 'Test OTP: ' + r.devOtp : 'OTP sent');
    } catch (e) { alert(msgOf(e)); }
  };
  window.verify = async function (k) {
    const c = $(k + '-c').value.trim();
    if (!/^\d{6}$/.test(c) || proofs['busy' + k]) return;
    proofs['busy' + k] = true;
    try {
      const target = $(k).value.trim();
      const r = await raw('POST', '/v1/auth/otp/verify', { channel: k === 'mob' ? 'mobile' : 'email', target, code: c });
      proofs[k] = { target, proof: r.proof };
      $(k + '-o').classList.remove('on');
    } catch (e) { alert(msgOf(e)); $(k + '-c').value = ''; } finally { proofs['busy' + k] = false; chk(); }
  };
  window.chk = function () {
    ['mob', 'eml'].forEach((k) => { const p = proofs[k]; const ok = !!p && p.target === $(k).value.trim(); ver[k] = ok; $(k + '-ok').classList.toggle('on', ok); });
    const ok = $('name').value.trim() && ver.mob && ver.eml && $('col').value.trim() && $('yr').value && $('cid').value.trim().length >= 3 && +$('age').value >= MIN_AGE && $('consent') && $('consent').checked;
    $('signBtn').disabled = !ok;
  };
  window.reveal = async function () {
    const btn = $('cityBtn'); btn.disabled = true;
    let student;
    try {
      if (!cityOnly) {
        const t = await raw('POST', '/v1/auth/signup', {
          name: $('name').value.trim(), mobile: $('mob').value.trim(), email: $('eml').value.trim(), college: $('col').value.trim(), year: $('yr').value,
          age: +$('age').value, collegeId: $('cid').value.trim(), consent: { terms: true, privacy: true },
          mobileProof: proofs.mob && proofs.mob.proof, emailProof: proofs.eml && proofs.eml.proof, device: navigator.userAgent.slice(0, 80),
        });
        store.set(t.accessToken, t.refreshToken);
      }
      await api('PATCH', '/v1/me/city', { cityId: cityId(city) });
      student = await api('GET', '/v1/me');
    } catch (e) { btn.disabled = false; alert(msgOf(e)); if (!cityOnly) go('signin'); return; }
    setMe(student);
    const plain = cityOnly; cityOnly = false;
    const l = $('logo'), v = $('veil');
    go('home');
    if (plain) return;
    l.classList.remove('head'); l.style.transition = 'opacity .5s ease';
    v.style.transition = 'none'; v.style.display = 'block'; v.style.opacity = '1'; void v.offsetWidth;
    l.classList.add('show');
    setTimeout(() => { l.style.transition = ''; l.classList.add('head'); v.style.transition = 'opacity 1.1s ease'; v.style.opacity = '0'; }, 900);
    setTimeout(() => { v.style.display = 'none'; }, 2200);
    if (vmJoin === 'yes' && !vmMe()) setTimeout(() => { vmFromSignup = true; vmStartOnboard(false); }, 2700);
  };

  /* ---------- sign-in, session restore, logout ---------- */
  const lgErr = (m) => { $('lg-err').textContent = m; };
  window.lgSend = async function () {
    const v = $('lg-mob').value.trim();
    if (!/^[6-9]\d{9}$/.test(v)) return lgErr('Enter a valid 10-digit mobile number.');
    try {
      const r = await raw('POST', '/v1/auth/otp/send', { channel: 'mobile', target: v });
      $('lg-o').classList.add('on'); $('lg-c').focus(); lgErr(''); toast(r.devOtp ? 'Test OTP: ' + r.devOtp : 'OTP sent');
    } catch (e) { lgErr(msgOf(e)); }
  };
  window.lgGo = async function () {
    const mob = $('lg-mob').value.trim(), code = $('lg-c').value.trim();
    if (!/^[6-9]\d{9}$/.test(mob)) return lgErr('Enter a valid 10-digit mobile number.');
    if (!/^\d{6}$/.test(code)) return lgErr('Enter the 6-digit OTP.');
    const b = $('lgBtn'); b.disabled = true; lgErr('');
    try {
      const v = await raw('POST', '/v1/auth/otp/verify', { channel: 'mobile', target: mob, code });
      const t = await raw('POST', '/v1/auth/login', { mobile: mob, proof: v.proof });
      store.set(t.accessToken, t.refreshToken);
      setMe(t.student);
      if (!t.student.cityId) { cityOnly = true; go('city'); } else go('home');
    } catch (e) { lgErr(msgOf(e)); } finally { b.disabled = false; }
  };
  window.introDone = async function () {
    if (!stopIntro()) return; // only once: a skipped intro video must never navigate again when it ends
    if (store.a || store.r) {
      try {
        const s = await api('GET', '/v1/me'); setMe(s);
        if (!s.cityId) { cityOnly = true; go('city'); return; }
        go('home'); return;
      } catch (e) { if (e.status !== 0) store.clear(); }
    }
    go('welcome');
  };
  window.profileMenu = function () {
    actions('Account', [
      ['My trips', () => { mytab = 'upcoming'; openTrips(); seg('my'); }],
      ['Terms and Conditions', () => showPolicy('terms')], ['Privacy Policy', () => showPolicy('privacy')], ['Refund and Cancellation', () => showPolicy('refund')],
      ['Log out', async () => { try { await api('POST', '/v1/auth/logout', { refreshToken: store.r }); } catch (_) { /* ignore */ } store.clear(); location.reload(); }],
      ['Delete my account', () => sheet('Delete your account?', 'Your personal data will be removed. Payment records are kept as required by law. This cannot be undone.', 'Delete', async () => {
        try { await api('DELETE', '/v1/me'); store.clear(); location.reload(); } catch (e) { toast(msgOf(e)); }
      }), true],
    ]);
  };
  window.showPolicy = async function (type) {
    try { const p = await raw('GET', '/v1/policies/' + type); sheet({ terms: 'Terms and Conditions', privacy: 'Privacy Policy', refund: 'Refund and Cancellation Policy' }[type] || 'Policy', p.body, 'Close'); } catch (e) { toast(msgOf(e)); }
  };
  window.policy = () => showPolicy('refund');

  /* ---------- trips (availability and prices come from the server) ---------- */
  const SLUG = { 1: 'araku-vanjangi', 2: 'manali' };
  const _openTrip = window.openTrip;
  window.openTrip = async function (id) {
    const t = tr(id);
    if (!t.soon) {
      try { t.batches = (await api('GET', '/v1/trips/' + SLUG[id])).batches.filter((b) => b.bookable); } catch (e) { t.batches = []; if (e.status === 0) toast('Could not load latest availability'); }
      if (t.batches.length) { const b = t.batches[0]; t.p = b.packagePricePaise / 100; t.pre = b.prebookPricePaise / 100; t.when = range(b); }
    }
    _openTrip(id);
    if (!t.soon && !t.batches.length) {
      const bar = document.querySelector('#tdetail .bar');
      if (bar) bar.innerHTML = '<div><strong>Booking opens soon</strong><small>No batch is open right now</small></div><button class="btn" disabled>Pre-book now</button>';
    }
  };

  /* ---------- booking ---------- */
  const saveTrv = () => { cur.travs.forEach((t, i) => { const n = $('tn' + i), g = $('tg' + i); if (n) t.name = n.value; if (g) t.gender = g.value; }); };
  function trvRender() {
    $('trv').innerHTML = cur.travs.map((t, i) =>
      '<input id="tn' + i + '" placeholder="Traveller ' + (i + 1) + ' name (as on ID)" value="' + esc(t.name) + '" style="margin-bottom:8px">' +
      '<select id="tg' + i + '" style="margin-bottom:10px"><option value="">Gender (for room allocation)</option>' +
      ['male', 'female', 'other'].map((g) => '<option value="' + g + '"' + (t.gender === g ? ' selected' : '') + '>' + g[0].toUpperCase() + g.slice(1) + '</option>').join('') + '</select>').join('');
  }
  window.startBook = function () {
    const bs = cur.batches || [];
    if (!bs.length) return toast('No open batch right now');
    qty = 1; cur.batch = bs[0]; cur.travs = [{ name: (meStu && meStu.name) || '', gender: '' }]; cur.idem = uuid();
    $('book').innerHTML = '<div class="hdr"><button class="back" onclick="go(\'tdetail\')">&lsaquo;</button><div><h1>Pre-book your seat</h1><p>' + esc(cur.t) + '</p></div></div>' +
      '<label>Batch</label><select id="bsel" onchange="setBatch(this.value)">' + bs.map((b) => '<option value="' + b.id + '">' + range(b) + ' (' + b.seatsAvailable + ' seats left)</option>').join('') + '</select>' +
      '<label>Travellers</label><div class="stp"><span>Students</span><div><button onclick="step(-1)">\u2212</button><span id="q">1</span><button onclick="step(1)">+</button></div></div><div id="trv"></div>' +
      '<label>Emergency contact</label><input id="en" placeholder="Contact name" style="margin-bottom:8px"><input id="ep" inputmode="numeric" maxlength="10" placeholder="10-digit mobile number">' +
      '<label>Price details</label><div class="bd" id="bd"></div>' +
      '<label class="chk"><input type="checkbox" id="ra"><span>I accept the <a class="lnk" style="margin:0" onclick="policy()">Refund and Cancellation Policy</a>.</span></label><div class="err" id="err"></div>' +
      '<div class="bar"><div><strong id="tot"></strong><small>Pay now</small></div><button class="btn" onclick="pay()">Pay now</button></div>';
    trvRender(); price(); go('book'); $('book').scrollTop = 0;
  };
  window.setBatch = function (id) { saveTrv(); cur.batch = cur.batches.find((b) => b.id === id); qty = Math.min(qty, cur.batch.seatsAvailable); cur.travs.length = qty; $('q').textContent = qty; trvRender(); price(); };
  window.step = function (d) {
    saveTrv(); const n = Math.max(1, Math.min(6, cur.batch.seatsAvailable, qty + d)); qty = n;
    while (cur.travs.length < n) cur.travs.push({ name: '', gender: '' });
    cur.travs.length = n; $('q').textContent = n; trvRender(); price();
  };
  window.price = function () {
    const n = qty, b = cur.batch, p = b.packagePricePaise / 100, pre = b.prebookPricePaise / 100;
    $('bd').innerHTML = '<p><span>Package price (' + money(p) + ' \u00D7 ' + n + ')</span><span>' + money(p * n) + '</span></p><p><span>Pre-booking due now</span><span>' + money(pre * n) + '</span></p><p class="t"><span>Balance before the trip</span><span>' + money((p - pre) * n) + '</span></p>';
    $('tot').textContent = money(pre * n);
  };
  async function collect(order) {
    if (order.mock) { const m = await api('POST', '/v1/dev/mock-pay', { orderId: order.orderId }); toast('Test payment: no real money charged'); return m; }
    await loadRzp();
    return new Promise((res, rej) => {
      const rz = new Razorpay({
        key: order.keyId, amount: order.amountPaise, currency: order.currency, order_id: order.orderId, name: 'StudentDays.co', description: 'Trip booking',
        prefill: { name: meStu && meStu.name, contact: meStu && meStu.mobile, email: meStu && meStu.email }, theme: { color: '#0a6cff' },
        handler: (r) => res({ orderId: r.razorpay_order_id, paymentId: r.razorpay_payment_id, signature: r.razorpay_signature }),
        modal: { ondismiss: () => rej(new Error('Payment cancelled. Nothing was charged.')) },
      });
      rz.on('payment.failed', (x) => rej(new Error((x.error && x.error.description) || 'Payment failed. Nothing was charged.')));
      rz.open();
    });
  }
  async function verifyPay(proof) {
    try { return await api('POST', '/v1/payments/verify', proof); } catch (e) {
      throw new Error('We are confirming your payment. Check My Trips in a minute. If money was deducted and nothing shows, contact support.');
    }
  }
  window.pay = async function () {
    const e = (m) => { $('err').textContent = m; return false; };
    saveTrv();
    for (const t of cur.travs) { if (t.name.trim().length < 2) return e('Enter each traveller\u2019s name as on their ID.'); if (!t.gender) return e('Select a gender for each traveller (needed for room allocation).'); }
    if (!$('en').value.trim()) return e('Enter an emergency contact name.');
    if (!/^[6-9]\d{9}$/.test($('ep').value)) return e('Enter a valid 10-digit emergency number.');
    if (!$('ra').checked) return e('Accept the Refund and Cancellation Policy to continue.');
    e('');
    const btn = document.querySelector('#book .bar .btn'); btn.disabled = true; btn.textContent = 'Processing\u2026';
    try {
      const bk = await api('POST', '/v1/bookings', {
        batchId: cur.batch.id, acceptRefundPolicy: true,
        travellers: cur.travs.map((t) => ({ name: t.name.trim(), gender: t.gender })), emergency: { name: $('en').value.trim(), mobile: $('ep').value },
      }, cur.idem);
      const order = await api('POST', '/v1/payments/order', { bookingId: bk.id, purpose: 'prebook' });
      const proof = await collect(order);
      await verifyPay(proof);
      showDone(await api('GET', '/v1/bookings/' + bk.id + '/ticket'));
    } catch (err) {
      if (err.code === 'hold_expired' || err.code === 'not_enough_seats' || err.code === 'sold_out') cur.idem = uuid();
      e(msgOf(err));
    } finally { btn.disabled = false; btn.textContent = 'Pay now'; }
  };
  window.showDone = function (tk) {
    const bal = tk.balanceDuePaise;
    $('done').innerHTML = '<div class="hdr"><div><h1>' + (bal > 0 ? 'Seat pre-booked' : 'Fully paid') + '</h1><p>Show this ticket at the pickup point</p></div></div>' +
      '<div class="tk"><b style="font-size:18px">' + esc(tk.trip) + '</b><div style="color:#bbb;font-size:13px;margin-top:4px">' + range(tk) + ' \u2022 ' + tk.seats + ' student' + (tk.seats > 1 ? 's' : '') + '</div>' +
      '<div style="margin:12px auto;width:190px;height:190px;background:#fff;border-radius:12px;overflow:hidden">' + SDQR.svg(tk.qrToken, 190) + '</div>' +
      '<code>SD-' + tk.id.slice(0, 8).toUpperCase() + '</code>' +
      '<div style="color:#bbb;font-size:13px;margin-top:12px">Paid ' + inr(tk.paidPaise) + (bal > 0 ? ' \u2022 Balance ' + inr(bal) + ' due' + (tk.balanceDueDate ? ' by ' + fd(tk.balanceDueDate) : ' before the trip') : '') + '</div>' +
      '<div style="color:#bbb;font-size:12px;margin-top:8px">' + tk.travellers.map((t) => esc(t.name)).join(', ') + '</div></div>' +
      '<div class="mrow"><button class="btn" onclick="myReceipt(\'' + tk.id + '\')">Receipt</button></div><div class="spacer"></div>' +
      '<button class="btn" onclick="mytab=\'upcoming\';openTrips();seg(\'my\')" style="margin-top:20px">View my trips</button>';
    go('done');
  };

  /* ---------- My Trips ---------- */
  const LABEL = { pending_payment: 'Awaiting payment', confirmed: 'Pre-booked', fully_paid: 'Fully paid', completed: 'Completed', cancelled: 'Cancelled', refunded: 'Refunded', expired: 'Expired', no_show: 'No show' };
  window.renderMy = async function () {
    $('mychips').innerHTML = ['upcoming', 'completed', 'cancelled'].map((x) => '<button class="chip' + (x === mytab ? ' on' : '') + '" onclick="mytab=\'' + x + '\';renderMy()">' + x[0].toUpperCase() + x.slice(1) + '</button>').join('');
    const box = $('mlist'); box.innerHTML = '<div class="empty">Loading\u2026</div>';
    let l;
    try { l = await api('GET', '/v1/bookings?tab=' + mytab); } catch (e) { box.innerHTML = '<div class="empty">Could not load your trips.<br>' + esc(msgOf(e)) + '</div>'; return; }
    box.innerHTML = l.length ? l.map((b) => {
      const paid = b.status === 'confirmed' || b.status === 'fully_paid';
      return '<div class="tcard"><div class="tb"><div style="display:flex;justify-content:space-between;align-items:center"><b>' + esc(b.trip) + '</b><span class="st ' + mytab + '">' + (b.cancelRequested ? 'Cancellation requested' : LABEL[b.status] || b.status) + '</span></div>' +
        '<div class="m">' + range(b) + ' \u2022 ' + b.seats + ' student' + (b.seats > 1 ? 's' : '') + '</div><div class="m">Paid ' + inr(b.paidPaise) + ' \u2022 Balance ' + inr(b.balanceDuePaise) + '</div><div class="m">Booking SD-' + b.id.slice(0, 8).toUpperCase() + '</div>' +
        '<div class="mrow">' + (paid ? '<button class="btn" onclick="myTicket(\'' + b.id + '\')">Ticket</button>' : '') +
        (b.status === 'confirmed' && b.balanceDuePaise > 0 && !b.cancelRequested ? '<button class="btn" onclick="payBalance(\'' + b.id + '\')">Pay balance</button>' : '') +
        (paid && !b.cancelRequested ? '<button class="btn" onclick="cancelB(\'' + b.id + '\')">Cancel</button>' : '') +
        (b.paidPaise > 0 ? '<button class="btn" onclick="myReceipt(\'' + b.id + '\')">Receipt</button>' : '') + '</div></div></div>';
    }).join('') : '<div class="empty">No ' + mytab + ' trips.<br>Explore upcoming trips to pre-book your seat.</div>';
  };
  window.myTicket = async (id) => { try { showDone(await api('GET', '/v1/bookings/' + id + '/ticket')); } catch (e) { toast(msgOf(e)); } };
  window.myReceipt = async (id) => {
    try {
      const r = await api('GET', '/v1/bookings/' + id + '/receipt');
      sheet('Receipt', r.booking.trip + '\n' + range(r.booking) + '\n\n' + (r.payments.length ? r.payments.map((p) => (p.purpose === 'prebook' ? 'Pre-booking' : 'Balance') + ': ' + inr(p.amountPaise) + '\n' + (p.paymentId || '')).join('\n\n') : 'No payments yet.') + '\n\nA GST invoice will be added once finance confirms the format.', 'Close');
    } catch (e) { toast(msgOf(e)); }
  };
  window.payBalance = async function (id) {
    try {
      toast('Starting payment\u2026');
      const order = await api('POST', '/v1/payments/order', { bookingId: id, purpose: 'balance' });
      await verifyPay(await collect(order));
      toast('Balance paid. Thank you!'); renderMy();
    } catch (e) { toast(msgOf(e)); }
  };
  window.cancelB = async function (id) {
    try {
      const p = await api('POST', '/v1/bookings/' + id + '/cancel-request', {});
      const r = p.refund;
      const txt = r.configured ? 'Based on the cancellation policy you would get ' + r.refundPct + '% back (' + inr(r.refundPaise) + ').' : 'The refund amount will be confirmed by our team under the Refund and Cancellation Policy.';
      sheet('Cancel this booking?', txt + '\n\nThis sends a cancellation request. Your seat is released once our team confirms it.', 'Request cancellation', async () => {
        try { await api('POST', '/v1/bookings/' + id + '/cancel-request', { confirm: true }); toast('Cancellation requested'); renderMy(); } catch (e) { toast(msgOf(e)); }
      });
    } catch (e) { toast(msgOf(e)); }
  };

  /* ---------- notify me ---------- */
  const notify = async (body, okMsg) => { try { await api('POST', '/v1/notify-requests', body); toast(okMsg); return true; } catch (e) { toast(msgOf(e)); return false; } };
  window.nfSubmit = async function () {
    const err = (m) => { $('nf-e').textContent = m; };
    if (nf.name.trim().length < 2) return err('Enter your name.');
    if (!/^[6-9]\d{9}$/.test(nf.mob.trim())) return err('Enter a valid 10-digit mobile number.');
    if (!nf.mode) return err('Choose Solo or Group.');
    if (nf.mode === 'Group' && nf.n < 2) return err('Group size must be 2 or more.');
    if (!nf.s || !nf.e) return err('Choose your start and end dates.');
    if (nf.e < nf.s || nf.e > addD(nf.s, 6)) return err('Choose a window of up to 7 days.');
    try {
      await api('POST', '/v1/notify-requests', { target: 'manali', name: nf.name.trim(), mobile: nf.mob.trim(), mode: nf.mode.toLowerCase(), groupSize: nf.n, windowStart: nf.s, windowEnd: nf.e });
      nfClose(); toast('You\u2019re on the list. We\u2019ll notify you.');
    } catch (e) { err(msgOf(e)); }
  };
  window.showOpen = () => sheet('Student Reality Travel Show', 'Two influencers are given a fixed amount of money and a random destination. They have to travel and survive with only that amount, while our cameraman follows and records every moment.\n\nLaunching soon on StudentDays Originals.', 'Notify me', () => notify({ target: 'reality-show' }, 'We\u2019ll notify you when the show launches'));
  window.evtOpen = () => sheet('Students NYE 2027', 'The Biggest Students\u2019 New Year Party!\n\n31 Dec 2026 \u2022 Hyderabad\n\n\u2022 Live DJ\n\u2022 Dance floor\n\u2022 Food & drinks\n\u2022 Games & giveaways\n\u2022 Photo & video zone\n\nBigger vibes. Student community. Unforgettable night.', 'Notify me', () => notify({ target: 'nye-2027' }, 'We\u2019ll notify you about NYE 2027'));
})();
