/* =====================================================
   Expense & Budget Visualizer — app.js
   ===================================================== */

'use strict';

/* ══════════════════════════════════════════════════════
   STORAGE KEYS
══════════════════════════════════════════════════════ */
const KEY_TX         = 'ebv_transactions';
const KEY_CATEGORIES = 'ebv_categories';
const KEY_THEME      = 'ebv_theme';

/* ══════════════════════════════════════════════════════
   BUILT-IN CATEGORIES  (never deletable)
══════════════════════════════════════════════════════ */
const BUILT_IN = [
  { name: 'Food',      color: '#ff6b6b', emoji: '🍔', builtIn: true },
  { name: 'Transport', color: '#4ecdc4', emoji: '🚌', builtIn: true },
  { name: 'Fun',       color: '#ffe66d', emoji: '🎉', builtIn: true },
];

/* ══════════════════════════════════════════════════════
   STATE
══════════════════════════════════════════════════════ */
let transactions = loadJSON(KEY_TX, []);
let customCats   = loadJSON(KEY_CATEGORIES, []);
let activeFilter = 'All';
let chart        = null;
let summaryVisible = false;
let summaryDate    = new Date();

/* ══════════════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════════════ */
function allCategories() {
  return [...BUILT_IN, ...customCats];
}

function categoryMeta(name) {
  return allCategories().find(c => c.name === name)
      || { name, color: '#94a3b8', emoji: '🏷️', builtIn: false };
}

function loadJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) || fallback; }
  catch { return fallback; }
}

function saveTransactions() { localStorage.setItem(KEY_TX, JSON.stringify(transactions)); }
function saveCustomCats()   { localStorage.setItem(KEY_CATEGORIES, JSON.stringify(customCats)); }

function formatCurrency(amount) {
  return '$' + amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function darken(hex, amount) {
  amount = amount || 30;
  const n = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, (n >> 16) - amount);
  const g = Math.max(0, ((n >> 8) & 0xff) - amount);
  const b = Math.max(0, (n & 0xff) - amount);
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

function hexToRgba(hex, alpha) {
  const n = parseInt(hex.replace('#', ''), 16);
  return 'rgba(' + ((n >> 16) & 0xff) + ',' + ((n >> 8) & 0xff) + ',' + (n & 0xff) + ',' + alpha + ')';
}

function parseLegacyDate(str) {
  if (!str) return null;
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

/* ══════════════════════════════════════════════════════
   DOM REFERENCES
══════════════════════════════════════════════════════ */
const form            = document.getElementById('transactionForm');
const itemNameInput   = document.getElementById('itemName');
const amountInput     = document.getElementById('amount');
const categorySelect  = document.getElementById('category');
const nameError       = document.getElementById('nameError');
const amountError     = document.getElementById('amountError');
const categoryError   = document.getElementById('categoryError');
const totalBalanceEl  = document.getElementById('totalBalance');
const txListEl        = document.getElementById('transactionList');
const txEmptyEl       = document.getElementById('txEmpty');
const txCountEl       = document.getElementById('txCount');
const chartEmptyEl    = document.getElementById('chartEmpty');
const filterBar       = document.getElementById('filterBar');

const btnTheme        = document.getElementById('btnTheme');
const themeIcon       = document.getElementById('themeIcon');
const btnSummary      = document.getElementById('btnSummary');

const summaryPanel       = document.getElementById('summaryPanel');
const summaryMonthLabel  = document.getElementById('summaryMonthLabel');
const summaryStats       = document.getElementById('summaryStats');
const summaryTableBody   = document.getElementById('summaryTableBody');
const summaryEmpty       = document.getElementById('summaryEmpty');
const btnPrevMonth       = document.getElementById('btnPrevMonth');
const btnNextMonth       = document.getElementById('btnNextMonth');
const btnCloseSummary    = document.getElementById('btnCloseSummary');

const catModalBackdrop   = document.getElementById('catModalBackdrop');
const btnAddCat          = document.getElementById('btnAddCat');
const btnModalClose      = document.getElementById('btnModalClose');
const newCatNameInput    = document.getElementById('newCatName');
const newCatColorInput   = document.getElementById('newCatColor');
const btnConfirmAddCat   = document.getElementById('btnConfirmAddCat');
const catNameError       = document.getElementById('catNameError');
const catListEl          = document.getElementById('catList');
const catListEmpty       = document.getElementById('catListEmpty');

/* ══════════════════════════════════════════════════════
   THEME
══════════════════════════════════════════════════════ */
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  themeIcon.textContent = theme === 'dark' ? '☀️' : '🌙';
  localStorage.setItem(KEY_THEME, theme);
  if (chart) {
    chart.options.plugins.legend.labels.color = theme === 'dark' ? '#e2e8f0' : '#1e1e2e';
    chart.update();
  }
}

function currentTheme() {
  return document.documentElement.getAttribute('data-theme') || 'light';
}

btnTheme.addEventListener('click', function () {
  applyTheme(currentTheme() === 'dark' ? 'light' : 'dark');
});

// Restore saved theme or respect OS preference
(function initTheme() {
  const saved = localStorage.getItem(KEY_THEME);
  if (saved) {
    applyTheme(saved);
  } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    applyTheme('dark');
  } else {
    applyTheme('light');
  }
})();

/* ══════════════════════════════════════════════════════
   CATEGORY SELECT — populate
══════════════════════════════════════════════════════ */
function populateCategorySelect() {
  categorySelect.innerHTML = '<option value="">— Select a category —</option>';
  allCategories().forEach(function (cat) {
    const opt = document.createElement('option');
    opt.value       = cat.name;
    opt.textContent = cat.emoji + ' ' + cat.name;
    categorySelect.appendChild(opt);
  });
}

/* ══════════════════════════════════════════════════════
   FILTER CHIPS
══════════════════════════════════════════════════════ */
function buildFilterChips() {
  filterBar.innerHTML = '';

  const chips = [{ label: 'All', filter: 'All' }].concat(
    allCategories().map(function (c) {
      return { label: c.emoji + ' ' + c.name, filter: c.name };
    })
  );

  chips.forEach(function (item) {
    const btn = document.createElement('button');
    btn.className      = 'chip' + (activeFilter === item.filter ? ' active' : '');
    btn.dataset.filter = item.filter;
    btn.textContent    = item.label;
    filterBar.appendChild(btn);
  });
}

filterBar.addEventListener('click', function (e) {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  filterBar.querySelectorAll('.chip').forEach(function (c) { c.classList.remove('active'); });
  chip.classList.add('active');
  activeFilter = chip.dataset.filter;
  renderList();
});

/* ══════════════════════════════════════════════════════
   FORM VALIDATION
══════════════════════════════════════════════════════ */
function clearErrors() {
  [itemNameInput, amountInput, categorySelect].forEach(function (el) { el.classList.remove('invalid'); });
  [nameError, amountError, categoryError].forEach(function (el) { el.classList.remove('visible'); });
}

function validate() {
  clearErrors();
  let valid = true;

  if (!itemNameInput.value.trim()) {
    itemNameInput.classList.add('invalid');
    nameError.classList.add('visible');
    valid = false;
  }

  const amt = parseFloat(amountInput.value);
  if (!amountInput.value || isNaN(amt) || amt <= 0) {
    amountInput.classList.add('invalid');
    amountError.classList.add('visible');
    valid = false;
  }

  if (!categorySelect.value) {
    categorySelect.classList.add('invalid');
    categoryError.classList.add('visible');
    valid = false;
  }

  return valid;
}

/* ══════════════════════════════════════════════════════
   ADD TRANSACTION
══════════════════════════════════════════════════════ */
form.addEventListener('submit', function (e) {
  e.preventDefault();
  if (!validate()) return;

  const now = new Date();
  const tx = {
    id:      Date.now(),
    name:    itemNameInput.value.trim(),
    amount:  parseFloat(parseFloat(amountInput.value).toFixed(2)),
    category: categorySelect.value,
    dateISO: now.toISOString(),
    date:    now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
  };

  transactions.unshift(tx);
  saveTransactions();
  render();

  form.reset();
  clearErrors();
});

/* ══════════════════════════════════════════════════════
   DELETE TRANSACTION
══════════════════════════════════════════════════════ */
function deleteTransaction(id) {
  transactions = transactions.filter(function (tx) { return tx.id !== id; });
  saveTransactions();
  render();
}

/* ══════════════════════════════════════════════════════
   RENDER — master
══════════════════════════════════════════════════════ */
function render() {
  renderBalance();
  renderList();
  renderChart();
  if (summaryVisible) renderSummary();
}

/* ── Balance ── */
function renderBalance() {
  const total = transactions.reduce(function (sum, tx) { return sum + tx.amount; }, 0);
  totalBalanceEl.textContent = formatCurrency(total);
}

/* ── Transaction List ── */
function renderList() {
  const filtered = activeFilter === 'All'
    ? transactions
    : transactions.filter(function (tx) { return tx.category === activeFilter; });

  const count = transactions.length;
  txCountEl.textContent = count + ' item' + (count !== 1 ? 's' : '');

  if (filtered.length === 0) {
    txListEl.innerHTML = '';
    txEmptyEl.classList.add('visible');
    return;
  }
  txEmptyEl.classList.remove('visible');

  txListEl.innerHTML = filtered.map(function (tx) {
    const meta     = categoryMeta(tx.category);
    const badgeBg  = hexToRgba(meta.color, 0.15);
    const badgeFg  = darken(meta.color, 60);
    return (
      '<li class="tx-item" data-id="' + tx.id + '">' +
        '<span class="tx-dot" style="background:' + meta.color + '"></span>' +
        '<div class="tx-info">' +
          '<div class="tx-name" title="' + escapeHtml(tx.name) + '">' + escapeHtml(tx.name) + '</div>' +
          '<span class="tx-badge" style="background:' + badgeBg + ';color:' + badgeFg + '">' +
            meta.emoji + ' ' + escapeHtml(tx.category) +
          '</span>' +
        '</div>' +
        '<span class="tx-date">' + (tx.date || '') + '</span>' +
        '<span class="tx-amount">' + formatCurrency(tx.amount) + '</span>' +
        '<button class="btn-delete" aria-label="Delete ' + escapeHtml(tx.name) + '" data-id="' + tx.id + '">✕</button>' +
      '</li>'
    );
  }).join('');

  txListEl.querySelectorAll('.btn-delete').forEach(function (btn) {
    btn.addEventListener('click', function () { deleteTransaction(Number(btn.dataset.id)); });
  });
}

/* ── Chart ── */
function renderChart() {
  const totals = {};
  transactions.forEach(function (tx) {
    totals[tx.category] = (totals[tx.category] || 0) + tx.amount;
  });

  const cats   = allCategories().filter(function (c) { return totals[c.name]; });
  const labels = cats.map(function (c) { return c.name; });
  const data   = cats.map(function (c) { return totals[c.name]; });
  const colors = cats.map(function (c) { return c.color; });
  const canvas = document.getElementById('spendingChart');
  const isDark = currentTheme() === 'dark';
  const legendColor = isDark ? '#e2e8f0' : '#1e1e2e';

  if (labels.length === 0) {
    if (chart) { chart.destroy(); chart = null; }
    canvas.style.display       = 'none';
    chartEmptyEl.style.display = 'block';
    return;
  }

  canvas.style.display       = 'block';
  chartEmptyEl.style.display = 'none';

  if (chart) {
    chart.data.labels                             = labels;
    chart.data.datasets[0].data                  = data;
    chart.data.datasets[0].backgroundColor       = colors;
    chart.data.datasets[0].borderColor           = colors.map(function (c) { return darken(c, 30); });
    chart.options.plugins.legend.labels.color    = legendColor;
    chart.update();
    return;
  }

  chart = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data:            data,
        backgroundColor: colors,
        borderColor:     colors.map(function (c) { return darken(c, 30); }),
        borderWidth:     2,
        hoverOffset:     10,
      }],
    },
    options: {
      responsive:          true,
      maintainAspectRatio: true,
      cutout: '55%',
      animation: { animateRotate: true, duration: 500 },
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            padding:       16,
            font:          { size: 12, weight: '600' },
            color:         legendColor,
            boxWidth:      14,
            boxHeight:     14,
            usePointStyle: false,
          },
        },
        tooltip: {
          callbacks: {
            label: function (ctx) {
              const total = ctx.dataset.data.reduce(function (a, b) { return a + b; }, 0);
              const pct   = ((ctx.parsed / total) * 100).toFixed(1);
              return ' ' + ctx.label + ': ' + formatCurrency(ctx.parsed) + ' (' + pct + '%)';
            },
          },
        },
      },
    },
  });
}

/* ══════════════════════════════════════════════════════
   MONTHLY SUMMARY
══════════════════════════════════════════════════════ */
btnSummary.addEventListener('click', function () {
  summaryVisible      = true;
  summaryDate         = new Date();
  summaryPanel.hidden = false;
  renderSummary();
  summaryPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

btnCloseSummary.addEventListener('click', function () {
  summaryPanel.hidden = true;
  summaryVisible      = false;
});

btnPrevMonth.addEventListener('click', function () {
  summaryDate = new Date(summaryDate.getFullYear(), summaryDate.getMonth() - 1, 1);
  renderSummary();
});

btnNextMonth.addEventListener('click', function () {
  summaryDate = new Date(summaryDate.getFullYear(), summaryDate.getMonth() + 1, 1);
  renderSummary();
});

function renderSummary() {
  const yr = summaryDate.getFullYear();
  const mo = summaryDate.getMonth();

  summaryMonthLabel.textContent = summaryDate.toLocaleDateString('en-US', {
    month: 'long', year: 'numeric',
  });

  const monthTx = transactions.filter(function (tx) {
    const d = tx.dateISO ? new Date(tx.dateISO) : parseLegacyDate(tx.date);
    return d && d.getFullYear() === yr && d.getMonth() === mo;
  });

  const totalSpent = monthTx.reduce(function (s, tx) { return s + tx.amount; }, 0);
  const txCount    = monthTx.length;

  const topTx = monthTx.reduce(function (top, tx) {
    return (!top || tx.amount > top.amount) ? tx : top;
  }, null);

  const catTotals = {};
  monthTx.forEach(function (tx) {
    catTotals[tx.category] = (catTotals[tx.category] || 0) + tx.amount;
  });

  const topCatName = Object.keys(catTotals).sort(function (a, b) {
    return catTotals[b] - catTotals[a];
  })[0] || '—';

  summaryStats.innerHTML =
    '<div class="stat-tile">' +
      '<span class="stat-tile-label">Total Spent</span>' +
      '<span class="stat-tile-value accent">' + formatCurrency(totalSpent) + '</span>' +
    '</div>' +
    '<div class="stat-tile">' +
      '<span class="stat-tile-label">Transactions</span>' +
      '<span class="stat-tile-value">' + txCount + '</span>' +
    '</div>' +
    '<div class="stat-tile">' +
      '<span class="stat-tile-label">Avg per Tx</span>' +
      '<span class="stat-tile-value">' + (txCount ? formatCurrency(totalSpent / txCount) : '$0.00') + '</span>' +
    '</div>' +
    '<div class="stat-tile">' +
      '<span class="stat-tile-label">Top Category</span>' +
      '<span class="stat-tile-value" style="font-size:1.05rem">' + escapeHtml(topCatName) + '</span>' +
    '</div>' +
    '<div class="stat-tile">' +
      '<span class="stat-tile-label">Biggest Expense</span>' +
      '<span class="stat-tile-value" style="font-size:1rem">' +
        (topTx ? escapeHtml(topTx.name) + ' (' + formatCurrency(topTx.amount) + ')' : '—') +
      '</span>' +
    '</div>';

  if (monthTx.length === 0) {
    summaryTableBody.innerHTML = '';
    summaryEmpty.hidden = false;
    return;
  }
  summaryEmpty.hidden = true;

  const rows = allCategories()
    .map(function (cat) {
      return {
        cat:   cat,
        total: catTotals[cat.name] || 0,
        count: monthTx.filter(function (tx) { return tx.category === cat.name; }).length,
      };
    })
    .filter(function (r) { return r.total > 0; })
    .sort(function (a, b) { return b.total - a.total; });

  summaryTableBody.innerHTML = rows.map(function (r) {
    const pct = totalSpent > 0 ? (r.total / totalSpent) * 100 : 0;
    return (
      '<tr>' +
        '<td><div class="td-cat">' +
          '<span class="td-dot" style="background:' + r.cat.color + '"></span>' +
          r.cat.emoji + ' ' + escapeHtml(r.cat.name) +
        '</div></td>' +
        '<td>' + r.count + '</td>' +
        '<td><strong>' + formatCurrency(r.total) + '</strong></td>' +
        '<td><div class="pct-bar-wrap">' +
          '<div class="pct-bar-track">' +
            '<div class="pct-bar-fill" style="width:' + pct.toFixed(1) + '%;background:' + r.cat.color + '"></div>' +
          '</div>' +
          '<span class="pct-label">' + pct.toFixed(1) + '%</span>' +
        '</div></td>' +
      '</tr>'
    );
  }).join('');
}

/* ══════════════════════════════════════════════════════
   CUSTOM CATEGORY MODAL
══════════════════════════════════════════════════════ */
btnAddCat.addEventListener('click', openCatModal);
btnModalClose.addEventListener('click', closeCatModal);

catModalBackdrop.addEventListener('click', function (e) {
  if (e.target === catModalBackdrop) closeCatModal();
});

document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape' && !catModalBackdrop.hidden) closeCatModal();
});

function openCatModal() {
  catModalBackdrop.hidden = false;
  renderCatList();
  newCatNameInput.focus();
}

function closeCatModal() {
  catModalBackdrop.hidden = true;
  newCatNameInput.value   = '';
  newCatColorInput.value  = '#a78bfa';
  catNameError.classList.remove('visible');
}

btnConfirmAddCat.addEventListener('click', addCustomCategory);
newCatNameInput.addEventListener('keydown', function (e) {
  if (e.key === 'Enter') { e.preventDefault(); addCustomCategory(); }
});

function addCustomCategory() {
  const name = newCatNameInput.value.trim();
  catNameError.classList.remove('visible');

  if (!name) {
    catNameError.textContent = 'Please enter a category name.';
    catNameError.classList.add('visible');
    newCatNameInput.focus();
    return;
  }

  const exists = allCategories().some(function (c) {
    return c.name.toLowerCase() === name.toLowerCase();
  });
  if (exists) {
    catNameError.textContent = 'A category with this name already exists.';
    catNameError.classList.add('visible');
    return;
  }

  customCats.push({ name: name, color: newCatColorInput.value, emoji: '🏷️', builtIn: false });
  saveCustomCats();

  populateCategorySelect();
  buildFilterChips();
  renderCatList();
  renderChart();

  newCatNameInput.value  = '';
  newCatColorInput.value = '#a78bfa';
  newCatNameInput.focus();
}

function deleteCustomCategory(name) {
  customCats = customCats.filter(function (c) { return c.name !== name; });
  saveCustomCats();
  if (activeFilter === name) activeFilter = 'All';
  populateCategorySelect();
  buildFilterChips();
  renderCatList();
  renderChart();
  renderList();
}

function renderCatList() {
  catListEmpty.style.display = customCats.length === 0 ? 'block' : 'none';

  catListEl.innerHTML = allCategories().map(function (cat) {
    return (
      '<li class="cat-item">' +
        '<span class="cat-swatch" style="background:' + cat.color + '"></span>' +
        '<span class="cat-name">' + cat.emoji + ' ' + escapeHtml(cat.name) + '</span>' +
        (cat.builtIn
          ? '<span class="cat-built-in-badge">Built-in</span>'
          : '<button class="btn-del-cat" data-name="' + escapeHtml(cat.name) + '" aria-label="Delete ' + escapeHtml(cat.name) + '">✕</button>'
        ) +
      '</li>'
    );
  }).join('');

  catListEl.querySelectorAll('.btn-del-cat').forEach(function (btn) {
    btn.addEventListener('click', function () { deleteCustomCategory(btn.dataset.name); });
  });
}

/* ══════════════════════════════════════════════════════
   MIGRATION — backfill dateISO on old transactions
══════════════════════════════════════════════════════ */
(function migrateTransactions() {
  let changed = false;
  transactions.forEach(function (tx) {
    if (!tx.dateISO && tx.date) {
      const d = new Date(tx.date);
      if (!isNaN(d.getTime())) { tx.dateISO = d.toISOString(); changed = true; }
    }
  });
  if (changed) saveTransactions();
})();

/* ══════════════════════════════════════════════════════
   INIT
══════════════════════════════════════════════════════ */
populateCategorySelect();
buildFilterChips();
render();
