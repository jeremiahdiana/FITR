(function () {
  // Escape HTML to prevent XSS via user-controlled data in innerHTML
  function esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  }

  var userData = null;
  try { userData = JSON.parse(localStorage.getItem('fitr_user')); } catch (e) {}

  var signInLink = document.getElementById('navSignInLink');
  var mobileSignInLink = document.getElementById('navMobileSignInLink');
  var navUser = document.getElementById('navUser');

  if (!userData) return;

  // Validate stored data — if it looks tampered, clear it
  if (typeof userData !== 'object' || typeof userData.email !== 'string') {
    localStorage.removeItem('fitr_user');
    return;
  }

  // Hide sign-in links
  if (signInLink) signInLink.style.display = 'none';
  if (mobileSignInLink) mobileSignInLink.style.display = 'none';

  // Show authenticated mobile links
  var mobileAccount  = document.getElementById('navMobileAccount');
  var mobileOrders   = document.getElementById('navMobileOrders');
  var mobileWishlist = document.getElementById('navMobileWishlist');
  if (mobileAccount)  mobileAccount.style.display  = 'block';
  if (mobileOrders)   mobileOrders.style.display   = 'block';
  if (mobileWishlist) mobileWishlist.style.display  = 'block';

  if (!navUser) return;

  // Escape all user-controlled values before inserting into innerHTML
  var rawName = userData.displayName || userData.email || 'Account';
  var initial = esc(rawName.charAt(0).toUpperCase());
  var displayName = esc(rawName.slice(0, 60));

  navUser.style.display = 'flex';
  navUser.innerHTML =
    '<div class="nav-user-wrap">' +
      '<button class="nav-user-btn" id="navUserBtn">' +
        '<span class="nav-user-avatar">' + initial + '</span>' +
        '<span class="nav-user-name">' + displayName + '</span>' +
        '<span class="nav-user-caret">&#9660;</span>' +
      '</button>' +
      '<div class="nav-user-dropdown" id="navUserDropdown">' +
        '<a href="account.html" class="nav-dd-item">&#9881; My Account</a>' +
        '<a href="orders.html" class="nav-dd-item">&#128666; My Orders</a>' +
        '<a href="wishlist.html" class="nav-dd-item">&#9825; Wishlist</a>' +
        '<div class="nav-dd-divider"></div>' +
        '<a href="https://sell.joinfitr.com" class="nav-dd-item" style="color:#00A87D;font-weight:700;">&#127978; Business Dashboard</a>' +
        '<div class="nav-dd-divider"></div>' +
        '<button class="nav-dd-item nav-dd-signout" id="navSignOutBtn">Sign Out</button>' +
      '</div>' +
    '</div>';

  // Toggle dropdown
  document.getElementById('navUserBtn').addEventListener('click', function (e) {
    e.stopPropagation();
    document.getElementById('navUserDropdown').classList.toggle('open');
  });

  // Close on outside click
  document.addEventListener('click', function () {
    var dd = document.getElementById('navUserDropdown');
    if (dd) dd.classList.remove('open');
  });

  // Sign out — clear all FITR storage
  document.getElementById('navSignOutBtn').addEventListener('click', function () {
    localStorage.removeItem('fitr_user');
    localStorage.removeItem('fitr_cart');
    sessionStorage.removeItem('fitrCart');
    window.location.href = 'auth.html';
  });

  // ── Notifications bell ──
  var bellWrap = document.getElementById('navBellWrap');
  if (bellWrap) {
    bellWrap.style.display = 'flex';
    bellWrap.innerHTML =
      '<div class="nav-bell-wrap">' +
        '<button class="nav-bell-btn" id="navBellBtn" aria-label="Notifications">' +
          '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
            '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>' +
            '<path d="M13.73 21a2 2 0 0 1-3.46 0"/>' +
          '</svg>' +
          '<span class="bell-badge" id="bellBadge" style="display:none">0</span>' +
        '</button>' +
        '<div class="bell-dropdown" id="bellDropdown">' +
          '<div class="bell-dd-header">' +
            '<span>Notifications</span>' +
            '<button class="bell-mark-all" id="bellMarkAll">Mark all read</button>' +
          '</div>' +
          '<div class="bell-dd-list" id="bellList"><div class="bell-empty">No notifications yet.</div></div>' +
        '</div>' +
      '</div>';

    document.getElementById('navBellBtn').addEventListener('click', function(e) {
      e.stopPropagation();
      var dd = document.getElementById('bellDropdown');
      dd.classList.toggle('open');
    });

    document.addEventListener('click', function() {
      var dd = document.getElementById('bellDropdown');
      if (dd) dd.classList.remove('open');
    });

    // Called by page module scripts once Firebase is ready: initBellNotifications(db, uid, firestoreModule)
    window.initBellNotifications = function(db, uid, fs) {
      if (!db || !uid || !fs) return;
      var { collection, query, orderBy, limit, onSnapshot, writeBatch } = fs;
      if (!collection || !onSnapshot) return;

      var notifQ = query(
        collection(db, 'users', uid, 'notifications'),
        orderBy('createdAt', 'desc'),
        limit(20)
      );

      onSnapshot(notifQ, function(snap) {
        var items  = snap.docs.map(function(d) { return Object.assign({ id: d.id }, d.data()); });
        var unread = items.filter(function(n) { return !n.read; }).length;
        if (window.setBellCount) window.setBellCount(unread);
        if (window.setBellItems) window.setBellItems(items.map(function(n) {
          return { title: n.title, body: n.body, link: n.link || '#', read: !!n.read };
        }));
      }, function() { /* silent error — user may not have notifications collection */ });

      // Mark all read when bell opens
      document.addEventListener('click', function(e) {
        if (e.target && e.target.id === 'bellMarkAll') {
          snap && snap.docs && snap.docs.forEach && (function() {
            // re-fetch inside handler is tricky without closure — use getDocs
            if (db && writeBatch && collection) {
              import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js').then(function(m) {
                m.getDocs(notifQ).then(function(s) {
                  var b = m.writeBatch(db);
                  s.docs.forEach(function(d) { if (!d.data().read) b.update(d.ref, { read: true }); });
                  b.commit();
                });
              });
            }
          })();
        }
      });
    };

    // Allow external module to update badge
    window.setBellCount = function(n) {
      var badge = document.getElementById('bellBadge');
      if (!badge) return;
      if (n > 0) {
        badge.textContent = n > 99 ? '99+' : String(n);
        badge.style.display = 'flex';
      } else {
        badge.style.display = 'none';
      }
    };

    window.setBellItems = function(items) {
      var list = document.getElementById('bellList');
      if (!list) return;
      if (!items || !items.length) {
        list.innerHTML = '<div class="bell-empty">No notifications yet.</div>';
        return;
      }
      list.innerHTML = items.map(function(n) {
        return '<a class="bell-item' + (n.read ? '' : ' unread') + '" href="' + esc(n.link || '#') + '">' +
          '<div class="bell-item-title">' + esc(n.title) + '</div>' +
          '<div class="bell-item-body">' + esc(n.body || '') + '</div>' +
        '</a>';
      }).join('');
    };
  }

  // ── Cart icon ──
  var cartWrap = document.getElementById('navCartWrap');
  if (cartWrap) {
    function getCartCount() {
      try {
        var items = JSON.parse(localStorage.getItem('fitr_cart') || '[]');
        return Array.isArray(items) ? items.length : 0;
      } catch(e) { return 0; }
    }

    var count = getCartCount();
    // Build cart icon without user data — no XSS surface
    var cartLink = document.createElement('a');
    cartLink.href = 'shop.html';
    cartLink.className = 'nav-cart-btn';
    cartLink.id = 'navCartIconBtn';
    cartLink.innerHTML = '&#128722;';
    var badge = document.createElement('span');
    badge.className = 'nav-cart-badge' + (count > 0 ? ' show' : '');
    badge.id = 'navCartBadge';
    badge.textContent = String(count);
    cartLink.appendChild(badge);
    cartWrap.appendChild(cartLink);

    window.addEventListener('storage', function(e) {
      if (e.key === 'fitr_cart') {
        var n = getCartCount();
        var b = document.getElementById('navCartBadge');
        if (b) {
          b.textContent = String(n);
          b.classList.toggle('show', n > 0);
        }
      }
    });
  }
}());
