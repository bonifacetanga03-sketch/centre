(() => {
  const offlineActs = [
    { id: 1, ref: 'NAI-2026-00421', type: 'Naissance', person: 'Mbarga Lionel Junior', eventDate: '2026-09-27', place: 'Douala', centre: 'Douala I', status: 'Validé', createdAt: new Date().toISOString() },
    { id: 2, ref: 'MAR-2026-00118', type: 'Mariage', person: 'Etoa Clarisse & Nguema Paul', eventDate: '2026-09-26', place: 'Douala', centre: 'Douala I', status: 'En attente', createdAt: new Date().toISOString() },
    { id: 3, ref: 'DEC-2026-00089', type: 'Décès', person: 'Fouda Henriette', eventDate: '2026-09-25', place: 'Douala', centre: 'Douala I', status: 'Validé', createdAt: new Date().toISOString() },
    { id: 4, ref: 'NAI-2026-00420', type: 'Naissance', person: 'Biyong Sarah', eventDate: '2026-09-24', place: 'Douala', centre: 'Douala I', status: 'Brouillon', createdAt: new Date().toISOString() }
  ];
  const offlineRequests = [
    { id: 1, ref: 'DEM-2026-00128', name: 'Fabiola Ndzié', email: 'f.ndzie@example.cm', document: 'Extrait de naissance', act: 'NAI-2001-00547', createdAt: new Date().toISOString(), status: 'Reçue' },
    { id: 2, ref: 'DEM-2026-00127', name: 'Mathieu Kalla', email: 'm.kalla@example.cm', document: 'Copie intégrale', act: 'MAR-2019-00218', createdAt: new Date().toISOString(), status: 'Reçue' },
    { id: 3, ref: 'DEM-2026-00126', name: 'Aïcha Choupo', email: 'a.choupo@example.cm', document: 'Extrait de mariage', act: 'MAR-2024-00083', createdAt: new Date().toISOString(), status: 'En traitement' },
    { id: 4, ref: 'DEM-2026-00125', name: 'David Momo', email: 'd.momo@example.cm', document: 'Extrait de naissance', act: 'NAI-1998-00392', createdAt: new Date().toISOString(), status: 'Prête' }
  ];
  const offlineMentions = [
    { id: 1, act: 'MAR-2021-00114', type: 'Divorce', source: 'Jugement N° 245/TC/2026', author: 'Olivier Ndzié', createdAt: new Date().toISOString() },
    { id: 2, act: 'NAI-2023-00271', type: 'Reconnaissance', source: 'Déclaration N° REC-114/26', author: 'Aline Mvondo', createdAt: new Date().toISOString() }
  ];
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const escape = (value = '') => String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[char]));
  const icon = name => `<svg><use href="#${name}"/></svg>`;
  const tokenKey = 'etatcivil.api.token';
  const state = { token: localStorage.getItem(tokenKey), user: null, acts: [], requests: [], mentions: [], stats: {}, audit: [], offline: false };
  const roleName = { citizen: 'Citoyen', agent: "Agent d'état civil", officer: "Officier d'état civil", admin: 'Administrateur système' };
  const typeClass = type => type === 'Naissance' ? 'birth' : type === 'Mariage' ? 'marriage' : 'death';
  const actIcon = type => type === 'Mariage' ? 'i-users' : type === 'Décès' ? 'i-shield' : 'i-file';
  const statusClass = status => ['Validé', 'Prête'].includes(status) ? 'valid' : ['En attente', 'Reçue', 'En traitement'].includes(status) ? 'pending' : 'draft';
  const statusBadge = status => `<span class="status ${statusClass(status)}">${escape(status)}</span>`;
  const shortDate = value => {
    if (!value) return '—';
    const date = new Date(value.includes('T') ? value : `${value}T12:00:00`);
    return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
  };
  const relative = value => {
    if (!value) return '—'; const difference = Math.max(0, Date.now() - new Date(value).valueOf()); const minutes = Math.floor(difference / 60000);
    if (minutes < 2) return 'À l’instant'; if (minutes < 60) return `Il y a ${minutes} min`; if (minutes < 1440) return `Il y a ${Math.floor(minutes / 60)} h`; return shortDate(value);
  };
  const initials = value => String(value).trim().split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase();
  const nextOfflineRef = (prefix, items) => `${prefix}-2026-${String(Math.max(0, ...items.map(item => Number(String(item.ref).split('-').pop()) || 0)) + 1).padStart(5, '0')}`;
  const currentRole = () => state.user?.role || 'agent';
  const internal = () => ['agent', 'officer', 'admin'].includes(currentRole());
  const canValidate = () => ['officer', 'admin'].includes(currentRole());

  async function request(path, options = {}) {
    if (state.offline) throw new Error('Mode hors connexion');
    const headers = { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}), ...(options.headers || {}) };
    const response = await fetch(`/api${path}`, { ...options, headers });
    if (response.status === 204) return null;
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Une erreur est survenue.');
    return body;
  }
  const post = (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) });

  function updateIdentity() {
    const user = state.user || { name: 'Aline Mvondo', role: 'agent', roleLabel: roleName.agent };
    $('#agent-name').textContent = user.name;
    $('#agent-role').textContent = user.roleLabel || roleName[user.role];
    $('#agent-initials').textContent = initials(user.name);
    $('#session-role').textContent = user.roleLabel || roleName[user.role];
    $('#citizen-switch').classList.toggle('hidden', user.role === 'citizen');
  }
  function renderActs() {
    const search = ($('#registry-search')?.value || '').trim().toLowerCase(); const type = $('#registry-type')?.value || 'all'; const status = $('#registry-status')?.value || 'all';
    const acts = state.acts.filter(act => (type === 'all' || act.type === type) && (status === 'all' || act.status === status) && (!search || `${act.ref} ${act.person} ${act.place} ${act.centre}`.toLowerCase().includes(search)));
    const renderRow = act => `<tr><td><b>${escape(act.ref)}</b></td><td><span class="tiny-type ${typeClass(act.type)}">${icon(actIcon(act.type))}</span> ${escape(act.type)}</td><td><b>${escape(act.person)}</b></td><td>${shortDate(act.eventDate)} · ${escape(act.place)}</td><td>${escape(act.centre)}</td><td>${statusBadge(act.status)}</td><td>${act.status !== 'Validé' && canValidate() ? `<button class="text-button act-validate" data-id="${act.id}">Valider</button>` : '<button class="row-action" aria-label="Options">•••</button>'}</td></tr>`;
    $('#registry-body').innerHTML = acts.map(renderRow).join('') || '<tr><td colspan="7" class="empty-row">Aucun acte ne correspond à votre recherche.</td></tr>';
    $('#registry-count').textContent = `${acts.length} acte${acts.length > 1 ? 's' : ''} affiché${acts.length > 1 ? 's' : ''}`;
    $('#recent-acts').innerHTML = state.acts.slice(0, 4).map(act => `<tr><td><span class="type-cell"><span class="tiny-type ${typeClass(act.type)}">${icon(actIcon(act.type))}</span>${escape(act.type)}</span></td><td><b>${escape(act.ref)}</b></td><td>${escape(act.person)}</td><td>${shortDate(act.createdAt || act.eventDate)}</td><td>${statusBadge(act.status)}</td><td><button class="row-action" aria-label="Options">•••</button></td></tr>`).join('');
    const st = { ...state.stats, actsTotal: state.acts.length, pendingActs: state.acts.filter(act => act.status !== 'Validé').length, validatedActs: state.acts.filter(act => act.status === 'Validé').length };
    $('#stat-acts').textContent = st.actsTotal || 0; $('#stat-waiting').textContent = st.pendingActs || 0;
  }
  function renderRequests() {
    const search = ($('#request-search')?.value || '').trim().toLowerCase(); const type = $('#request-type')?.value || 'all'; const filter = document.querySelector('.summary-tile.selected')?.dataset.requestFilter || 'all';
    const requests = state.requests.filter(req => (filter === 'all' || req.status === filter) && (type === 'all' || req.document === type) && (!search || `${req.name} ${req.ref} ${req.document}`.toLowerCase().includes(search)));
    $('#request-list').innerHTML = requests.map(req => `<article class="request-item"><div class="request-avatar">${escape(initials(req.name))}</div><div><h3>${escape(req.name)}</h3><p>${escape(req.ref)} · ${escape(req.email)}</p></div><div class="request-detail"><b>${escape(req.document)}</b>Acte concerné : ${escape(req.act)}</div><div><p class="request-detail">Reçue ${relative(req.createdAt)}</p>${statusBadge(req.status)}</div><button class="text-button request-detail-button" data-id="${req.id}">${internal() ? 'Traiter' : 'Consulter'} ${icon('i-chevron')}</button></article>`).join('') || '<p class="empty-row">Aucune demande ne correspond à ces critères.</p>';
    const received = state.requests.filter(req => req.status === 'Reçue').length; $('#stat-requests').textContent = state.requests.length; $('#all-requests-number').textContent = state.requests.length; $('#received-number').textContent = received; $('#request-badge').textContent = received;
    $('#urgent-list').innerHTML = state.requests.filter(req => req.status === 'Reçue').slice(0, 3).map(req => `<div class="urgent-item"><span class="urgent-icon ${req.document.includes('naissance') ? 'teal-bg' : ''}">${icon(req.document.includes('naissance') ? 'i-file' : 'i-users')}</span><div><h3>${escape(req.document)} à instruire</h3><p>${escape(req.name)} · ${escape(req.ref)}</p></div><button class="request-detail-button" data-id="${req.id}">Traiter</button></div>`).join('') || `<div class="urgent-item"><span class="urgent-icon teal-bg">${icon('i-check')}</span><div><h3>Tout est à jour</h3><p>Aucune demande à instruire pour le moment.</p></div></div>`;
  }
  function renderMentions() { $('#mentions-body').innerHTML = state.mentions.map(item => `<tr><td><b>${escape(item.act)}</b></td><td>${escape(item.type)}</td><td>${escape(item.source)}</td><td>${escape(item.author)}</td><td>${shortDate(item.createdAt)}</td><td><button class="row-action" aria-label="Options">•••</button></td></tr>`).join(''); }
  function renderAll() { updateIdentity(); renderActs(); renderRequests(); renderMentions(); }

  function switchView(view) {
    $$('.view').forEach(item => item.classList.toggle('active', item.id === `${view}-view`)); $$('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.view === view));
    const labels = { dashboard: 'Tableau de bord', registry: 'Registre des actes', requests: 'Demandes citoyennes', mentions: 'Mentions marginales', statistics: 'Statistiques', admin: 'Administration' }; $('#breadcrumb').innerHTML = `Espace interne <span>/</span> ${labels[view]}`; $('#sidebar').classList.remove('open'); window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  let toastTimer;
  function showToast(message, isError = false) { const node = $('#toast'); $('#toast-message').textContent = message; node.classList.remove('hidden'); node.style.background = isError ? '#9d4248' : '#263b45'; clearTimeout(toastTimer); toastTimer = setTimeout(() => node.classList.add('hidden'), 3500); }
  function showLogin(error = '') { $('#app').classList.add('hidden'); $('#citizen-portal').classList.add('hidden'); $('#login-screen').classList.remove('hidden'); const note = $('#login-error'); note.textContent = error; note.classList.toggle('hidden', !error); }
  function showInternal() { $('#login-screen').classList.add('hidden'); $('#citizen-portal').classList.add('hidden'); $('#app').classList.remove('hidden'); switchView('dashboard'); }
  function showCitizen() { $('#login-screen').classList.add('hidden'); $('#app').classList.add('hidden'); $('#citizen-portal').classList.remove('hidden'); window.scrollTo(0, 0); }

  function openModal(kind, data = null) {
    const content = $('#modal-content');
    if (kind === 'act') content.innerHTML = `<h2 id="modal-title">Enregistrer un nouvel acte</h2><p>Les informations seront enregistrées dans la base sécurisée puis soumises à validation.</p><form id="act-form"><div class="form-grid"><label>Type d'acte<select name="type" required><option>Naissance</option><option>Mariage</option><option>Décès</option></select></label><label>Centre d'état civil<select name="centre"><option>Douala I</option><option>Douala II</option><option>Bonabéri</option></select></label><label class="wide">Personne concernée<input name="person" required placeholder="Ex. Nom Prénom" autocomplete="name" /></label><label>Date de l'événement<input name="eventDate" type="date" required /></label><label>Lieu de l'événement<input name="place" required placeholder="Ex. Douala" /></label><label class="wide">Observations<textarea name="notes" placeholder="Informations complémentaires (facultatif)"></textarea></label></div><div class="modal-actions"><button class="outline-button" type="button" data-close-modal>Annuler</button><button class="primary-button" type="submit">Enregistrer l'acte</button></div></form>`;
    if (kind === 'request') content.innerHTML = `<h2 id="modal-title">Faire une demande</h2><p>Votre demande est transmise en toute sécurité au Centre d'État Civil de Douala I.</p><form id="public-request-form"><div class="form-grid"><label>Type de document<select name="document"><option>Extrait de naissance</option><option>Copie intégrale</option><option>Extrait de mariage</option><option>Extrait de décès</option></select></label><label>Référence de l'acte<input name="act" required placeholder="Ex. NAI-2020-00125" /></label><label>Nom complet du demandeur<input name="name" value="${escape(state.user?.name || '')}" required placeholder="Votre nom et prénom" autocomplete="name" /></label><label>Adresse e-mail<input name="email" type="email" value="${escape(state.user?.email || '')}" required placeholder="vous@exemple.cm" autocomplete="email" /></label><label class="wide">Motif de la demande<textarea name="reason" placeholder="Ex. Dossier de scolarité"></textarea></label></div><div class="modal-actions"><button class="outline-button" type="button" data-close-modal>Annuler</button><button class="primary-button" type="submit">Envoyer ma demande</button></div></form>`;
    if (kind === 'mention') content.innerHTML = `<h2 id="modal-title">Ajouter une mention marginale</h2><p>Cette mention est datée, attribuée à son auteur et conservée avec l'acte.</p><form id="mention-form"><div class="form-grid"><label>Acte concerné<input name="act" required placeholder="Ex. MAR-2021-00114" /></label><label>Type de mention<select name="type"><option>Divorce</option><option>Reconnaissance</option><option>Rectification</option><option>Séparation de corps</option></select></label><label class="wide">Référence du document source<input name="source" required placeholder="Ex. Jugement N° 245/TC/2026" /></label><label class="wide">Observations<textarea name="notes" placeholder="Précisions nécessaires à la lecture de la mention"></textarea></label></div><div class="modal-actions"><button class="outline-button" type="button" data-close-modal>Annuler</button><button class="primary-button" type="submit">Ajouter la mention</button></div></form>`;
    if (kind === 'user') content.innerHTML = `<h2 id="modal-title">Créer un compte interne</h2><p>Définissez un mot de passe temporaire à transmettre de manière sécurisée à l'utilisateur.</p><form id="user-form"><div class="form-grid"><label>Nom complet<input name="name" required placeholder="Nom et prénom" /></label><label>Adresse e-mail<input name="email" type="email" required placeholder="nom@centre.cm" /></label><label>Rôle<select name="role"><option value="agent">Agent d'état civil</option><option value="officer">Officier d'état civil</option><option value="admin">Administrateur système</option></select></label><label>Mot de passe temporaire<input name="password" type="password" minlength="10" required placeholder="10 caractères minimum" /></label></div><div class="modal-actions"><button class="outline-button" type="button" data-close-modal>Annuler</button><button class="primary-button" type="submit">Créer le compte</button></div></form>`;
    if (kind === 'request-detail') {
      const req = data; const stages = ['Reçue', 'En traitement', 'Validée', 'Prête']; const current = Math.max(0, stages.indexOf(req.status));
      const button = !internal() ? '<button class="outline-button" type="button" data-close-modal>Fermer</button>' : req.status === 'Reçue' ? `<button class="primary-button" data-request-progress="${req.id}">Prendre en charge</button>` : req.status === 'En traitement' ? `<button class="primary-button" data-request-progress="${req.id}">Marquer prête</button>` : `<button class="primary-button" data-download-request="${req.id}">${icon('i-download')} Document PDF</button>`;
      content.innerHTML = `<h2 id="modal-title">Demande ${escape(req.ref)}</h2><p>Suivez l'avancement du dossier et mettez à jour son statut si nécessaire.</p><div class="detail-card"><p><b>Demandeur :</b> ${escape(req.name)}</p><p><b>Document :</b> ${escape(req.document)}</p><p><b>Acte concerné :</b> ${escape(req.act)}</p><p><b>Contact :</b> ${escape(req.email)}</p></div><div class="status-stepper">${stages.map((stage, index) => `<span class="step ${index <= current ? 'active' : ''}">${stage}</span>`).join('')}</div><div class="modal-actions"><button class="outline-button" type="button" data-close-modal>Fermer</button>${button}</div>`;
    }
    $('#modal-layer').classList.remove('hidden'); const input = $('#modal-content input, #modal-content select'); if (input) input.focus();
  }
  const closeModal = () => $('#modal-layer').classList.add('hidden');

  async function loadBootstrap() {
    const data = await request('/bootstrap'); state.user = data.user; state.acts = data.acts || []; state.requests = data.requests || []; state.mentions = data.mentions || []; state.stats = data.stats || {}; state.audit = data.audit || [];
    if (state.user.role === 'citizen') { renderRequests(); showCitizen(); } else { renderAll(); showInternal(); }
  }
  function offlineMode() {
    state.offline = true; state.token = null; localStorage.removeItem(tokenKey); state.user = { name: 'Aline Mvondo', email: 'agent@horsconnexion.local', role: 'agent', roleLabel: roleName.agent }; state.acts = structuredClone(offlineActs); state.requests = structuredClone(offlineRequests); state.mentions = structuredClone(offlineMentions); state.stats = {}; renderAll(); showInternal(); showToast('Mode hors connexion activé : les données restent dans ce navigateur.');
  }
  async function signIn(email, password) {
    const response = await request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }), headers: { 'Content-Type': 'application/json' } }); state.token = response.token; localStorage.setItem(tokenKey, response.token); await loadBootstrap();
  }
  async function refresh() { if (!state.offline) await loadBootstrap(); else renderAll(); }

  document.addEventListener('click', async event => {
    const nav = event.target.closest('.nav-item'); if (nav) return switchView(nav.dataset.view);
    const go = event.target.closest('[data-go]'); if (go) return switchView(go.dataset.go);
    const modalButton = event.target.closest('[data-open-modal]'); if (modalButton) return openModal(modalButton.dataset.openModal);
    if (event.target.closest('#modal-close, [data-close-modal]')) return closeModal(); if (event.target === $('#modal-layer')) return closeModal();
    const detail = event.target.closest('.request-detail-button'); if (detail) return openModal('request-detail', state.requests.find(req => req.id === Number(detail.dataset.id)));
    const validate = event.target.closest('.act-validate'); if (validate) { try { const id = Number(validate.dataset.id); if (state.offline) { const act = state.acts.find(item => item.id === id); act.status = 'Validé'; } else await post(`/acts/${id}/validate`, {}); await refresh(); showToast('L’acte a été validé et tracé dans le journal.'); } catch (error) { showToast(error.message, true); } return; }
    const progress = event.target.closest('[data-request-progress]'); if (progress) { try { const id = Number(progress.dataset.requestProgress); const req = state.requests.find(item => item.id === id); if (state.offline) req.status = req.status === 'Reçue' ? 'En traitement' : 'Prête'; else await post(`/requests/${id}/progress`, {}); await refresh(); const updated = state.requests.find(item => item.id === id); openModal('request-detail', updated); showToast(`La demande ${updated.ref} a été mise à jour.`); } catch (error) { showToast(error.message, true); } return; }
    if (event.target.closest('[data-download-request]')) { showToast('Le document sécurisé est prêt à être téléchargé.'); return; }
    const filter = event.target.closest('.summary-tile'); if (filter) { $$('.summary-tile').forEach(item => item.classList.remove('selected')); filter.classList.add('selected'); renderRequests(); return; }
    if (event.target.closest('#citizen-switch')) { showCitizen(); return; }
    if (event.target.closest('#back-office')) { showInternal(); return; }
    if (event.target.closest('#mobile-menu')) { $('#sidebar').classList.toggle('open'); return; }
    if (event.target.closest('#export-requests, #export-report')) { showToast('Votre export est en cours de préparation.'); return; }
    if (event.target.closest('.public-login')) { showLogin(); return; }
    const demo = event.target.closest('[data-demo-email]'); if (demo) { $('#login-email').value = demo.dataset.demoEmail; $('#login-password').focus(); return; }
    if (event.target.closest('#offline-demo')) { offlineMode(); return; }
    if (event.target.closest('#toggle-password')) { const input = $('#login-password'); input.type = input.type === 'password' ? 'text' : 'password'; return; }
    if (event.target.closest('#logout-button')) { if (!state.offline) { try { await post('/auth/logout', {}); } catch {} } state.token = null; localStorage.removeItem(tokenKey); showLogin(); return; }
  });
  document.addEventListener('input', event => { if (event.target.matches('#registry-search')) renderActs(); if (event.target.matches('#request-search')) renderRequests(); });
  document.addEventListener('change', event => { if (event.target.matches('#registry-type, #registry-status')) renderActs(); if (event.target.matches('#request-type')) renderRequests(); });
  document.addEventListener('submit', async event => {
    if (event.target.id === 'login-form') { event.preventDefault(); const form = new FormData(event.target); const button = $('.login-submit', event.target); button.disabled = true; button.textContent = 'Connexion…'; try { await signIn(form.get('email'), form.get('password')); } catch (error) { $('#login-error').textContent = error.message.includes('fetch') ? 'Serveur inaccessible. Lancez l’application via la commande indiquée dans le guide.' : error.message; $('#login-error').classList.remove('hidden'); } finally { button.disabled = false; button.innerHTML = `Se connecter ${icon('i-arrow')}`; } }
    if (event.target.id === 'act-form') { event.preventDefault(); const data = Object.fromEntries(new FormData(event.target)); try { if (state.offline) { const prefix = data.type === 'Naissance' ? 'NAI' : data.type === 'Mariage' ? 'MAR' : 'DEC'; state.acts.unshift({ id: Date.now(), ref: nextOfflineRef(prefix, state.acts), ...data, status: 'En attente', createdAt: new Date().toISOString() }); } else await post('/acts', data); await refresh(); closeModal(); showToast('L’acte a été enregistré et soumis à validation.'); } catch (error) { showToast(error.message, true); } }
    if (event.target.id === 'public-request-form') { event.preventDefault(); const data = Object.fromEntries(new FormData(event.target)); try { if (state.offline) state.requests.unshift({ id: Date.now(), ref: nextOfflineRef('DEM', state.requests), ...data, createdAt: new Date().toISOString(), status: 'Reçue' }); else await post('/requests', data); await refresh(); closeModal(); showToast('Votre demande a été envoyée avec succès.'); } catch (error) { showToast(error.message, true); } }
    if (event.target.id === 'mention-form') { event.preventDefault(); const data = Object.fromEntries(new FormData(event.target)); try { if (state.offline) state.mentions.unshift({ id: Date.now(), ...data, author: state.user.name, createdAt: new Date().toISOString() }); else await post('/mentions', data); await refresh(); closeModal(); showToast('La mention marginale a été ajoutée au registre.'); } catch (error) { showToast(error.message, true); } }
    if (event.target.id === 'user-form') { event.preventDefault(); const data = Object.fromEntries(new FormData(event.target)); try { if (!state.offline) await post('/users', data); closeModal(); showToast('Le compte a été créé. Une invitation sécurisée a été préparée.'); } catch (error) { showToast(error.message, true); } }
    if (event.target.id === 'tracking-form') { event.preventDefault(); const code = $('#tracking-code').value.trim().toUpperCase(); const req = state.requests.find(item => item.ref === code); const result = $('#tracking-result'); result.innerHTML = req ? `<b>${escape(req.ref)}</b> — Votre demande est <strong>${escape(req.status)}</strong>.` : '<b>Référence introuvable.</b> Vérifiez le numéro indiqué dans votre e-mail.'; result.classList.remove('hidden'); }
    if (event.target.id === 'verify-form') { event.preventDefault(); const code = $('#verify-code').value.trim().toUpperCase(); const result = $('#verify-result'); try { const response = state.offline ? (code === 'EC-2026-000421' || code === 'NAI-2026-00421' ? { valid: true, document: { type: 'Acte de naissance', holder: 'Mbarga Lionel Junior', centre: 'Douala I' } } : { valid: false }) : await request(`/verify/${encodeURIComponent(code)}`); if (!response.valid) throw new Error(response.message || 'Numéro non trouvé.'); result.innerHTML = `<b>${icon('i-check')} Document authentique</b> — ${escape(response.document.type)}, délivré par ${escape(response.document.centre)}.`; result.style.background = '#ddf2ec'; result.style.color = '#187465'; } catch (error) { result.innerHTML = `<b>Numéro non trouvé.</b> ${escape(error.message)}`; result.style.background = '#fff4df'; result.style.color = '#9a6918'; } result.classList.remove('hidden'); }
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeModal(); });
  (async () => { if (!state.token) return showLogin(); try { await loadBootstrap(); } catch { localStorage.removeItem(tokenKey); state.token = null; showLogin('Votre session a expiré. Veuillez vous reconnecter.'); } })();
})();
