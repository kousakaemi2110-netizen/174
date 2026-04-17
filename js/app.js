/* ==============================
   174° — 共通JS
   ============================== */

const APP = {
  RECORDS_KEY: '174_records',
  SETTINGS_KEY: '174_settings',

  /* ---------- LocalStorage ---------- */
  getRecords() {
    try {
      return JSON.parse(localStorage.getItem(this.RECORDS_KEY)) || [];
    } catch { return []; }
  },
  saveRecords(records) {
    localStorage.setItem(this.RECORDS_KEY, JSON.stringify(records));
  },
  addRecord(record) {
    const records = this.getRecords();
    records.unshift(record);
    this.saveRecords(records);
    return record;
  },
  getSettings() {
    try {
      return JSON.parse(localStorage.getItem(this.SETTINGS_KEY)) || {};
    } catch { return {}; }
  },
  saveSettings(settings) {
    localStorage.setItem(this.SETTINGS_KEY, JSON.stringify(settings));
  },

  /* ---------- UUID ---------- */
  uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  },

  /* ---------- 日付フォーマット ---------- */
  formatDate(date) {
    const d = date instanceof Date ? date : new Date(date);
    return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
  },
  formatDateTime(date) {
    const d = date instanceof Date ? date : new Date(date);
    return `${this.formatDate(d)} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  },
  relativeTime(date) {
    const d = date instanceof Date ? date : new Date(date);
    const diff = Date.now() - d.getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (mins < 1) return 'たった今';
    if (mins < 60) return `${mins}分前`;
    if (hours < 24) return `${hours}時間前`;
    if (days < 30) return `${days}日前`;
    return this.formatDate(d);
  },

  /* ---------- 時間帯挨拶 ---------- */
  greeting() {
    const h = new Date().getHours();
    if (h < 5)  return { text: 'おやすみなさい', sub: '無理せずゆっくり休んでください' };
    if (h < 11) return { text: 'おはようございます', sub: '今日も無理せず過ごしましょう' };
    if (h < 17) return { text: 'こんにちは', sub: '水分補給を忘れずに' };
    if (h < 21) return { text: 'お疲れ様です', sub: '今日一日がんばりましたね' };
    return { text: 'こんばんは', sub: '今夜もゆっくり過ごしてください' };
  },

  /* ---------- 強度→色 ---------- */
  intensityColor(n) {
    const colors = [
      '#CCCCCC','#B8D4E8','#A8C8E0','#98BDD4',
      '#A89CC8','#9B8BBF','#8E79B5','#B07070',
      '#C45A5A','#D94444','#E02020'
    ];
    return colors[Math.min(Math.max(0, n), 10)];
  },

  /* ---------- ナビアクティブ設定 ---------- */
  setActiveNav() {
    const path = location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.nav-item').forEach(item => {
      const href = item.getAttribute('href') || '';
      const target = href.split('/').pop();
      item.classList.toggle('active', target === path);
    });
  },

  /* ---------- スケジュール通知チェック ---------- */
  checkScheduledNotifications() {
    if (Notification.permission !== 'granted') return;
    const s = this.getSettings();
    const now = Date.now();

    // 週次サマリー
    if (s.weekly && s.weeklyNextAt && now >= new Date(s.weeklyNextAt).getTime()) {
      const records = this.getRecords();
      const weekAgo = new Date(now - 7 * 86400000);
      const weekCount = records.filter(r => new Date(r.timestamp) >= weekAgo).length;
      new Notification('174° 週次サマリー', {
        body: `先週の頭痛回数: ${weekCount}回。アプリで詳細を確認しましょう。`,
        icon: 'images/icons/icon-192.png'
      });
      // 次の月曜に再設定
      const next = new Date(now);
      next.setDate(next.getDate() + 7);
      next.setHours(9, 0, 0, 0);
      s.weeklyNextAt = next.toISOString();
      this.saveSettings(s);
    }

    // 生理周期アラート（周期±2日以内に通知）
    if (s.cycleAlert && s.cycle && s.lastPeriod) {
      const cycleMs  = Number(s.cycle) * 86400000;
      const lastMs   = new Date(s.lastPeriod).getTime();
      const nextMs   = lastMs + cycleMs;
      const diffDays = Math.round((nextMs - now) / 86400000);
      const notifyKey = `174_cycleNotified_${Math.floor(nextMs / 86400000)}`;
      if (diffDays <= 2 && diffDays >= 0 && !localStorage.getItem(notifyKey)) {
        new Notification('174° 生理周期アラート', {
          body: `生理予定日まであと${diffDays}日です。頭痛に注意して過ごしましょう。`,
          icon: 'images/icons/icon-192.png'
        });
        localStorage.setItem(notifyKey, '1');
      }
    }
  },

  /* ---------- モックデータ初期化 ---------- */
  initMockData() {
    if (this.getRecords().length > 0) return;
    const now = Date.now();
    const mock = [
      { id: this.uuid(), timestamp: new Date(now - 2*86400000).toISOString(),
        intensity: 7, location: ['右側','こめかみ'], symptoms: ['ズキズキ','光がつらい'],
        triggers: ['寝不足','ストレス'], medication: { taken: true, name: 'ロキソニン', count: 1 } },
      { id: this.uuid(), timestamp: new Date(now - 5*86400000).toISOString(),
        intensity: 4, location: ['全体'], symptoms: ['締め付け感'],
        triggers: ['眼精疲労'], medication: { taken: false, name: '', count: 0 } },
      { id: this.uuid(), timestamp: new Date(now - 9*86400000).toISOString(),
        intensity: 6, location: ['前頭部'], symptoms: ['ズキズキ','吐き気あり'],
        triggers: ['天気','生理前後'], medication: { taken: true, name: 'イブ', count: 2 } },
      { id: this.uuid(), timestamp: new Date(now - 14*86400000).toISOString(),
        intensity: 3, location: ['後頭部'], symptoms: ['締め付け感'],
        triggers: ['肩こり'], medication: { taken: false, name: '', count: 0 } },
      { id: this.uuid(), timestamp: new Date(now - 18*86400000).toISOString(),
        intensity: 8, location: ['右側','こめかみ'], symptoms: ['ズキズキ','光がつらい','音がつらい'],
        triggers: ['お酒','寝不足'], medication: { taken: true, name: 'ロキソニン', count: 1 } },
      { id: this.uuid(), timestamp: new Date(now - 32*86400000).toISOString(),
        intensity: 5, location: ['左側'], symptoms: ['ズキズキ'],
        triggers: ['ストレス','食事'], medication: { taken: true, name: 'バファリン', count: 2 } },
    ];
    this.saveRecords(mock);
  }
};

/* ==============================
   テーマ管理
   ============================== */
APP.THEME_KEY = '174_theme';

// ページロード直後にフラッシュなしでテーマ適用
(function() {
  const t = localStorage.getItem('174_theme');
  if (t === 'dark' || t === 'light') {
    document.documentElement.setAttribute('data-theme', t);
  }
})();

APP.toggleTheme = function() {
  const cur = localStorage.getItem(this.THEME_KEY);
  const isDark = cur === 'dark'
    || (!cur && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const next = isDark ? 'light' : 'dark';
  localStorage.setItem(this.THEME_KEY, next);
  document.documentElement.setAttribute('data-theme', next);
  this._updateThemeBtn();
};

APP._updateThemeBtn = function() {
  const btn = document.getElementById('_theme_btn');
  if (!btn) return;
  const cur = localStorage.getItem(this.THEME_KEY);
  const isDark = cur === 'dark'
    || (!cur && window.matchMedia('(prefers-color-scheme: dark)').matches);
  btn.textContent = isDark ? '☀️' : '🌙';
  btn.setAttribute('aria-label', isDark ? 'ライトモードに切り替え' : 'ダークモードに切り替え');
};

/* ==============================
   AIアドバイス生成（ルールベース）
   ============================== */

/**
 * ホームページ用：最優先の1文アドバイスを返す
 */
APP.generateAdvice = function() {
  const records  = this.getRecords();
  const settings = this.getSettings();
  const now      = new Date();

  if (records.length === 0) {
    return '頭痛を記録すると、あなた専用のアドバイスが表示されます。まず記録してみましょう！';
  }

  const recent = records.filter(r =>
    new Date(r.timestamp) >= new Date(now - 30 * 86400000)
  );

  // 服薬回数（健康リスク最優先）
  const medCount = recent.filter(r => r.medication && r.medication.taken).length;
  if (medCount >= 10) {
    return `今月は${medCount}回服薬しています。月10回以上は薬物乱用頭痛のリスクがあるため、一度医師に相談することをおすすめします。`;
  }

  // トリガー集計
  const trigMap = {};
  recent.forEach(r => (r.triggers || []).forEach(t => {
    trigMap[t] = (trigMap[t] || 0) + 1;
  }));
  const topEntries = Object.entries(trigMap).sort((a, b) => b[1] - a[1]);
  const top = topEntries[0];

  if (top && top[1] >= 2) {
    const [name, count] = top;
    const ratio = recent.length > 0 ? Math.round(count / recent.length * 100) : 0;
    const tips = {
      '寝不足':   `頭痛の${ratio}%が「寝不足」と重なっています。毎日同じ時間に寝起きする習慣が効果的です。`,
      '天気':     `気圧変化が頭痛のトリガーになりやすいようです（${count}回一致）。気圧アラートをONにして早めの対策を。`,
      '気圧':     `気圧変化が頭痛のトリガーになりやすいようです（${count}回一致）。気圧アラートをONにして早めの対策を。`,
      'ストレス': `「ストレス」が最多トリガーです（${count}回）。週1回、意識的にリラックスする時間を作りましょう。`,
      '生理前後': `生理周期との関連が${count}回確認されています。生理3日前からの予防的対策を医師に相談してみてください。`,
      '眼精疲労': `眼精疲労が頭痛の引き金です（${count}回）。20分ごとに20秒間・6m先を見る「20-20-20ルール」が有効です。`,
      'お酒':     `飲酒後の頭痛が${count}回記録されています。お酒と同量の水を一緒に飲むと脱水予防になります。`,
      '食事':     `食事との関連が${count}回あります。欠食や血糖値の急降下が頭痛を引き起こすことがあります。`,
      '肩こり':   `肩こりからの頭痛が${count}回あります。1時間に1度の肩回しストレッチが効果的です。`,
    };
    if (tips[name]) return tips[name];
    return `「${name}」が最多トリガーです（${count}回）。意識的に避けるか、事前の対策を取ることで頭痛を減らせるかもしれません。`;
  }

  // 曜日パターン
  if (recent.length >= 4) {
    const dayCount = [0, 0, 0, 0, 0, 0, 0];
    recent.forEach(r => { dayCount[new Date(r.timestamp).getDay()]++; });
    const maxVal = Math.max(...dayCount);
    const maxIdx = dayCount.indexOf(maxVal);
    const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
    if (maxVal >= 2) {
      const reason = (maxIdx === 0 || maxIdx === 6)
        ? '週末の睡眠リズムの乱れが' : '週中のストレス蓄積が';
      return `${dayNames[maxIdx]}曜日に頭痛が集中しています（${maxVal}回）。${reason}関係しているかもしれません。`;
    }
  }

  // 時間帯ヒント
  const h = now.getHours();
  if (h >= 6 && h < 10) {
    return '朝の頭痛は脱水が原因のことが多いです。起き抜けにコップ1杯の水を飲む習慣をつけましょう。';
  }

  // 記録数が少ない
  if (recent.length < 3) {
    return `記録が${recent.length}件です。記録が増えるほど精度の高いアドバイスができます。頭痛のたびに記録を続けましょう。`;
  }

  return `今月は${recent.length}回記録されています。引き続き記録を続けることでパターンが見えてきます。`;
};

/**
 * 分析ページ用：データドリブンなインサイトを最大n件返す
 */
APP.generateInsights = function(max) {
  max = max || 2;
  const records = this.getRecords();
  const now     = new Date();

  if (records.length < 2) {
    return [
      '記録が2件以上になるとインサイトが表示されます。',
      '頭痛を記録するたびにパターン分析の精度が上がります。',
    ].slice(0, max);
  }

  const recent = records.filter(r =>
    new Date(r.timestamp) >= new Date(now - 30 * 86400000)
  );
  const insights = [];

  // ① トリガー一致率
  const trigMap = {};
  recent.forEach(r => (r.triggers || []).forEach(t => {
    trigMap[t] = (trigMap[t] || 0) + 1;
  }));
  const topEntries = Object.entries(trigMap).sort((a, b) => b[1] - a[1]);
  if (topEntries.length > 0) {
    const [name, count] = topEntries[0];
    const ratio = recent.length > 0 ? Math.round(count / recent.length * 100) : 0;
    insights.push(
      `「${name}」が頭痛のトリガー第1位（${ratio}%の頭痛と一致）。最も注意が必要な要因です。`
    );
  }

  // ② 時間帯パターン
  if (recent.length >= 3) {
    const buckets = { '朝（〜10時）': 0, '昼（10〜14時）': 0, '夕方（14〜18時）': 0, '夜（18時〜）': 0 };
    recent.forEach(r => {
      const hr = new Date(r.timestamp).getHours();
      if      (hr < 10) buckets['朝（〜10時）']++;
      else if (hr < 14) buckets['昼（10〜14時）']++;
      else if (hr < 18) buckets['夕方（14〜18時）']++;
      else              buckets['夜（18時〜）']++;
    });
    const topTime = Object.entries(buckets).sort((a, b) => b[1] - a[1])[0];
    if (topTime[1] > 0) {
      const timeTips = {
        '朝（〜10時）':    '起床時の脱水や睡眠の質が影響している可能性があります。',
        '昼（10〜14時）':  '長時間PC作業による眼精疲労や昼食の遅れが関係していることがあります。',
        '夕方（14〜18時）':'1日のストレス蓄積や血糖低下が原因の可能性があります。',
        '夜（18時〜）':    '疲労の蓄積や夕食・飲酒との関連を確認してみてください。',
      };
      insights.push(
        `頭痛は${topTime[0]}に多く発生しています（${topTime[1]}件）。${timeTips[topTime[0]]}`
      );
    }
  }

  // ③ 服薬状況
  const medCount = recent.filter(r => r.medication && r.medication.taken).length;
  if (medCount > 0 && insights.length < max) {
    const ratio = recent.length > 0 ? Math.round(medCount / recent.length * 100) : 0;
    if (medCount >= 10) {
      insights.push(`今月の服薬回数が${medCount}回に達しています。月10回以上は薬物乱用頭痛のリスクがあります。`);
    } else {
      insights.push(`今月の服薬は${medCount}回（頭痛の${ratio}%で使用）。月10回以内が薬物乱用頭痛を防ぐ目安です。`);
    }
  }

  // ④ 強度の傾向（前半・後半比較）
  if (recent.length >= 4 && insights.length < max) {
    const half   = Math.floor(recent.length / 2);
    const older  = recent.slice(half);
    const newer  = recent.slice(0, half);
    const avgOld = older.reduce((s, r) => s + r.intensity, 0) / older.length;
    const avgNew = newer.reduce((s, r) => s + r.intensity, 0) / newer.length;
    const diff   = avgNew - avgOld;
    if (Math.abs(diff) >= 1) {
      if (diff > 0) {
        insights.push(`最近の頭痛は強度が上がる傾向にあります（+${diff.toFixed(1)}ポイント）。早めの対策や休息を心がけましょう。`);
      } else {
        insights.push(`最近の頭痛は強度が下がる傾向です（${diff.toFixed(1)}ポイント）。引き続き現在の対策を続けましょう！`);
      }
    }
  }

  if (insights.length === 0) {
    insights.push('データが蓄積されるとここに分析結果が表示されます。');
    insights.push('引き続き記録を続けることでパターンが見えてきます。');
  }

  return insights.slice(0, max);
};

/* ==============================
   通知パネル
   ============================== */
APP.NOTIF_SEEN_KEY = '174_notif_seen';

APP.openNotifPanel = function() {
  if (!document.getElementById('_notif_overlay')) {
    this._buildNotifPanel();
  }
  // 既読マーク
  localStorage.setItem(this.NOTIF_SEEN_KEY, Date.now().toString());
  this._updateBellBadge();
  document.getElementById('_notif_overlay').classList.toggle('open');
};

APP._buildNotifPanel = function() {
  // スタイル注入（初回のみ）
  if (!document.getElementById('_notif_styles')) {
    const style = document.createElement('style');
    style.id = '_notif_styles';
    style.textContent = [
      '.notif-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:600;align-items:flex-end;justify-content:center;}',
      '.notif-overlay.open{display:flex;}',
      '.notif-sheet{background:var(--color-surface);border-radius:20px 20px 0 0;width:100%;max-width:480px;max-height:80vh;overflow-y:auto;animation:slideUp 0.25s ease;}',
      '.notif-sheet-header{display:flex;align-items:center;justify-content:space-between;padding:20px 20px 16px;border-bottom:1px solid var(--color-border);position:sticky;top:0;background:var(--color-surface);z-index:1;}',
      '.notif-sheet-title{font-size:1.05rem;font-weight:700;font-family:"Zen Kaku Gothic New",sans-serif;}',
      '.notif-close-btn{background:var(--color-primary-light,#EDE9F8);border:none;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:0.9rem;color:var(--color-primary);flex-shrink:0;}',
      '.notif-perm-card{margin:16px 16px 8px;padding:16px;background:var(--color-primary-light,#EDE9F8);border-radius:12px;border-left:4px solid var(--color-primary);}',
      '.notif-perm-card.granted{border-left-color:#7DBF9E;background:rgba(125,191,158,0.12);}',
      '.notif-perm-title{font-size:0.9rem;font-weight:700;margin-bottom:6px;}',
      '.notif-perm-title.ok{color:#5A9E7A;}',
      '.notif-perm-text{font-size:0.8rem;color:var(--color-text-muted);line-height:1.55;margin-bottom:12px;}',
      '.notif-perm-text:last-child{margin-bottom:0;}',
      '.notif-perm-btn{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;padding:11px;background:var(--color-primary);color:#fff;border:none;border-radius:8px;font-family:"Noto Sans JP",sans-serif;font-size:0.9rem;font-weight:700;cursor:pointer;}',
      '.notif-section-label{font-size:0.72rem;font-weight:700;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:0.08em;padding:16px 20px 8px;}',
      '.notif-item{display:flex;gap:12px;padding:12px 20px;border-bottom:1px solid var(--color-border);}',
      '.notif-item:last-child{border-bottom:none;}',
      '.notif-item-dot{width:10px;height:10px;border-radius:50%;flex-shrink:0;margin-top:5px;}',
      '.notif-item-body{flex:1;}',
      '.notif-item-title{font-size:0.88rem;font-weight:600;margin-bottom:2px;}',
      '.notif-item-time{font-size:0.75rem;color:var(--color-text-muted);}',
      '.notif-empty{text-align:center;padding:32px 20px;color:var(--color-text-muted);font-size:0.88rem;line-height:1.8;}',
      '.notif-footer{padding:12px 20px 28px;text-align:center;}',
      '.notif-settings-link{font-size:0.82rem;color:var(--color-primary);text-decoration:none;}',
      '.notif-badge{position:absolute;top:3px;right:3px;width:8px;height:8px;background:#D97B7B;border-radius:50%;border:1.5px solid var(--color-bg,#FAFAF8);pointer-events:none;}'
    ].join('');
    document.head.appendChild(style);
  }

  const records = this.getRecords();
  const permission = ('Notification' in window) ? Notification.permission : 'denied';

  // 権限カード
  let permCard;
  if (permission !== 'granted') {
    permCard = `<div class="notif-perm-card">
      <div class="notif-perm-title">🔔 通知が無効です</div>
      <div class="notif-perm-text">気圧アラートや週次サマリーを受け取るには通知を有効にしてください。</div>
      <button class="notif-perm-btn" onclick="APP._requestAndEnableNotif()">通知を有効にする</button>
    </div>`;
  } else {
    permCard = `<div class="notif-perm-card granted">
      <div class="notif-perm-title ok">✓ 通知が有効です</div>
      <div class="notif-perm-text"><a href="settings.html" style="color:var(--color-primary)">設定</a>から気圧アラートや週次サマリーを切り替えられます。</div>
    </div>`;
  }

  // 最近の記録5件
  let activityHtml;
  if (records.length === 0) {
    activityHtml = `<div class="notif-empty">まだ記録がありません<br><small>頭痛を記録するとここに表示されます</small></div>`;
  } else {
    activityHtml = records.slice(0, 5).map(r => {
      const color = APP.intensityColor(r.intensity);
      const loc   = (r.location || []).join('・') || '場所未記録';
      const time  = APP.relativeTime(r.timestamp);
      return `<div class="notif-item">
        <div class="notif-item-dot" style="background:${color}"></div>
        <div class="notif-item-body">
          <div class="notif-item-title">頭痛を記録 — 強度 ${r.intensity}/10</div>
          <div class="notif-item-time">${loc} · ${time}</div>
        </div>
      </div>`;
    }).join('');
  }

  const overlay = document.createElement('div');
  overlay.id = '_notif_overlay';
  overlay.className = 'notif-overlay';
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.classList.remove('open');
  });
  overlay.innerHTML = `<div class="notif-sheet">
    <div class="notif-sheet-header">
      <span class="notif-sheet-title">お知らせ</span>
      <button class="notif-close-btn" onclick="document.getElementById('_notif_overlay').classList.remove('open')" aria-label="閉じる">✕</button>
    </div>
    ${permCard}
    <div class="notif-section-label">最近の記録</div>
    ${activityHtml}
    <div class="notif-footer">
      <a href="settings.html" class="notif-settings-link">通知設定を変更する →</a>
    </div>
  </div>`;
  document.body.appendChild(overlay);
};

APP._requestAndEnableNotif = async function() {
  if (!('Notification' in window)) return;
  const result = await Notification.requestPermission();
  if (result === 'granted') {
    // パネルを再構築して再表示
    const old = document.getElementById('_notif_overlay');
    if (old) old.remove();
    APP.openNotifPanel();
    // 気圧アラートをデフォルトON
    const s = APP.getSettings();
    if (!s.pressure) { s.pressure = true; APP.saveSettings(s); }
  }
};

APP._updateBellBadge = function() {
  const btn = document.querySelector('.icon-btn[aria-label="通知"]');
  if (!btn) return;
  const lastSeen = parseInt(localStorage.getItem(this.NOTIF_SEEN_KEY) || '0');
  const records  = this.getRecords();
  const hasNew   = records.some(r => new Date(r.timestamp).getTime() > lastSeen);
  let badge = btn.querySelector('.notif-badge');
  if (hasNew && !badge) {
    badge = document.createElement('span');
    badge.className = 'notif-badge';
    btn.style.position = 'relative';
    btn.appendChild(badge);
  } else if (!hasNew && badge) {
    badge.remove();
  }
};

/* ==============================
   プレミアム判定
   ============================== */
APP.FREE_RECORD_LIMIT = 30;

APP.isPremium = function() {
  return !!this.getSettings().premium;
};

// 記録を保存できるか確認（無料は30件上限）
APP.canAddRecord = function() {
  if (this.isPremium()) return true;
  return this.getRecords().length < this.FREE_RECORD_LIMIT;
};

// 分析対象の日数（無料30日、プレミアム90日）
APP.analysisDays = function() {
  return this.isPremium() ? 90 : 30;
};

/* ==============================
   API クライアント
   ============================== */
APP.API_URL    = 'https://174-api.kousakaemi2110.workers.dev';
APP.TOKEN_KEY  = '174_token';

APP.getToken  = function() { return localStorage.getItem(this.TOKEN_KEY); };
APP.setToken  = function(t) {
  if (t) localStorage.setItem(this.TOKEN_KEY, t);
  else   localStorage.removeItem(this.TOKEN_KEY);
};
APP.isLoggedIn = function() { return !!this.getToken(); };

APP.apiRequest = async function(path, options = {}) {
  const token = this.getToken();
  const res = await fetch(this.API_URL + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'サーバーエラーが発生しました');
  return data;
};

APP.register = async function(email, password, nickname) {
  const data = await this.apiRequest('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, nickname }),
  });
  this.setToken(data.token);
  return data.user;
};

APP.login = async function(email, password) {
  const data = await this.apiRequest('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  this.setToken(data.token);
  return data.user;
};

APP.logout = function() {
  this.setToken(null);
};

APP.syncToCloud = async function() {
  const records  = this.getRecords();
  const settings = this.getSettings();
  const data = await this.apiRequest('/api/sync', {
    method: 'POST',
    body: JSON.stringify({ records, settings }),
  });
  // サーバーのレコードをローカルにマージ（新しいものを追加）
  const localIds = new Set(records.map(r => r.id));
  const merged   = [...records];
  for (const r of data.records) {
    if (!localIds.has(r.id)) merged.push(r);
  }
  merged.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  this.saveRecords(merged);
  // サーバーの設定をローカルにマージ（premium状態をサーバーから取得）
  const currentSettings = this.getSettings();
  const mergedSettings = data.settings
    ? { ...currentSettings, ...data.settings, _lastSync: new Date().toISOString() }
    : { ...currentSettings, _lastSync: new Date().toISOString() };
  this.saveSettings(mergedSettings);
  return merged.length;
};

/* ==============================
   DOMContentLoaded 共通処理
   ============================== */
document.addEventListener('DOMContentLoaded', () => {
  APP.initMockData();
  APP.setActiveNav();
  APP.checkScheduledNotifications();

  // ベルボタンにクリックハンドラを設定
  const bellBtn = document.querySelector('.icon-btn[aria-label="通知"]');
  if (bellBtn) {
    bellBtn.addEventListener('click', () => APP.openNotifPanel());
    APP._updateBellBadge();
  }

  // テーマトグルボタンを注入
  const headerActions = document.querySelector('.header-actions');
  if (headerActions && !document.getElementById('_theme_btn')) {
    const themeBtn = document.createElement('button');
    themeBtn.id = '_theme_btn';
    themeBtn.className = 'icon-btn';
    themeBtn.addEventListener('click', () => APP.toggleTheme());
    headerActions.insertBefore(themeBtn, headerActions.firstChild);
    APP._updateThemeBtn();
  }

  // Service Worker 登録
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
});
