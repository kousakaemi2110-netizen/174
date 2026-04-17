/* ==============================
   174° API — Cloudflare Worker
   ============================== */

const ALLOWED_ORIGINS = [
  'https://174-app.pages.dev',
  'http://localhost',
  'http://127.0.0.1',
];

function getCors(request) {
  const origin = request.headers.get('Origin') || '';
  const allowed = ALLOWED_ORIGINS.some(o => origin === o || origin.endsWith('.174-app.pages.dev'))
    || /^https?:\/\/localhost(:\d+)?$/.test(origin)
    || /^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin);
  return {
    'Access-Control-Allow-Origin': allowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json',
  };
}

const json  = (data, status = 200, req = null) => new Response(JSON.stringify(data), { status, headers: req ? getCors(req) : { 'Content-Type': 'application/json' } });
const err   = (msg,  status = 400) => new Response(JSON.stringify({ error: msg }), { status, headers: { 'Content-Type': 'application/json' } });

/* ---------- レート制限（KV不要・インメモリ簡易実装） ---------- */
// ウォームアップ中のWorkerでリセットされるが短期攻撃には有効
const _rateLimitMap = new Map();
function checkRateLimit(key, maxPerMin = 10) {
  const now  = Date.now();
  const prev = _rateLimitMap.get(key) || [];
  const hits = prev.filter(t => now - t < 60000);
  if (hits.length >= maxPerMin) return false;
  hits.push(now);
  _rateLimitMap.set(key, hits);
  return true;
}

/* ---------- Crypto ---------- */

async function hashPassword(password) {
  const salt = crypto.randomUUID();
  const key  = await crypto.subtle.importKey('raw', enc(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc(salt), iterations: 100000, hash: 'SHA-256' }, key, 256
  );
  const hash = hex(bits);
  return `${salt}:${hash}`;
}

async function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const key  = await crypto.subtle.importKey('raw', enc(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc(salt), iterations: 100000, hash: 'SHA-256' }, key, 256
  );
  return hex(bits) === hash;
}

async function createToken(userId, secret) {
  const header  = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64u(JSON.stringify({
    sub: userId,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 30 * 86400,
  }));
  const data = `${header}.${payload}`;
  const key  = await crypto.subtle.importKey('raw', enc(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig  = await crypto.subtle.sign('HMAC', key, enc(data));
  return `${data}.${b64u(String.fromCharCode(...new Uint8Array(sig)))}`;
}

async function verifyToken(token, secret) {
  if (!token) throw new Error('認証が必要です');
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('トークン形式が不正です');
  const [header, payload, sig] = parts;
  const data = `${header}.${payload}`;
  const key  = await crypto.subtle.importKey('raw', enc(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const valid = await crypto.subtle.verify('HMAC', key,
    Uint8Array.from(fromb64u(sig), c => c.charCodeAt(0)), enc(data)
  );
  if (!valid) throw new Error('トークンが無効です');
  const p = JSON.parse(fromb64u(payload));
  if (p.exp < Math.floor(Date.now() / 1000)) throw new Error('トークンの有効期限が切れています');
  return p;
}

async function auth(request, env) {
  const header = request.headers.get('Authorization') || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  const p = await verifyToken(token, env.JWT_SECRET);
  return p.sub;
}

/* ---------- Helpers ---------- */
const enc     = s  => new TextEncoder().encode(s);
const hex     = ab => Array.from(new Uint8Array(ab)).map(b => b.toString(16).padStart(2,'0')).join('');
const b64u    = s  => btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const fromb64u = s => atob(s.replace(/-/g,'+').replace(/_/g,'/').padEnd(s.length + (4 - s.length % 4) % 4, '='));

function parseRecord(r) {
  return {
    id:         r.id,
    timestamp:  r.timestamp,
    intensity:  r.intensity,
    location:   JSON.parse(r.location  || '[]'),
    symptoms:   JSON.parse(r.symptoms  || '[]'),
    triggers:   JSON.parse(r.triggers  || '[]'),
    medication: JSON.parse(r.medication || '{}'),
  };
}

/* ---------- Email (Resend) ---------- */

async function sendEmail(to, subject, html, apiKey, fromEmail) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: fromEmail, to: [to], subject, html }),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.message || 'メール送信に失敗しました');
  }
}

/* ---------- Stripe helpers ---------- */

async function stripeReq(path, method, body, secret) {
  const opts = {
    method,
    headers: {
      'Authorization': 'Basic ' + btoa(secret + ':'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  };
  if (body) opts.body = new URLSearchParams(body).toString();
  const res = await fetch('https://api.stripe.com/v1' + path, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || 'Stripe error');
  return data;
}

async function verifyStripeWebhook(bodyText, sigHeader, secret) {
  const parts = sigHeader.split(',');
  const tPart = parts.find(p => p.startsWith('t='));
  const sPart = parts.find(p => p.startsWith('v1='));
  if (!tPart || !sPart) throw new Error('署名ヘッダーが不正です');
  const timestamp = tPart.slice(2);
  const sig       = sPart.slice(3);
  const payload   = `${timestamp}.${bodyText}`;
  const key = await crypto.subtle.importKey('raw', enc(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, enc(payload));
  if (hex(signature) !== sig) throw new Error('署名が一致しません');
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp)) > 300) throw new Error('タイムスタンプが古すぎます');
}

/* ---------- Handlers ---------- */

async function register(req, env) {
  const { email, password, nickname } = await req.json();
  if (!email || !password)   return err('メールアドレスとパスワードは必須です');
  if (password.length < 6)   return err('パスワードは6文字以上にしてください');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return err('メールアドレスの形式が正しくありません');

  const exists = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (exists) return err('このメールアドレスはすでに登録されています', 409);

  const id   = crypto.randomUUID();
  const hash = await hashPassword(password);
  await env.DB.prepare(
    'INSERT INTO users (id, email, password_hash, nickname, created_at) VALUES (?, ?, ?, ?, ?)'
  ).bind(id, email, hash, nickname || '', new Date().toISOString()).run();

  const token = await createToken(id, env.JWT_SECRET);
  return json({ token, user: { id, email, nickname: nickname || '' } }, 201);
}

async function login(req, env) {
  const { email, password } = await req.json();
  if (!email || !password) return err('メールアドレスとパスワードは必須です');

  const user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
  if (!user) return err('メールアドレスまたはパスワードが正しくありません', 401);

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) return err('メールアドレスまたはパスワードが正しくありません', 401);

  const token = await createToken(user.id, env.JWT_SECRET);
  return json({ token, user: { id: user.id, email: user.email, nickname: user.nickname } });
}

async function getMe(req, env) {
  const uid  = await auth(req, env);
  const user = await env.DB.prepare('SELECT id, email, nickname FROM users WHERE id = ?').bind(uid).first();
  if (!user) return err('ユーザーが見つかりません', 404);
  return json(user);
}

async function getRecords(req, env) {
  const uid = await auth(req, env);
  const { results } = await env.DB.prepare(
    'SELECT * FROM records WHERE user_id = ? ORDER BY timestamp DESC'
  ).bind(uid).all();
  return json(results.map(parseRecord));
}

async function createRecord(req, env) {
  const uid = await auth(req, env);
  const r   = await req.json();
  const id  = r.id || crypto.randomUUID();
  await env.DB.prepare(
    'INSERT OR REPLACE INTO records (id, user_id, timestamp, intensity, location, symptoms, triggers, medication) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    id, uid,
    r.timestamp || new Date().toISOString(),
    r.intensity  || 0,
    JSON.stringify(r.location   || []),
    JSON.stringify(r.symptoms   || []),
    JSON.stringify(r.triggers   || []),
    JSON.stringify(r.medication || {}),
  ).run();
  return json({ id }, 201);
}

async function deleteRecord(req, env, id) {
  const uid = await auth(req, env);
  await env.DB.prepare('DELETE FROM records WHERE id = ? AND user_id = ?').bind(id, uid).run();
  return json({ ok: true });
}

async function getSettings(req, env) {
  const uid = await auth(req, env);
  const row = await env.DB.prepare('SELECT data FROM settings WHERE user_id = ?').bind(uid).first();
  return json(row ? JSON.parse(row.data) : {});
}

async function updateSettings(req, env) {
  const uid  = await auth(req, env);
  const data = await req.json();
  await env.DB.prepare(
    'INSERT OR REPLACE INTO settings (user_id, data, updated_at) VALUES (?, ?, ?)'
  ).bind(uid, JSON.stringify(data), new Date().toISOString()).run();
  return json({ ok: true });
}

async function forgotPassword(req, env) {
  const { email } = await req.json();
  if (!email) return err('メールアドレスは必須です');

  const user = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  // ユーザーが存在しなくても同じレスポンスを返す（メールアドレス列挙攻撃防止）
  if (user) {
    const token   = crypto.randomUUID();
    const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1時間有効
    await env.DB.prepare(
      'INSERT OR REPLACE INTO password_resets (token, user_id, expires_at) VALUES (?, ?, ?)'
    ).bind(token, user.id, expires).run();

    const resetUrl = `${env.SITE_URL}/reset-password.html?token=${token}`;
    const html = `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;">
        <h2 style="color:#7C6FAF;font-size:1.4rem;margin-bottom:8px;">174° パスワードリセット</h2>
        <p style="color:#555;line-height:1.7;">以下のボタンからパスワードをリセットしてください。<br>このリンクは1時間のみ有効です。</p>
        <a href="${resetUrl}"
           style="display:inline-block;margin:24px 0;padding:14px 28px;background:#7C6FAF;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;">
          パスワードをリセットする
        </a>
        <p style="color:#999;font-size:0.8rem;">このメールに心当たりがない場合は無視してください。</p>
      </div>`;
    await sendEmail(email, 'パスワードリセット — 174°', html, env.RESEND_API_KEY, env.FROM_EMAIL);
  }

  return json({ ok: true });
}

async function resetPassword(req, env) {
  const { token, password } = await req.json();
  if (!token || !password)  return err('トークンとパスワードは必須です');
  if (password.length < 6)  return err('パスワードは6文字以上にしてください');

  const row = await env.DB.prepare('SELECT * FROM password_resets WHERE token = ?').bind(token).first();
  if (!row) return err('リセットリンクが無効です', 400);
  if (new Date(row.expires_at) < new Date()) return err('リセットリンクの有効期限が切れています', 400);

  const hash = await hashPassword(password);
  await env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(hash, row.user_id).run();
  await env.DB.prepare('DELETE FROM password_resets WHERE token = ?').bind(token).run();

  return json({ ok: true });
}

async function createCheckout(req, env) {
  const uid = await auth(req, env);

  const successUrl = env.SITE_URL + '/payment-success.html?session_id={CHECKOUT_SESSION_ID}';
  const cancelUrl  = env.SITE_URL + '/settings.html';

  const session = await stripeReq('/checkout/sessions', 'POST', {
    mode: 'subscription',
    'line_items[0][price]': env.STRIPE_PRICE_ID,
    'line_items[0][quantity]': '1',
    client_reference_id: uid,
    'subscription_data[metadata][user_id]': uid,
    success_url: successUrl,
    cancel_url:  cancelUrl,
  }, env.STRIPE_SECRET_KEY);

  return json({ url: session.url });
}

async function cancelSubscription(req, env) {
  const uid = await auth(req, env);
  const row = await env.DB.prepare('SELECT data FROM settings WHERE user_id = ?').bind(uid).first();
  if (!row) return err('設定が見つかりません', 404);

  const settings = JSON.parse(row.data);
  const subId = settings.stripeSubscriptionId;
  if (!subId) return err('有効なサブスクリプションがありません', 404);

  await stripeReq(`/subscriptions/${subId}`, 'DELETE', null, env.STRIPE_SECRET_KEY);

  delete settings.premium;
  delete settings.premiumSince;
  delete settings.stripeSubscriptionId;
  await env.DB.prepare(
    'INSERT OR REPLACE INTO settings (user_id, data, updated_at) VALUES (?, ?, ?)'
  ).bind(uid, JSON.stringify(settings), new Date().toISOString()).run();

  return json({ ok: true });
}

async function stripeWebhook(req, env) {
  const bodyText = await req.text();
  const sig = req.headers.get('Stripe-Signature');
  if (!sig) return err('Stripe-Signature ヘッダーがありません', 400);

  try {
    await verifyStripeWebhook(bodyText, sig, env.STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    return err('Webhook 検証エラー: ' + e.message, 400);
  }

  const event = JSON.parse(bodyText);

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const uid = session.client_reference_id;
    if (uid) {
      const row = await env.DB.prepare('SELECT data FROM settings WHERE user_id = ?').bind(uid).first();
      const s   = row ? JSON.parse(row.data) : {};
      s.premium               = true;
      s.premiumSince          = new Date().toISOString();
      s.stripeSubscriptionId  = session.subscription;
      await env.DB.prepare(
        'INSERT OR REPLACE INTO settings (user_id, data, updated_at) VALUES (?, ?, ?)'
      ).bind(uid, JSON.stringify(s), new Date().toISOString()).run();
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object;
    const uid = sub.metadata?.user_id;
    if (uid) {
      const row = await env.DB.prepare('SELECT data FROM settings WHERE user_id = ?').bind(uid).first();
      if (row) {
        const s = JSON.parse(row.data);
        delete s.premium;
        delete s.premiumSince;
        delete s.stripeSubscriptionId;
        await env.DB.prepare(
          'INSERT OR REPLACE INTO settings (user_id, data, updated_at) VALUES (?, ?, ?)'
        ).bind(uid, JSON.stringify(s), new Date().toISOString()).run();
      }
    }
  }

  return json({ received: true });
}

async function sync(req, env) {
  const uid = await auth(req, env);
  const { records, settings } = await req.json();

  // ローカルレコードを一括アップロード（既存は無視）
  if (records && records.length > 0) {
    const stmt = env.DB.prepare(
      'INSERT OR IGNORE INTO records (id, user_id, timestamp, intensity, location, symptoms, triggers, medication) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );
    await env.DB.batch(records.map(r => stmt.bind(
      r.id || crypto.randomUUID(), uid,
      r.timestamp, r.intensity || 0,
      JSON.stringify(r.location   || []),
      JSON.stringify(r.symptoms   || []),
      JSON.stringify(r.triggers   || []),
      JSON.stringify(r.medication || {}),
    )));
  }

  // 設定をマージ保存（premium関連はサーバー側を優先して上書きを防ぐ）
  const serverRow = await env.DB.prepare('SELECT data FROM settings WHERE user_id = ?').bind(uid).first();
  const serverSettings = serverRow ? JSON.parse(serverRow.data) : {};

  let mergedSettings = settings ? { ...settings } : { ...serverSettings };
  // サーバー側のpremium情報を常に保持（Stripe Webhookで設定された値を守る）
  if (serverSettings.premium)              mergedSettings.premium              = serverSettings.premium;
  if (serverSettings.premiumSince)         mergedSettings.premiumSince         = serverSettings.premiumSince;
  if (serverSettings.stripeSubscriptionId) mergedSettings.stripeSubscriptionId = serverSettings.stripeSubscriptionId;

  await env.DB.prepare(
    'INSERT OR REPLACE INTO settings (user_id, data, updated_at) VALUES (?, ?, ?)'
  ).bind(uid, JSON.stringify(mergedSettings), new Date().toISOString()).run();

  // 最新の全データを返す
  const { results } = await env.DB.prepare(
    'SELECT * FROM records WHERE user_id = ? ORDER BY timestamp DESC'
  ).bind(uid).all();

  return json({ ok: true, records: results.map(parseRecord), settings: mergedSettings });
}

async function activateSession(req, env) {
  const uid = await auth(req, env);
  const { sessionId } = await req.json();
  if (!sessionId) return err('セッションIDが必要です');

  // Stripe でチェックアウトセッションを確認
  const session = await stripeReq(`/checkout/sessions/${sessionId}`, 'GET', null, env.STRIPE_SECRET_KEY);

  // セッションがこのユーザーのものか確認
  if (session.client_reference_id !== uid) return err('セッションが一致しません', 403);
  if (session.payment_status !== 'paid') return err('支払いが完了していません', 400);

  // プレミアムを有効化（Webhookより先に処理する場合も安全）
  const row = await env.DB.prepare('SELECT data FROM settings WHERE user_id = ?').bind(uid).first();
  const s   = row ? JSON.parse(row.data) : {};
  s.premium              = true;
  s.premiumSince         = s.premiumSince || new Date().toISOString();
  s.stripeSubscriptionId = session.subscription;
  await env.DB.prepare(
    'INSERT OR REPLACE INTO settings (user_id, data, updated_at) VALUES (?, ?, ?)'
  ).bind(uid, JSON.stringify(s), new Date().toISOString()).run();

  return json({ ok: true, premium: true, premiumSince: s.premiumSince });
}

/* ---------- アカウント削除 ---------- */

async function deleteAccount(req, env) {
  const uid = await auth(req, env);

  // Stripe サブスクリプションをキャンセル
  const row = await env.DB.prepare('SELECT data FROM settings WHERE user_id = ?').bind(uid).first();
  if (row) {
    const s = JSON.parse(row.data);
    if (s.stripeSubscriptionId && env.STRIPE_SECRET_KEY) {
      await stripeReq(`/subscriptions/${s.stripeSubscriptionId}`, 'DELETE', null, env.STRIPE_SECRET_KEY)
        .catch(() => {}); // 失敗しても続行
    }
  }

  await env.DB.batch([
    env.DB.prepare('DELETE FROM records          WHERE user_id = ?').bind(uid),
    env.DB.prepare('DELETE FROM settings         WHERE user_id = ?').bind(uid),
    env.DB.prepare('DELETE FROM password_resets  WHERE user_id = ?').bind(uid),
    env.DB.prepare('DELETE FROM users            WHERE id      = ?').bind(uid),
  ]);

  return json({ ok: true });
}

/* ---------- Router ---------- */

export default {
  async fetch(request, env) {
    const cors = getCors(request);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    const ip       = request.headers.get('CF-Connecting-IP') || 'unknown';
    const { pathname } = new URL(request.url);
    const m        = request.method;

    // レスポンスにCORSヘッダーを付与するラッパー
    const withCors = (res) => {
      const r = new Response(res.body, res);
      Object.entries(cors).forEach(([k, v]) => r.headers.set(k, v));
      return r;
    };

    try {
      // 認証系エンドポイントにレート制限（IP単位・10回/分）
      const isAuthPath = pathname.startsWith('/api/auth/');
      if (isAuthPath && !checkRateLimit(`auth:${ip}`, 10)) {
        return withCors(err('リクエストが多すぎます。しばらく待ってから再試行してください。', 429));
      }

      if (pathname === '/api/auth/register'        && m === 'POST') return withCors(await register(request, env));
      if (pathname === '/api/auth/login'           && m === 'POST') return withCors(await login(request, env));
      if (pathname === '/api/auth/forgot-password' && m === 'POST') return withCors(await forgotPassword(request, env));
      if (pathname === '/api/auth/reset-password'  && m === 'POST') return withCors(await resetPassword(request, env));
      if (pathname === '/api/me'                   && m === 'GET')  return withCors(await getMe(request, env));
      if (pathname === '/api/me'                   && m === 'DELETE') return withCors(await deleteAccount(request, env));
      if (pathname === '/api/records'              && m === 'GET')  return withCors(await getRecords(request, env));
      if (pathname === '/api/records'              && m === 'POST') return withCors(await createRecord(request, env));
      if (pathname === '/api/settings'             && m === 'GET')  return withCors(await getSettings(request, env));
      if (pathname === '/api/settings'             && m === 'PUT')  return withCors(await updateSettings(request, env));
      if (pathname === '/api/sync'                 && m === 'POST') return withCors(await sync(request, env));
      if (pathname === '/api/stripe/checkout'         && m === 'POST') return withCors(await createCheckout(request, env));
      if (pathname === '/api/stripe/cancel'           && m === 'POST') return withCors(await cancelSubscription(request, env));
      if (pathname === '/api/stripe/activate-session' && m === 'POST') return withCors(await activateSession(request, env));
      if (pathname === '/api/stripe/webhook'          && m === 'POST') return stripeWebhook(request, env); // Webhookはそのまま

      const del = pathname.match(/^\/api\/records\/([^/]+)$/);
      if (del && m === 'DELETE') return withCors(await deleteRecord(request, env, del[1]));

      return withCors(err('Not found', 404));
    } catch (e) {
      const status = e.message.includes('認証') || e.message.includes('トークン') ? 401 : 500;
      return withCors(err(e.message, status));
    }
  },
};
