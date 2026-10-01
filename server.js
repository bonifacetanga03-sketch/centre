import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = join(ROOT, 'data');
const DB_FILE = join(DATA_DIR, 'etatcivil.sqlite');
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const sessions = new Map();

await mkdir(DATA_DIR, { recursive: true });
const db = new DatabaseSync(DB_FILE);
db.exec('PRAGMA foreign_keys = ON;');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('citizen','agent','officer','admin')),
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS acts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ref TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL CHECK(type IN ('Naissance','Mariage','Décès')),
    person TEXT NOT NULL,
    event_date TEXT NOT NULL,
    place TEXT NOT NULL,
    centre TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('Brouillon','En attente','Validé')),
    notes TEXT NOT NULL DEFAULT '',
    created_by INTEGER REFERENCES users(id),
    validated_by INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ref TEXT NOT NULL UNIQUE,
    user_id INTEGER REFERENCES users(id),
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    document TEXT NOT NULL,
    act_ref TEXT NOT NULL,
    reason TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL CHECK(status IN ('Reçue','En traitement','Validée','Prête','Rejetée')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS mentions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    act_ref TEXT NOT NULL,
    type TEXT NOT NULL,
    source_ref TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    author_id INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_ref TEXT NOT NULL,
    details TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );
`);

const now = () => new Date().toISOString();
const passwordRecord = password => {
  const salt = randomBytes(16).toString('hex');
  return { salt, hash: scryptSync(password, salt, 64).toString('hex') };
};
const verifyPassword = (password, user) => {
  const calculated = Buffer.from(scryptSync(password, user.password_salt, 64).toString('hex'), 'hex');
  const stored = Buffer.from(user.password_hash, 'hex');
  return stored.length === calculated.length && timingSafeEqual(stored, calculated);
};
const clean = value => String(value ?? '').trim();
const roleLabel = { citizen: 'Citoyen', agent: "Agent d'état civil", officer: "Officier d'état civil", admin: 'Administrateur système' };
const publicUser = user => ({ id: user.id, name: user.name, email: user.email, role: user.role, roleLabel: roleLabel[user.role] });

function seed() {
  const exists = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
  if (exists) return;
  const users = [
    ['Aline Mvondo', 'agent@etatcivil.cm', 'agent'],
    ['Olivier Ndzié', 'officier@etatcivil.cm', 'officer'],
    ['Nadia Biyong', 'admin@etatcivil.cm', 'admin'],
    ['Marie Tchoumi', 'citoyen@etatcivil.cm', 'citizen']
  ];
  for (const [name, email, role] of users) {
    const password = passwordRecord('EtatCivil2026!');
    db.prepare('INSERT INTO users (name,email,password_hash,password_salt,role,created_at) VALUES (?,?,?,?,?,?)').run(name, email, password.hash, password.salt, role, now());
  }
  const usersByEmail = Object.fromEntries(db.prepare('SELECT id,email FROM users').all().map(item => [item.email, item.id]));
  const seedActs = [
    ['NAI-2026-00421', 'Naissance', 'Mbarga Lionel Junior', '2026-09-27', 'Douala', 'Douala I', 'Validé', usersByEmail['agent@etatcivil.cm'], usersByEmail['officier@etatcivil.cm']],
    ['MAR-2026-00118', 'Mariage', 'Etoa Clarisse & Nguema Paul', '2026-09-26', 'Douala', 'Douala I', 'En attente', usersByEmail['agent@etatcivil.cm'], null],
    ['DEC-2026-00089', 'Décès', 'Fouda Henriette', '2026-09-25', 'Douala', 'Douala I', 'Validé', usersByEmail['agent@etatcivil.cm'], usersByEmail['officier@etatcivil.cm']],
    ['NAI-2026-00420', 'Naissance', 'Biyong Sarah', '2026-09-24', 'Douala', 'Douala I', 'Brouillon', usersByEmail['agent@etatcivil.cm'], null],
    ['NAI-2026-00419', 'Naissance', 'Tchoumi Ethan', '2026-09-23', 'Douala', 'Douala I', 'Validé', usersByEmail['agent@etatcivil.cm'], usersByEmail['officier@etatcivil.cm']],
    ['MAR-2026-00117', 'Mariage', 'Kouam Nadège & Mbah Eric', '2026-09-21', 'Douala', 'Douala I', 'Validé', usersByEmail['agent@etatcivil.cm'], usersByEmail['officier@etatcivil.cm']]
  ];
  for (const row of seedActs) {
    db.prepare('INSERT INTO acts (ref,type,person,event_date,place,centre,status,created_by,validated_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(...row, now(), now());
  }
  const seedRequests = [
    ['DEM-2026-00128', usersByEmail['citoyen@etatcivil.cm'], 'Marie Tchoumi', 'citoyen@etatcivil.cm', 'Extrait de naissance', 'NAI-2001-00547', 'Dossier de scolarité', 'Reçue'],
    ['DEM-2026-00127', null, 'Mathieu Kalla', 'm.kalla@example.cm', 'Copie intégrale', 'MAR-2019-00218', 'Usage administratif', 'Reçue'],
    ['DEM-2026-00126', null, 'Aïcha Choupo', 'a.choupo@example.cm', 'Extrait de mariage', 'MAR-2024-00083', 'Dossier de visa', 'En traitement'],
    ['DEM-2026-00125', null, 'David Momo', 'd.momo@example.cm', 'Extrait de naissance', 'NAI-1998-00392', 'Usage personnel', 'Prête']
  ];
  for (const row of seedRequests) db.prepare('INSERT INTO requests (ref,user_id,name,email,document,act_ref,reason,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)').run(...row, now(), now());
  const seedMentions = [
    ['MAR-2021-00114', 'Divorce', 'Jugement N° 245/TC/2026', 'Dissolution du mariage', usersByEmail['officier@etatcivil.cm']],
    ['NAI-2023-00271', 'Reconnaissance', 'Déclaration N° REC-114/26', 'Reconnaissance d’enfant', usersByEmail['agent@etatcivil.cm']],
    ['NAI-2018-00691', 'Rectification', 'Ordonnance N° 88/TPI/26', 'Rectification judiciaire', usersByEmail['officier@etatcivil.cm']]
  ];
  for (const row of seedMentions) db.prepare('INSERT INTO mentions (act_ref,type,source_ref,notes,author_id,created_at) VALUES (?,?,?,?,?,?)').run(...row, now());
  audit(usersByEmail['officier@etatcivil.cm'], 'VALIDATION', 'act', 'NAI-2026-00421', 'Acte validé');
  audit(usersByEmail['agent@etatcivil.cm'], 'CREATION', 'request', 'DEM-2026-00128', 'Demande citoyenne reçue');
}
function audit(userId, action, entityType, entityRef, details = '') {
  db.prepare('INSERT INTO audit_log (user_id,action,entity_type,entity_ref,details,created_at) VALUES (?,?,?,?,?,?)').run(userId, action, entityType, entityRef, details, now());
}
seed();

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const fail = (status, message) => { throw new HttpError(status, message); };
const json = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(body));
};
const safeJson = async req => new Promise((resolve, reject) => {
  let raw = ''; let length = 0;
  req.on('data', chunk => { length += chunk.length; if (length > 1_000_000) reject(new HttpError(413, 'Corps de requête trop volumineux.')); else raw += chunk; });
  req.on('end', () => { if (!raw) return resolve({}); try { resolve(JSON.parse(raw)); } catch { reject(new HttpError(400, 'JSON invalide.')); } });
  req.on('error', () => reject(new HttpError(400, 'Requête invalide.')));
});
function currentUser(req) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const session = sessions.get(token);
  if (!session || session.expiresAt < Date.now()) { sessions.delete(token); return null; }
  return db.prepare('SELECT * FROM users WHERE id=? AND active=1').get(session.userId) || null;
}
const requireAuth = req => currentUser(req) || fail(401, 'Votre session a expiré. Veuillez vous reconnecter.');
const requireRoles = (req, roles) => { const user = requireAuth(req); if (!roles.includes(user.role)) fail(403, 'Vous ne disposez pas des droits nécessaires.'); return user; };
const dateLabel = iso => new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${iso}T12:00:00`));
function listActs() { return db.prepare('SELECT id,ref,type,person,event_date AS eventDate,place,centre,status,notes,created_at AS createdAt,updated_at AS updatedAt FROM acts ORDER BY id DESC').all(); }
function listRequests(user = null) {
  const sql = user?.role === 'citizen' ? 'SELECT id,ref,name,email,document,act_ref AS act,status,created_at AS createdAt,updated_at AS updatedAt FROM requests WHERE user_id=? ORDER BY id DESC' : 'SELECT id,ref,name,email,document,act_ref AS act,status,created_at AS createdAt,updated_at AS updatedAt FROM requests ORDER BY id DESC';
  return user?.role === 'citizen' ? db.prepare(sql).all(user.id) : db.prepare(sql).all();
}
function listMentions() { return db.prepare('SELECT m.id,m.act_ref AS act,m.type,m.source_ref AS source,m.notes,u.name AS author,m.created_at AS createdAt FROM mentions m LEFT JOIN users u ON u.id=m.author_id ORDER BY m.id DESC').all(); }
function stats() {
  const acts = db.prepare('SELECT type,status FROM acts').all();
  const requests = db.prepare('SELECT status FROM requests').all();
  return {
    actsTotal: acts.length,
    pendingActs: acts.filter(item => item.status !== 'Validé').length,
    validatedActs: acts.filter(item => item.status === 'Validé').length,
    requestsTotal: requests.length,
    receivedRequests: requests.filter(item => item.status === 'Reçue').length,
    birthCount: acts.filter(item => item.type === 'Naissance').length,
    marriageCount: acts.filter(item => item.type === 'Mariage').length,
    deathCount: acts.filter(item => item.type === 'Décès').length
  };
}
function nextReference(prefix, table) {
  const maxId = db.prepare(`SELECT COALESCE(MAX(id), 0) + 1 AS nextId FROM ${table}`).get().nextId;
  return `${prefix}-${new Date().getFullYear()}-${String(maxId).padStart(5, '0')}`;
}
function readId(pathname, expression) { const match = pathname.match(expression); return match ? Number(match[1]) : null; }

async function api(req, res, pathname) {
  if (req.method === 'GET' && pathname === '/api/health') return json(res, 200, { status: 'ok' });
  if (req.method === 'POST' && pathname === '/api/auth/login') {
    const body = await safeJson(req); const email = clean(body.email).toLowerCase(); const password = String(body.password || '');
    if (!email || !password) fail(422, 'Adresse e-mail et mot de passe requis.');
    const user = db.prepare('SELECT * FROM users WHERE email=? AND active=1').get(email);
    if (!user || !verifyPassword(password, user)) fail(401, 'Identifiants incorrects.');
    const token = randomBytes(32).toString('base64url'); sessions.set(token, { userId: user.id, expiresAt: Date.now() + SESSION_TTL_MS }); audit(user.id, 'CONNEXION', 'user', String(user.id), 'Connexion réussie');
    return json(res, 200, { token, user: publicUser(user) });
  }
  if (req.method === 'POST' && pathname === '/api/auth/logout') { const token = req.headers.authorization?.replace(/^Bearer\s+/i, ''); if (token) sessions.delete(token); return json(res, 204, {}); }
  if (req.method === 'GET' && pathname === '/api/auth/me') return json(res, 200, { user: publicUser(requireAuth(req)) });
  if (req.method === 'GET' && pathname === '/api/bootstrap') {
    const user = requireAuth(req);
    if (user.role === 'citizen') return json(res, 200, { user: publicUser(user), requests: listRequests(user) });
    return json(res, 200, { user: publicUser(user), acts: listActs(), requests: listRequests(user), mentions: listMentions(), stats: stats(), audit: db.prepare('SELECT a.action,a.entity_ref AS entityRef,a.created_at AS createdAt,u.name FROM audit_log a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT 5').all() });
  }
  if (req.method === 'GET' && pathname === '/api/acts') { requireRoles(req, ['agent', 'officer', 'admin']); return json(res, 200, { acts: listActs() }); }
  if (req.method === 'POST' && pathname === '/api/acts') {
    const user = requireRoles(req, ['agent', 'officer', 'admin']); const body = await safeJson(req); const type = clean(body.type); const person = clean(body.person); const eventDate = clean(body.eventDate); const place = clean(body.place); const centre = clean(body.centre) || 'Douala I';
    if (!['Naissance', 'Mariage', 'Décès'].includes(type) || !person || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate) || !place) fail(422, 'Veuillez renseigner les champs obligatoires avec des valeurs valides.');
    const prefix = type === 'Naissance' ? 'NAI' : type === 'Mariage' ? 'MAR' : 'DEC'; const ref = nextReference(prefix, 'acts');
    db.prepare('INSERT INTO acts (ref,type,person,event_date,place,centre,status,notes,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(ref, type, person.slice(0, 150), eventDate, place.slice(0, 100), centre.slice(0, 100), user.role === 'officer' ? 'Validé' : 'En attente', clean(body.notes).slice(0, 1500), user.id, now(), now());
    audit(user.id, 'CREATION', 'act', ref, `Création d’un acte de ${type.toLowerCase()}`); return json(res, 201, { act: db.prepare('SELECT id,ref,type,person,event_date AS eventDate,place,centre,status,notes,created_at AS createdAt FROM acts WHERE ref=?').get(ref) });
  }
  const validateId = readId(pathname, /^\/api\/acts\/(\d+)\/validate$/);
  if (req.method === 'POST' && validateId) {
    const user = requireRoles(req, ['officer', 'admin']); const act = db.prepare('SELECT * FROM acts WHERE id=?').get(validateId); if (!act) fail(404, 'Acte introuvable.');
    db.prepare("UPDATE acts SET status='Validé',validated_by=?,updated_at=? WHERE id=?").run(user.id, now(), validateId); audit(user.id, 'VALIDATION', 'act', act.ref, 'Acte validé et signé en interne');
    return json(res, 200, { act: db.prepare('SELECT id,ref,type,person,event_date AS eventDate,place,centre,status,notes,created_at AS createdAt FROM acts WHERE id=?').get(validateId) });
  }
  if (req.method === 'GET' && pathname === '/api/requests') return json(res, 200, { requests: listRequests(requireAuth(req)) });
  if (req.method === 'POST' && pathname === '/api/requests') {
    const user = requireAuth(req); const body = await safeJson(req); const document = clean(body.document); const act = clean(body.act).toUpperCase(); const name = clean(body.name) || user.name; const email = clean(body.email).toLowerCase() || user.email;
    if (!['Extrait de naissance', 'Copie intégrale', 'Extrait de mariage', 'Extrait de décès'].includes(document) || !act || !name || !email.includes('@')) fail(422, 'Veuillez compléter correctement votre demande.');
    const ref = nextReference('DEM', 'requests'); db.prepare('INSERT INTO requests (ref,user_id,name,email,document,act_ref,reason,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)').run(ref, user.id, name.slice(0, 150), email.slice(0, 150), document, act.slice(0, 50), clean(body.reason).slice(0, 1000), 'Reçue', now(), now());
    audit(user.id, 'CREATION', 'request', ref, 'Demande citoyenne créée'); return json(res, 201, { request: db.prepare('SELECT id,ref,name,email,document,act_ref AS act,status,created_at AS createdAt FROM requests WHERE ref=?').get(ref) });
  }
  const requestId = readId(pathname, /^\/api\/requests\/(\d+)\/progress$/);
  if (req.method === 'POST' && requestId) {
    const user = requireRoles(req, ['agent', 'officer', 'admin']); const body = await safeJson(req); const request = db.prepare('SELECT * FROM requests WHERE id=?').get(requestId); if (!request) fail(404, 'Demande introuvable.');
    const transitions = { 'Reçue': 'En traitement', 'En traitement': 'Prête' }; const status = clean(body.status) || transitions[request.status]; if (!['En traitement', 'Prête', 'Rejetée'].includes(status)) fail(422, 'Statut de demande invalide.');
    db.prepare('UPDATE requests SET status=?,updated_at=? WHERE id=?').run(status, now(), requestId); audit(user.id, 'MISE_A_JOUR', 'request', request.ref, `Demande passée au statut ${status}`);
    return json(res, 200, { request: db.prepare('SELECT id,ref,name,email,document,act_ref AS act,status,created_at AS createdAt,updated_at AS updatedAt FROM requests WHERE id=?').get(requestId) });
  }
  if (req.method === 'GET' && pathname === '/api/mentions') { requireRoles(req, ['agent', 'officer', 'admin']); return json(res, 200, { mentions: listMentions() }); }
  if (req.method === 'POST' && pathname === '/api/mentions') {
    const user = requireRoles(req, ['agent', 'officer', 'admin']); const body = await safeJson(req); const act = clean(body.act).toUpperCase(); const type = clean(body.type); const source = clean(body.source);
    if (!act || !source || !['Divorce', 'Reconnaissance', 'Rectification', 'Séparation de corps'].includes(type)) fail(422, 'Les informations de la mention sont invalides.');
    db.prepare('INSERT INTO mentions (act_ref,type,source_ref,notes,author_id,created_at) VALUES (?,?,?,?,?,?)').run(act.slice(0, 50), type, source.slice(0, 200), clean(body.notes).slice(0, 1500), user.id, now()); audit(user.id, 'CREATION', 'mention', act, `Mention ${type.toLowerCase()} ajoutée`);
    return json(res, 201, { mention: listMentions()[0] });
  }
  if (req.method === 'POST' && pathname === '/api/users') {
    const administrator = requireRoles(req, ['admin']); const body = await safeJson(req); const name = clean(body.name); const email = clean(body.email).toLowerCase(); const role = clean(body.role); const password = String(body.password || '');
    if (!name || !email.includes('@') || !['agent', 'officer', 'admin'].includes(role) || password.length < 10) fail(422, 'Nom, e-mail, rôle et mot de passe temporaire valide sont requis.');
    const existing = db.prepare('SELECT id FROM users WHERE email=?').get(email); if (existing) fail(409, 'Un compte existe déjà avec cette adresse e-mail.');
    const record = passwordRecord(password); const result = db.prepare('INSERT INTO users (name,email,password_hash,password_salt,role,created_at) VALUES (?,?,?,?,?,?)').run(name.slice(0, 150), email.slice(0, 150), record.hash, record.salt, role, now());
    audit(administrator.id, 'CREATION', 'user', String(result.lastInsertRowid), `Création du compte ${email}`);
    return json(res, 201, { user: publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(result.lastInsertRowid)) });
  }
  if (req.method === 'GET' && pathname === '/api/statistics') { requireRoles(req, ['officer', 'admin']); return json(res, 200, { stats: stats() }); }
  if (req.method === 'GET' && pathname === '/api/audit') { requireRoles(req, ['admin']); return json(res, 200, { audit: db.prepare('SELECT a.action,a.entity_type AS entityType,a.entity_ref AS entityRef,a.details,a.created_at AS createdAt,u.name FROM audit_log a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT 100').all() }); }
  if (req.method === 'GET' && pathname.startsWith('/api/verify/')) {
    const code = decodeURIComponent(pathname.split('/').pop()).toUpperCase(); const parts = code.split('-'); const candidate = code.startsWith('EC-') && parts.length === 3 ? `NAI-${parts[1]}-${String(Number(parts[2])).padStart(5, '0')}` : code; const act = db.prepare("SELECT ref,type,person,event_date AS eventDate,centre,status FROM acts WHERE ref=? OR ref=?").get(code, candidate);
    if (!act || act.status !== 'Validé') return json(res, 404, { valid: false, message: 'Aucun document authentique correspondant à ce numéro.' });
    return json(res, 200, { valid: true, document: { number: code, type: `Acte de ${act.type.toLowerCase()}`, holder: act.person, eventDate: act.eventDate, centre: act.centre } });
  }
  fail(404, 'Route API introuvable.');
}

const contentTypes = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
async function staticFile(res, pathname) {
  const decoded = decodeURIComponent(pathname === '/' ? '/index.html' : pathname);
  const relative = normalize(decoded).replace(/^([\\/])+/, '');
  if (relative.startsWith('..') || relative.startsWith('data')) return json(res, 403, { error: 'Accès refusé.' });
  const file = join(ROOT, relative);
  if (!file.startsWith(ROOT) || !existsSync(file)) return json(res, 404, { error: 'Fichier introuvable.' });
  const buffer = await readFile(file); res.writeHead(200, { 'Content-Type': contentTypes[extname(file)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'Content-Security-Policy': "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'" }); res.end(buffer);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    if (url.pathname.startsWith('/api/')) return await api(req, res, url.pathname);
    if (!['GET', 'HEAD'].includes(req.method || 'GET')) return json(res, 405, { error: 'Méthode non autorisée.' });
    if (req.method === 'HEAD') return res.writeHead(200).end();
    return await staticFile(res, url.pathname);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    if (status === 500) console.error(error);
    return json(res, status, { error: error.message || 'Une erreur inattendue est survenue.' });
  }
});
server.listen(PORT, () => console.log(`ÉtatCivil est disponible sur http://localhost:${PORT}`));
