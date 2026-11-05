// ============================================================================
// SURYAVIN VEEDU - MOBILE-FIRST ROOMMATE EXPENSE TRACKER
// Members: Saravanan, Surya, Ram, Sathish
// ============================================================================

(function () {
  const CONFIG = window.SURYAVIN_VEEDU_CONFIG || {};
  const CURRENCY = CONFIG.CURRENCY || '₹';
  const MEMBERS = [
    { name: 'Saravanan', color: '#4f46e5', bg: '#eef2ff', border: '#c7d2fe', short: 'SA' },
    { name: 'Surya',     color: '#059669', bg: '#ecfdf5', border: '#a7f3d0', short: 'SU' },
    { name: 'Ram',       color: '#d97706', bg: '#fffbeb', border: '#fde68a', short: 'RA' },
    { name: 'Sathish',   color: '#e11d48', bg: '#fff1f2', border: '#fecdd3', short: 'ST' }
  ];
  const MEMBER_NAMES = MEMBERS.map(m => m.name);
  const MEMBER_MAP = Object.fromEntries(MEMBERS.map(m => [m.name, m]));

  const STORAGE_KEY_TX = 'suryavin_veedu_transactions_v1';
  const STORAGE_KEY_DRIVE_URL = 'suryavin_veedu_drive_url_v1';

  // State
  let transactions = [];
  let selectedPayer = 'Saravanan';
  let selectedInvolved = new Set(MEMBER_NAMES);
  let debtCalculationMode = 'simplified'; // 'simplified' | 'pairwise'
  let isSyncing = false;

  // Helpers
  function formatMoney(num, compact = false) {
    const val = Number(num) || 0;
    if (compact && Number.isInteger(val)) {
      return `${CURRENCY}${val.toLocaleString('en-IN')}`;
    }
    return `${CURRENCY}${val.toLocaleString('en-IN', {
      minimumFractionDigits: val % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2
    })}`;
  }

  function round2(n) {
    return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  }

  function getTodayISO() {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  function getDriveUrl() {
    return (
      localStorage.getItem(STORAGE_KEY_DRIVE_URL) ||
      CONFIG.DEFAULT_DRIVE_WEB_APP_URL ||
      ''
    ).trim();
  }

  function showToast(msg) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => {
      toast.remove();
    }, 2800);
  }

  function switchScreen(screenId) {
    document.querySelectorAll('.screen-section').forEach(sec => {
      sec.classList.toggle('active', sec.id === screenId);
    });
    document.querySelectorAll('.bnav-item').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-screen') === screenId);
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Local Storage
  function loadLocalTransactions() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_TX);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          transactions = parsed;
          return;
        }
      }
    } catch (e) {
      console.error('Failed to read local storage:', e);
    }
    transactions = [];
  }

  function saveLocalTransactions() {
    try {
      localStorage.setItem(STORAGE_KEY_TX, JSON.stringify(transactions));
    } catch (e) {
      console.error('Failed to save to local storage:', e);
    }
  }

  // Google Drive Sync
  function updateSyncStatusUI(state, customLabel) {
    const dot = document.getElementById('syncDot');
    const text = document.getElementById('syncStatusText');
    const url = getDriveUrl();

    dot.className = 'sync-dot';
    if (state === 'syncing') {
      dot.classList.add('syncing');
      text.textContent = customLabel || 'Syncing...';
    } else if (url && state !== 'error') {
      dot.classList.add('connected');
      text.textContent = customLabel || 'Drive Synced';
    } else if (state === 'error') {
      text.textContent = customLabel || 'Offline Saved';
    } else {
      text.textContent = 'Connect Drive';
    }
  }

  async function fetchFromDrive() {
    const url = getDriveUrl();
    if (!url || isSyncing) {
      updateSyncStatusUI();
      return;
    }
    isSyncing = true;
    updateSyncStatusUI('syncing', 'Syncing...');
    try {
      const res = await fetch(url, { method: 'GET' });
      const data = await res.json();
      if (data && data.status === 'ok' && Array.isArray(data.transactions)) {
        transactions = data.transactions;
        saveLocalTransactions();
        renderAll();
        updateSyncStatusUI('connected', 'Drive Synced');
      } else {
        updateSyncStatusUI('error', 'Sync Warning');
      }
    } catch (err) {
      console.warn('Google Drive fetch error:', err);
      updateSyncStatusUI('error', 'Saved Locally');
    } finally {
      isSyncing = false;
    }
  }

  async function postToDrive(payload) {
    const url = getDriveUrl();
    if (!url) return;
    updateSyncStatusUI('syncing', 'Saving...');
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data && data.status === 'ok') {
        updateSyncStatusUI('connected', 'Drive Synced');
      } else {
        updateSyncStatusUI('error', 'Sync Warning');
      }
    } catch (err) {
      console.warn('Google Drive post error:', err);
      updateSyncStatusUI('error', 'Saved Locally');
    }
  }

  // ==========================================================================
  // CORE CALCULATION ENGINE
  // ==========================================================================
  function computeFinancials() {
    const stats = {};
    const rawOwed = {};

    MEMBER_NAMES.forEach(m => {
      stats[m] = {
        name: m,
        totalSpent: 0,
        totalShare: 0,
        settledPaid: 0,
        settledReceived: 0,
        netBalance: 0
      };
      rawOwed[m] = {};
      MEMBER_NAMES.forEach(other => {
        rawOwed[m][other] = 0;
      });
    });

    transactions.forEach(tx => {
      const amount = Number(tx.amount) || 0;
      if (amount <= 0) return;

      if (tx.type === 'settlement') {
        const from = tx.paidBy;
        const to = tx.paidTo;
        if (stats[from] && stats[to] && from !== to) {
          stats[from].settledPaid += amount;
          stats[to].settledReceived += amount;
          stats[from].netBalance += amount;
          stats[to].netBalance -= amount;
          rawOwed[from][to] -= amount;
        }
      } else {
        const payer = tx.paidBy;
        const involved = Array.isArray(tx.involved) && tx.involved.length > 0
          ? tx.involved.filter(m => stats[m])
          : [...MEMBER_NAMES];

        if (!stats[payer] || involved.length === 0) return;

        const share = amount / involved.length;
        stats[payer].totalSpent += amount;
        stats[payer].netBalance += amount;

        involved.forEach(member => {
          stats[member].totalShare += share;
          stats[member].netBalance -= share;
          if (member !== payer) {
            rawOwed[member][payer] += share;
          }
        });
      }
    });

    // Pairwise Debts
    const pairwiseDebts = [];
    for (let i = 0; i < MEMBER_NAMES.length; i++) {
      for (let j = i + 1; j < MEMBER_NAMES.length; j++) {
        const a = MEMBER_NAMES[i];
        const b = MEMBER_NAMES[j];
        const netAtoB = rawOwed[a][b] - rawOwed[b][a];
        if (netAtoB > 0.01) {
          pairwiseDebts.push({ from: a, to: b, amount: round2(netAtoB) });
        } else if (netAtoB < -0.01) {
          pairwiseDebts.push({ from: b, to: a, amount: round2(-netAtoB) });
        }
      }
    }

    // Simplified Debts
    const debtors = [];
    const creditors = [];
    MEMBER_NAMES.forEach(m => {
      const bal = stats[m].netBalance;
      if (bal < -0.01) {
        debtors.push({ name: m, amount: -bal });
      } else if (bal > 0.01) {
        creditors.push({ name: m, amount: bal });
      }
    });

    debtors.sort((a, b) => b.amount - a.amount);
    creditors.sort((a, b) => b.amount - a.amount);

    const simplifiedDebts = [];
    let dIdx = 0;
    let cIdx = 0;

    while (dIdx < debtors.length && cIdx < creditors.length) {
      const debtor = debtors[dIdx];
      const creditor = creditors[cIdx];
      const transfer = Math.min(debtor.amount, creditor.amount);

      if (transfer > 0.01) {
        simplifiedDebts.push({
          from: debtor.name,
          to: creditor.name,
          amount: round2(transfer)
        });
      }

      debtor.amount -= transfer;
      creditor.amount -= transfer;

      if (debtor.amount <= 0.01) dIdx++;
      if (creditor.amount <= 0.01) cIdx++;
    }

    return { stats, simplifiedDebts, pairwiseDebts };
  }

  // ==========================================================================
  // RENDERERS
  // ==========================================================================
  function renderMemberTouchSelectors() {
    const amount = Number(document.getElementById('expenseAmount').value) || 0;
    const involvedArr = MEMBER_NAMES.filter(m => selectedInvolved.has(m));
    const perPersonShare = involvedArr.length > 0 ? amount / involvedArr.length : 0;

    // 1. Payer Selector
    const payerContainer = document.getElementById('payerSelector');
    document.getElementById('selectedPayerLabel').textContent = selectedPayer;

    payerContainer.innerHTML = MEMBERS.map(m => {
      const isSelected = m.name === selectedPayer;
      return `
        <div class="touch-member-card ${isSelected ? 'selected' : ''}" data-payer="${m.name}">
          <div class="avatar-circle" style="width:34px;height:34px;font-size:0.76rem;background:${m.bg};color:${m.color};border:1px solid ${m.border};">
            ${m.short}
          </div>
          <div class="touch-member-info">
            <div class="touch-member-name">${m.name}</div>
            <div class="touch-member-sub">${isSelected ? 'Paid bill' : 'Tap to select'}</div>
          </div>
          <div class="touch-check">${isSelected ? '✓' : ''}</div>
        </div>
      `;
    }).join('');

    payerContainer.querySelectorAll('[data-payer]').forEach(el => {
      el.addEventListener('click', () => {
        selectedPayer = el.getAttribute('data-payer');
        renderMemberTouchSelectors();
      });
    });

    // 2. Involved Split Selector (Shows live ₹ share right inside each card!)
    const involvedContainer = document.getElementById('involvedSelector');
    involvedContainer.innerHTML = MEMBERS.map(m => {
      const isChecked = selectedInvolved.has(m.name);
      const subText = isChecked
        ? (amount > 0 ? `${formatMoney(perPersonShare)} share` : 'Included')
        : 'Not included';

      return `
        <div class="touch-member-card ${isChecked ? 'selected' : ''}" data-involved="${m.name}">
          <div class="avatar-circle" style="width:34px;height:34px;font-size:0.76rem;background:${m.bg};color:${m.color};border:1px solid ${m.border};">
            ${m.short}
          </div>
          <div class="touch-member-info">
            <div class="touch-member-name">${m.name}</div>
            <div class="touch-member-sub">${subText}</div>
          </div>
          <div class="touch-check">${isChecked ? '✓' : ''}</div>
        </div>
      `;
    }).join('');

    involvedContainer.querySelectorAll('[data-involved]').forEach(el => {
      el.addEventListener('click', () => {
        const name = el.getAttribute('data-involved');
        if (selectedInvolved.has(name)) {
          if (selectedInvolved.size <= 1) {
            showToast('At least 1 roommate must be selected!');
            return;
          }
          selectedInvolved.delete(name);
        } else {
          selectedInvolved.add(name);
        }
        renderMemberTouchSelectors();
      });
    });

    // Update live banner
    const formulaText = document.getElementById('splitFormulaText');
    const perPersonText = document.getElementById('splitPerPersonText');
    const breakdownText = document.getElementById('splitBreakdownText');

    formulaText.textContent = `Split among ${involvedArr.length} (${involvedArr.join(', ')})`;
    perPersonText.textContent = `${formatMoney(perPersonShare)} / each`;

    if (amount <= 0) {
      breakdownText.textContent = 'Type an amount above to preview exact member split.';
    } else {
      const othersWhoOwe = involvedArr.filter(m => m !== selectedPayer);
      if (othersWhoOwe.length === 0) {
        breakdownText.textContent = `Only ${selectedPayer} is involved in this expense.`;
      } else {
        breakdownText.textContent = `${othersWhoOwe.join(', ')} will each owe ${selectedPayer} ${formatMoney(perPersonShare)}.`;
      }
    }
  }

  function renderHomeAndSettle(financials) {
    // Hero stats
    let totalExpenses = 0;
    let totalSettled = 0;
    transactions.forEach(tx => {
      if (tx.type === 'settlement') totalSettled += Number(tx.amount) || 0;
      else totalExpenses += Number(tx.amount) || 0;
    });

    document.getElementById('heroTotalSpent').textContent = formatMoney(totalExpenses);
    document.getElementById('heroEntryCount').textContent = `${transactions.length} entries`;
    document.getElementById('totalEntriesBadge').textContent = String(transactions.length);

    // Mode toggle button
    const modeBtn = document.getElementById('btnToggleDebtMode');
    modeBtn.textContent = debtCalculationMode === 'simplified'
      ? 'Mode: Simplified'
      : 'Mode: Direct Pairwise';

    const activeDebts = debtCalculationMode === 'simplified'
      ? financials.simplifiedDebts
      : financials.pairwiseDebts;

    const debtHtml = activeDebts.length === 0
      ? `
        <div class="empty-settled-box">
          <div style="font-size: 1.5rem;">🎉</div>
          <h4>All Roommates Are Settled Up!</h4>
          <p>No pending payments between Saravanan, Surya, Ram & Sathish.</p>
        </div>
      `
      : activeDebts.map(debt => {
          const fromM = MEMBER_MAP[debt.from];
          return `
            <div class="debt-card">
              <div class="debt-people">
                <div class="avatar-circle" style="background:${fromM.bg};color:${fromM.color};border:1px solid ${fromM.border};">
                  ${fromM.short}
                </div>
                <div class="debt-text">
                  <div class="debt-names">
                    <span>${debt.from}</span>
                    <span class="pays-label">pays ➔</span>
                    <span>${debt.to}</span>
                  </div>
                  <div class="debt-sub">Tap "Pay Now" once paid to minus balance</div>
                </div>
              </div>
              <div class="debt-right">
                <div class="debt-amount">${formatMoney(debt.amount)}</div>
                <button
                  type="button"
                  class="btn-pay-chip"
                  data-pay-from="${debt.from}"
                  data-pay-to="${debt.to}"
                  data-pay-amount="${debt.amount}"
                >
                  ✓ Pay Now
                </button>
              </div>
            </div>
          `;
        }).join('');

    const homeDebtEl = document.getElementById('whoPaysWhomList');
    const settleQuickEl = document.getElementById('settleScreenQuickDebts');
    homeDebtEl.innerHTML = debtHtml;
    settleQuickEl.innerHTML = debtHtml;

    // Bind "Pay Now" buttons on both Home and Settle screens
    document.querySelectorAll('[data-pay-from]').forEach(btn => {
      btn.addEventListener('click', () => {
        const from = btn.getAttribute('data-pay-from');
        const to = btn.getAttribute('data-pay-to');
        const amount = btn.getAttribute('data-pay-amount');

        document.getElementById('settleFrom').value = from;
        document.getElementById('settleTo').value = to;
        document.getElementById('settleAmount').value = amount;
        document.getElementById('settleDate').value = getTodayISO();
        document.getElementById('settleNote').value = `${from} paid ${to}`;

        switchScreen('screenSettle');
        showToast(`Pre-filled ${from} → ${to} (${formatMoney(amount)}). Tap "Record Payment" to confirm!`);
      });
    });

    // 4 Roommates 2x2 Grid
    const grid = document.getElementById('memberStatsGrid');
    grid.innerHTML = MEMBERS.map(m => {
      const st = financials.stats[m.name];
      const net = round2(st.netBalance);
      let badgeClass = 'zero';
      let badgeText = 'Settled Up';
      let netColor = 'var(--text-main)';
      let netPrefix = '';

      if (net > 0.01) {
        badgeClass = 'pos';
        badgeText = 'Gets Back';
        netColor = 'var(--emerald)';
        netPrefix = '+';
      } else if (net < -0.01) {
        badgeClass = 'neg';
        badgeText = 'Needs to Pay';
        netColor = 'var(--rose)';
        netPrefix = '-';
      }

      return `
        <div class="roommate-card">
          <div>
            <div class="rm-top">
              <div class="avatar-circle" style="width:32px;height:32px;font-size:0.75rem;background:${m.bg};color:${m.color};border:1px solid ${m.border};">
                ${m.short}
              </div>
              <div class="rm-name">${m.name}</div>
            </div>
            <div class="rm-balance" style="color:${netColor};">
              ${netPrefix}${formatMoney(Math.abs(net))}
            </div>
            <span class="rm-badge ${badgeClass}">${badgeText}</span>
          </div>
          <div class="rm-footer">
            <span>Spent<strong>${formatMoney(st.totalSpent, true)}</strong></span>
            <span style="text-align:right;">Share<strong>${formatMoney(st.totalShare, true)}</strong></span>
          </div>
        </div>
      `;
    }).join('');
  }

  function renderAnalyticsScreen(financials) {
    let totalExpenses = 0;
    let totalSettled = 0;
    transactions.forEach(tx => {
      if (tx.type === 'settlement') totalSettled += Number(tx.amount) || 0;
      else totalExpenses += Number(tx.amount) || 0;
    });

    document.getElementById('kpiTotalSpent').textContent = formatMoney(totalExpenses, true);
    document.getElementById('kpiTotalSettled').textContent = formatMoney(totalSettled, true);
    document.getElementById('kpiEntryCount').textContent = String(transactions.length);

    // 1. Member Audit Mobile Cards
    const auditList = document.getElementById('memberAuditList');
    auditList.innerHTML = MEMBERS.map(m => {
      const st = financials.stats[m.name];
      const net = round2(st.netBalance);
      const netColor = net > 0.01 ? 'var(--emerald)' : net < -0.01 ? 'var(--rose)' : 'var(--text-secondary)';
      const netLabel = net > 0.01
        ? `Gets back +${formatMoney(net)}`
        : net < -0.01
          ? `Owes -${formatMoney(Math.abs(net))}`
          : 'Settled (₹0)';

      return `
        <div class="audit-member-row">
          <div class="audit-member-top">
            <div style="display:flex;align-items:center;gap:8px;">
              <span class="avatar-circle" style="width:28px;height:28px;font-size:0.7rem;background:${m.bg};color:${m.color};border:1px solid ${m.border};">
                ${m.short}
              </span>
              <strong style="font-size:0.88rem;">${m.name}</strong>
            </div>
            <strong style="font-size:0.82rem;color:${netColor};">${netLabel}</strong>
          </div>
          <div class="audit-stats-grid">
            <div>Spent<strong>${formatMoney(st.totalSpent, true)}</strong></div>
            <div>Share<strong>${formatMoney(st.totalShare, true)}</strong></div>
            <div>Paid Back<strong>${formatMoney(st.settledPaid, true)}</strong></div>
            <div>Received<strong>${formatMoney(st.settledReceived, true)}</strong></div>
          </div>
        </div>
      `;
    }).join('');

    // 2. Ordered Mobile Feed Cards
    const searchVal = (document.getElementById('filterSearch').value || '').trim().toLowerCase();
    const memberFilter = document.getElementById('filterMember').value;
    const typeFilter = document.getElementById('filterType').value;
    const orderFilter = document.getElementById('filterOrder').value;

    let filtered = transactions.filter(tx => {
      if (typeFilter !== 'ALL' && tx.type !== typeFilter) return false;
      if (memberFilter !== 'ALL') {
        const inExpense = tx.type === 'expense' && (tx.paidBy === memberFilter || (Array.isArray(tx.involved) && tx.involved.includes(memberFilter)));
        const inSettlement = tx.type === 'settlement' && (tx.paidBy === memberFilter || tx.paidTo === memberFilter);
        if (!inExpense && !inSettlement) return false;
      }
      if (searchVal) {
        const hay = `${tx.reason || ''} ${tx.paidBy || ''} ${tx.paidTo || ''} ${tx.date || ''}`.toLowerCase();
        if (!hay.includes(searchVal)) return false;
      }
      return true;
    });

    filtered.sort((a, b) => {
      const dateA = `${a.date || ''}T${a.createdAt || ''}`;
      const dateB = `${b.date || ''}T${b.createdAt || ''}`;
      return orderFilter === 'ASC'
        ? dateA.localeCompare(dateB)
        : dateB.localeCompare(dateA);
    });

    const feedEl = document.getElementById('ledgerFeedList');
    if (filtered.length === 0) {
      feedEl.innerHTML = `
        <div style="text-align:center;padding:24px 12px;color:var(--text-secondary);font-size:0.84rem;">
          No expenses or payments match your filter.
        </div>
      `;
      return;
    }

    feedEl.innerHTML = filtered.map((tx, idx) => {
      const orderNum = orderFilter === 'ASC' ? idx + 1 : filtered.length - idx;
      const payerM = MEMBER_MAP[tx.paidBy] || { name: tx.paidBy, bg: '#f1f5f9', color: '#334155', border: '#cbd5e1' };

      if (tx.type === 'settlement') {
        const toM = MEMBER_MAP[tx.paidTo] || { name: tx.paidTo, bg: '#f1f5f9', color: '#334155', border: '#cbd5e1' };
        return `
          <div class="tx-card">
            <div class="tx-card-top">
              <div class="tx-meta">
                <span class="tx-num">#${orderNum}</span>
                <span class="tx-date">${escapeHtml(tx.date)}</span>
                <span class="tx-type-badge settlement">Paid Back</span>
              </div>
              <div class="tx-amount-col">
                <div class="tx-total" style="color:var(--emerald);">${formatMoney(tx.amount)}</div>
                <div class="tx-share-sub" style="color:var(--emerald);">Minus Balance</div>
              </div>
            </div>
            <div class="tx-reason-title">${escapeHtml(tx.reason || 'Settlement Payment')}</div>
            <div class="tx-card-bottom">
              <div class="tx-people-tags">
                <span class="mini-person-tag" style="background:${payerM.bg};color:${payerM.color};border:1px solid ${payerM.border};">${escapeHtml(payerM.name)}</span>
                <span>paid ➔</span>
                <span class="mini-person-tag" style="background:${toM.bg};color:${toM.color};border:1px solid ${toM.border};">${escapeHtml(toM.name)}</span>
              </div>
              <button type="button" class="btn-delete-tx" data-delete-id="${tx.id}">🗑️ Delete</button>
            </div>
          </div>
        `;
      }

      // Expense Card
      const involvedList = Array.isArray(tx.involved) && tx.involved.length > 0 ? tx.involved : MEMBER_NAMES;
      const share = Number(tx.amount) / involvedList.length;
      const involvedBadges = involvedList.map(mName => {
        const m = MEMBER_MAP[mName] || { name: mName, bg: '#f1f5f9', color: '#334155', border: '#cbd5e1' };
        return `<span class="mini-person-tag" style="background:${m.bg};color:${m.color};border:1px solid ${m.border};">${escapeHtml(m.name)}</span>`;
      }).join('');

      return `
        <div class="tx-card">
          <div class="tx-card-top">
            <div class="tx-meta">
              <span class="tx-num">#${orderNum}</span>
              <span class="tx-date">${escapeHtml(tx.date)}</span>
              <span class="tx-type-badge expense">Expense</span>
            </div>
            <div class="tx-amount-col">
              <div class="tx-total">${formatMoney(tx.amount)}</div>
              <div class="tx-share-sub">${formatMoney(share)} / each (${involvedList.length})</div>
            </div>
          </div>
          <div class="tx-reason-title">${escapeHtml(tx.reason)}</div>
          <div class="tx-card-bottom">
            <div class="tx-people-tags">
              <span>Paid by <strong style="color:${payerM.color};">${escapeHtml(payerM.name)}</strong> • Split:</span>
              ${involvedBadges}
            </div>
            <button type="button" class="btn-delete-tx" data-delete-id="${tx.id}">🗑️ Delete</button>
          </div>
        </div>
      `;
    }).join('');

    feedEl.querySelectorAll('[data-delete-id]').forEach(btn => {
      btn.addEventListener('click', () => {
        deleteTransaction(btn.getAttribute('data-delete-id'));
      });
    });
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderAll() {
    const financials = computeFinancials();
    renderHomeAndSettle(financials);
    renderAnalyticsScreen(financials);
    renderMemberTouchSelectors();
  }

  // ==========================================================================
  // FORM HANDLERS
  // ==========================================================================
  function handleAddExpense(e) {
    e.preventDefault();
    const amountEl = document.getElementById('expenseAmount');
    const dateEl = document.getElementById('expenseDate');
    const reasonEl = document.getElementById('expenseReason');

    const amount = round2(Number(amountEl.value));
    const date = dateEl.value || getTodayISO();
    const reason = reasonEl.value.trim();
    const involved = MEMBER_NAMES.filter(m => selectedInvolved.has(m));

    if (!amount || amount <= 0) {
      showToast('Please enter a valid amount.');
      return;
    }
    if (!reason) {
      showToast('Please enter a reason for the expense.');
      return;
    }

    const perPersonShare = round2(amount / involved.length);
    const newTx = {
      id: 'tx_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      date,
      type: 'expense',
      paidBy: selectedPayer,
      amount,
      reason,
      involved,
      paidTo: '',
      perPersonShare,
      createdAt: new Date().toISOString()
    };

    transactions.push(newTx);
    saveLocalTransactions();
    renderAll();

    amountEl.value = '';
    reasonEl.value = '';
    renderMemberTouchSelectors();

    switchScreen('screenHome');
    showToast(`Saved: ${selectedPayer} paid ${formatMoney(amount)} (${formatMoney(perPersonShare)} each)`);
    postToDrive({ action: 'add', transaction: newTx });
  }

  function handleAddSettlement(e) {
    e.preventDefault();
    const from = document.getElementById('settleFrom').value;
    const to = document.getElementById('settleTo').value;
    const amountEl = document.getElementById('settleAmount');
    const dateEl = document.getElementById('settleDate');
    const noteEl = document.getElementById('settleNote');

    const amount = round2(Number(amountEl.value));
    const date = dateEl.value || getTodayISO();
    const reason = noteEl.value.trim() || `Paid back ${to}`;

    if (from === to) {
      showToast('Who Paid and Paid To must be different roommates!');
      return;
    }
    if (!amount || amount <= 0) {
      showToast('Please enter a valid amount.');
      return;
    }

    const newTx = {
      id: 'tx_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      date,
      type: 'settlement',
      paidBy: from,
      amount,
      reason,
      involved: [],
      paidTo: to,
      perPersonShare: 0,
      createdAt: new Date().toISOString()
    };

    transactions.push(newTx);
    saveLocalTransactions();
    renderAll();

    amountEl.value = '';
    noteEl.value = '';

    switchScreen('screenHome');
    showToast(`Recorded: ${from} paid ${to} ${formatMoney(amount)}!`);
    postToDrive({ action: 'add', transaction: newTx });
  }

  function deleteTransaction(id) {
    const target = transactions.find(t => t.id === id);
    if (!target) return;
    if (!confirm(`Delete "${target.reason}" (${formatMoney(target.amount)})?`)) {
      return;
    }
    transactions = transactions.filter(t => t.id !== id);
    saveLocalTransactions();
    renderAll();
    showToast('Deleted & recalculated balances.');
    postToDrive({ action: 'delete', id });
  }

  function exportCSV() {
    if (transactions.length === 0) {
      showToast('No entries to export yet!');
      return;
    }
    const headers = ['Date', 'Type', 'Paid By', 'Reason', 'Amount', 'Involved Members', 'Paid To', 'Per Person Share'];
    const rows = transactions.map(tx => [
      tx.date,
      tx.type,
      tx.paidBy,
      `"${String(tx.reason || '').replace(/"/g, '""')}"`,
      tx.amount,
      `"${Array.isArray(tx.involved) ? tx.involved.join(', ') : ''}"`,
      tx.paidTo || '',
      tx.perPersonShare || 0
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Suryavin_Veedu_Expenses_${getTodayISO()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ==========================================================================
  // INIT
  // ==========================================================================
  function init() {
    document.getElementById('expenseDate').value = getTodayISO();
    document.getElementById('settleDate').value = getTodayISO();

    loadLocalTransactions();
    renderAll();
    updateSyncStatusUI();

    if (getDriveUrl()) {
      fetchFromDrive();
    }

    // Bottom Navigation Bar
    document.querySelectorAll('.bnav-item').forEach(btn => {
      btn.addEventListener('click', () => {
        switchScreen(btn.getAttribute('data-screen'));
      });
    });

    // Hero Quick Action Buttons
    document.getElementById('btnHeroAddExpense').addEventListener('click', () => {
      switchScreen('screenAdd');
      setTimeout(() => document.getElementById('expenseAmount').focus(), 150);
    });

    document.getElementById('btnHeroSettleUp').addEventListener('click', () => {
      switchScreen('screenSettle');
    });

    // Reason Quick Chips
    document.querySelectorAll('.reason-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.getElementById('expenseReason').value = chip.getAttribute('data-reason');
      });
    });

    // Select All 4 Button
    document.getElementById('btnSelectAll4').addEventListener('click', () => {
      selectedInvolved = new Set(MEMBER_NAMES);
      renderMemberTouchSelectors();
    });

    // Live split preview when typing amount
    document.getElementById('expenseAmount').addEventListener('input', renderMemberTouchSelectors);

    // Forms
    document.getElementById('expenseForm').addEventListener('submit', handleAddExpense);
    document.getElementById('settlementForm').addEventListener('submit', handleAddSettlement);

    // Toggle Debt Mode
    document.getElementById('btnToggleDebtMode').addEventListener('click', () => {
      debtCalculationMode = debtCalculationMode === 'simplified' ? 'pairwise' : 'simplified';
      renderAll();
    });

    // Analytics Filters
    ['filterSearch', 'filterMember', 'filterType', 'filterOrder'].forEach(id => {
      document.getElementById(id).addEventListener('input', renderAll);
      document.getElementById(id).addEventListener('change', renderAll);
    });

    document.getElementById('btnClearFilters').addEventListener('click', () => {
      document.getElementById('filterSearch').value = '';
      document.getElementById('filterMember').value = 'ALL';
      document.getElementById('filterType').value = 'ALL';
      document.getElementById('filterOrder').value = 'DESC';
      renderAll();
    });

    document.getElementById('btnExportCSV').addEventListener('click', exportCSV);

    // Drive Modal
    const modal = document.getElementById('driveModalBackdrop');
    const urlInput = document.getElementById('driveWebAppUrlInput');

    document.getElementById('btnOpenDriveModal').addEventListener('click', () => {
      urlInput.value = getDriveUrl();
      modal.classList.add('open');
    });

    document.getElementById('btnCloseDriveModal').addEventListener('click', () => {
      modal.classList.remove('open');
    });

    document.getElementById('btnSaveDriveUrl').addEventListener('click', async () => {
      const val = urlInput.value.trim();
      localStorage.setItem(STORAGE_KEY_DRIVE_URL, val);
      modal.classList.remove('open');
      if (val) {
        showToast('Syncing with Google Drive...');
        await fetchFromDrive();
      } else {
        updateSyncStatusUI();
      }
    });

    document.getElementById('btnPushLocalToDrive').addEventListener('click', async () => {
      const val = urlInput.value.trim();
      if (!val) {
        showToast('Please enter your Google Apps Script URL first.');
        return;
      }
      localStorage.setItem(STORAGE_KEY_DRIVE_URL, val);
      await postToDrive({ action: 'syncAll', transactions });
      showToast(`Uploaded ${transactions.length} entries to Google Drive!`);
      modal.classList.remove('open');
    });

    document.getElementById('btnRefreshSync').addEventListener('click', () => {
      fetchFromDrive();
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
