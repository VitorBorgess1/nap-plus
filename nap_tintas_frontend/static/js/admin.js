/* ============================================================
   ADMIN.JS — painel administrativo (somente frontend)
   Os dados ficam no localStorage do navegador (chave KEY), a partir
   de dados de exemplo (seed). Para ligar a um backend/banco no futuro,
   troque load() e save() por chamadas de API.
   ============================================================ */
(() => {
const KEY = 'nap_admin_v2', LOW = 10;
const $ = (s, p = document) => p.querySelector(s), $$ = (s, p = document) => [...p.querySelectorAll(s)];
const money = n => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
const fdate = d => d ? d.split('-').reverse().join('/') : '—';
const ic = n => `<svg class="ic" aria-hidden="true"><use href="#i-${n}"></use></svg>`;
const slug = s => norm(s).replace(/\s+/g, '-');

/* ---------- dados de exemplo ---------- */
const seed = () => ({
  products: [
    { id: 1, name: 'Suvinil Fosco Completo', brand: 'Suvinil', category: 'Parede', price: 189.9, stock: 12, image: 'https://down-br.img.susercontent.com/file/sg-11134201-7rbmu-lmqfhxvhxwwg8c', description: 'Tinta acrílica fosca para paredes.' },
    { id: 2, name: 'Suvinil Toque Fosco Completo', brand: 'Suvinil', category: 'Parede', price: 119.9, stock: 25, image: 'https://down-br.img.susercontent.com/file/sg-11134201-7rdwc-lxtpae1z8ebq2a', description: 'Tinta fosca para paredes e tetos.' },
    { id: 3, name: 'Suvinil Cor & Proteção Fosco', brand: 'Suvinil', category: 'Madeira e Metal', price: 149.9, stock: 8, image: '', description: 'Esmalte para madeira e metais.' },
    { id: 4, name: 'Borracha Líquida Elástica Quartzolit', brand: 'Quartzolit', category: 'Piso', price: 169.9, stock: 6, image: '', description: 'Impermeabilizante elástico.' },
    { id: 5, name: 'Impermeabilizante para Parede', brand: 'Quartzolit', category: 'Tratamento', price: 139.9, stock: 10, image: '', description: 'Tratamento de umidade e proteção.' },
    { id: 6, name: 'Tinta Spray Multiuso', brand: 'Colorgin', category: 'Multiuso', price: 39.9, stock: 30, image: '', description: 'Spray para pequenos projetos.' },
    { id: 7, name: 'Massa Corrida PVA', brand: 'Suvinil', category: 'Preparação', price: 34.9, stock: 0, image: '', description: 'Nivela e prepara paredes internas.' }
  ],
  orders: [
    { id: 'PED-1001', customer: 'Mariana Souza', date: '2026-09-19', items: 2, total: 379.8, payment: 'Pix', status: 'Separando' },
    { id: 'PED-1002', customer: 'Carlos Lima', date: '2026-09-20', items: 1, total: 169.9, payment: 'Cartão de crédito', status: 'Pago' },
    { id: 'PED-1003', customer: 'Ana Oliveira', date: '2026-09-20', items: 3, total: 289.7, payment: 'Pix', status: 'Enviado' },
    { id: 'PED-1004', customer: 'Roberto Alves', date: '2026-09-17', items: 4, total: 559.6, payment: 'Boleto', status: 'Pronto para envio' },
    { id: 'PED-1005', customer: 'Juliana Prado', date: '2026-09-15', items: 1, total: 39.9, payment: 'Pix', status: 'Cancelado' },
    { id: 'PED-1006', customer: 'Construtora Vila Nova', date: '2026-09-12', items: 6, total: 1139.4, payment: 'Boleto', status: 'Enviado' }
  ],
  pos: [
    { id: 'OC-2001', supplier: 'Suvinil', date: '2026-09-18', delivery: '2026-09-24', items: 40, total: 5400, status: 'Em trânsito' },
    { id: 'OC-2002', supplier: 'Quartzolit', date: '2026-09-20', delivery: '2026-09-26', items: 24, total: 3120, status: 'Rascunho' },
    { id: 'OC-2003', supplier: 'Colorgin', date: '2026-09-10', delivery: '2026-09-14', items: 60, total: 1500, status: 'Recebida' },
    { id: 'OC-2004', supplier: 'Suvinil', date: '2026-09-19', delivery: '2026-09-27', items: 30, total: 3600, status: 'Enviada' }
  ],
  ships: [
    { id: 'ENV-3001', order: 'PED-1003', carrier: 'Correios', tracking: 'BR123456789BR', sent_at: '2026-09-20', status: 'Em trânsito' },
    { id: 'ENV-3002', order: 'PED-1006', carrier: 'Jadlog', tracking: 'JD0098221', sent_at: '2026-09-13', status: 'Entregue' },
    { id: 'ENV-3003', order: 'PED-1004', carrier: 'Loggi', tracking: '', sent_at: '', status: 'Preparando' }
  ],
  suppliers: [
    { id: 'FOR-0001', name: 'Suvinil', contact: 'Equipe comercial', email: 'comercial@suvinil.exemplo', phone: '(11) 0000-0001', lead: 5 },
    { id: 'FOR-0002', name: 'Quartzolit', contact: 'Distribuidor regional', email: 'vendas@quartzolit.exemplo', phone: '(11) 0000-0002', lead: 6 },
    { id: 'FOR-0003', name: 'Colorgin', contact: 'Equipe comercial', email: 'comercial@colorgin.exemplo', phone: '(11) 0000-0003', lead: 4 }
  ]
});
let db;
const load = () => { try { db = { ...seed(), ...(JSON.parse(localStorage.getItem(KEY)) || {}) }; } catch { db = seed(); } };
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { toast('Sem espaço no navegador (imagem muito grande?)'); } };

/* ---------- configuração das listas (pedidos, OCs, expedições, fornecedores) ---------- */
const PAY = ['Pix', 'Cartão de crédito', 'Cartão de débito', 'Boleto'];
const selOpts = (o, v) => o.map(x => `<option${x === v ? ' selected' : ''}>${esc(x)}</option>`).join('');
const E = {
  orders: { route: 'pedidos', one: 'pedido', prefix: 'PED', statuses: ['Pago', 'Separando', 'Pronto para envio', 'Enviado', 'Cancelado'],
    cols: [['id', 'Pedido'], ['customer', 'Cliente'], ['date', 'Data', fdate], ['items', 'Itens'], ['total', 'Valor', money], ['payment', 'Pagamento'], ['status', 'Status']],
    fields: () => [['customer', 'Cliente', 'text', { req: 1 }], ['date', 'Data', 'date'], ['items', 'Quantidade de itens', 'number', { min: 1 }], ['total', 'Valor (R$)', 'number', { step: '0.01', min: 0 }], ['payment', 'Forma de pagamento', 'select', { opts: PAY }], ['status', 'Status', 'select', { opts: E.orders.statuses }]],
    blank: () => ({ date: today(), items: 1, total: 0, payment: 'Pix', status: 'Pago' }) },
  pos: { route: 'compras', one: 'ordem de compra', prefix: 'OC', statuses: ['Rascunho', 'Enviada', 'Em trânsito', 'Recebida', 'Cancelada'],
    cols: [['id', 'Ordem'], ['supplier', 'Fornecedor'], ['date', 'Data', fdate], ['delivery', 'Previsão de entrega', fdate], ['items', 'Itens'], ['total', 'Valor', money], ['status', 'Status']],
    fields: () => [['supplier', 'Fornecedor', 'select', { opts: db.suppliers.map(s => s.name) }], ['date', 'Data', 'date'], ['delivery', 'Previsão de entrega', 'date'], ['items', 'Quantidade de itens', 'number', { min: 1 }], ['total', 'Valor (R$)', 'number', { step: '0.01', min: 0 }], ['status', 'Status', 'select', { opts: E.pos.statuses }]],
    blank: () => ({ supplier: db.suppliers[0]?.name || '', date: today(), delivery: '', items: 1, total: 0, status: 'Rascunho' }) },
  ships: { route: 'expedicoes', one: 'expedição', prefix: 'ENV', statuses: ['Preparando', 'Enviado', 'Em trânsito', 'Entregue', 'Devolvido'],
    cols: [['id', 'Envio'], ['order', 'Pedido'], ['carrier', 'Transportadora'], ['tracking', 'Rastreamento', v => v ? `<code>${esc(v)}</code>` : '—'], ['sent_at', 'Data de envio', fdate], ['status', 'Status']],
    fields: () => [['order', 'Pedido relacionado', 'select', { opts: db.orders.map(o => o.id) }], ['carrier', 'Transportadora', 'text', { list: ['Correios', 'Jadlog', 'Loggi', 'Total Express'] }], ['tracking', 'Código de rastreamento', 'text'], ['sent_at', 'Data de envio', 'date'], ['status', 'Status', 'select', { opts: E.ships.statuses }]],
    blank: () => ({ order: db.orders[0]?.id || '', carrier: 'Correios', tracking: '', sent_at: '', status: 'Preparando' }) },
  suppliers: { route: 'fornecedores', one: 'fornecedor', prefix: 'FOR',
    fields: () => [['name', 'Nome do fornecedor', 'text', { req: 1 }], ['contact', 'Contato (pessoa/setor)', 'text'], ['email', 'E-mail', 'email'], ['phone', 'Telefone', 'text'], ['lead', 'Prazo médio de entrega (dias)', 'number', { min: 0 }]],
    blank: () => ({ lead: 5 }) }
};
const ROUTES = { dashboard: 'Visão geral', produtos: 'Produtos & estoque', pedidos: 'Pedidos', compras: 'Ordens de compra', expedicoes: 'Expedições', fornecedores: 'Fornecedores' };
const F = { orders: '', pos: '', ships: '', inv: 'all' };
const nextId = (pre, list) => `${pre}-${String(Math.max(0, ...list.map(x => parseInt(String(x.id).replace(/\D/g, '')) || 0)) + 1).padStart(4, '0')}`;

/* ---------- UI básica ---------- */
let tt;
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('show'), 2200); }
function openModal(html) { $('#modal-body').innerHTML = html; $('#modal').hidden = false; ($('#modal input,#modal select,#modal .btn') || {}).focus?.(); }
function closeModal() { $('#modal').hidden = true; $('#modal-body').innerHTML = ''; }
function confirmBox(msg, ok, label = 'Excluir') {
  openModal(`<h2>Confirmar</h2><p>${esc(msg)}</p><div class="form"><div class="acts2"><button class="btn ghost" data-act="close">Cancelar</button><button class="btn danger" id="yes">${label}</button></div></div>`);
  $('#yes').onclick = () => { closeModal(); ok(); };
}
const stBadge = s => `<span class="st st-${slug(s)}">${esc(s)}</span>`;
const stSelect = (key, r) => `<select class="st st-${slug(r.status)}" data-status="${key}" data-id="${esc(r.id)}" aria-label="Status">${selOpts(E[key].statuses, r.status)}</select>`;
const actions = (key, id) => `<td class="acts"><button class="ib" data-act="edit" data-e="${key}" data-id="${esc(id)}" aria-label="Editar" title="Editar">${ic('pencil')}</button><button class="ib del" data-act="del" data-e="${key}" data-id="${esc(id)}" aria-label="Excluir" title="Excluir">${ic('trash-2')}</button></td>`;

function form(title, fields, vals, onSave, extra = '') {
  const inp = ([n, l, t, o = {}]) => {
    const v = vals[n] ?? '';
    if (t === 'select') return `<label>${l}<select name="${n}">${selOpts(o.opts, v)}</select></label>`;
    if (t === 'textarea') return `<label>${l}<textarea name="${n}">${esc(v)}</textarea></label>`;
    const dl = o.list ? `<datalist id="dl-${n}">${o.list.map(x => `<option value="${esc(x)}">`).join('')}</datalist>` : '';
    return `<label>${l}<input name="${n}" type="${t}" value="${esc(v)}"${o.req ? ' required' : ''}${o.step ? ` step="${o.step}"` : ''}${o.min !== undefined ? ` min="${o.min}"` : ''}${o.list ? ` list="dl-${n}"` : ''}>${dl}</label>`;
  };
  const html = fields.map(f => f.grid ? `<div class="g">${f.grid.map(inp).join('')}</div>` : inp(f)).join('');
  openModal(`<h2>${title}</h2><form class="form" id="f">${html}${extra}<div class="acts2"><button type="button" class="btn ghost" data-act="close">Cancelar</button><button class="btn">Salvar</button></div></form>`);
  $('#f').onsubmit = e => {
    e.preventDefault();
    const d = {}; new FormData(e.target).forEach((v, k) => d[k] = v);
    fields.flatMap(f => f.grid || [f]).forEach(([n, , t]) => { if (t === 'number') d[n] = Number(d[n] || 0); });
    onSave(d); save(); closeModal(); renderAll();
  };
}

/* ---------- cálculo dos indicadores ---------- */
function stats() {
  const P = db.products, O = db.orders, C = db.pos;
  const sold = O.filter(o => o.status !== 'Cancelado');
  return {
    value: P.reduce((s, p) => s + p.price * p.stock, 0), n: P.length, units: P.reduce((s, p) => s + p.stock, 0),
    low: P.filter(p => p.stock > 0 && p.stock <= LOW).length, out: P.filter(p => p.stock === 0).length,
    pending: O.filter(o => ['Pago', 'Separando', 'Pronto para envio'].includes(o.status)).length,
    inTransit: C.filter(c => c.status === 'Em trânsito').reduce((s, c) => s + c.items, 0),
    shipsMoving: db.ships.filter(s => s.status === 'Em trânsito').length,
    openPO: C.filter(c => !['Recebida', 'Cancelada'].includes(c.status)).length,
    sales: sold.reduce((s, o) => s + o.total, 0), salesN: sold.length
  };
}

/* ---------- visão geral ---------- */
const stepper = p => `<div class="step"><button data-act="stock" data-id="${p.id}" data-d="-1" aria-label="Saída de 1 unidade" title="Saída (Shift = 10)">${ic('minus')}</button><input type="number" min="0" value="${p.stock}" data-qty="${p.id}" aria-label="Quantidade em estoque"><button data-act="stock" data-id="${p.id}" data-d="1" aria-label="Entrada de 1 unidade" title="Entrada (Shift = 10)">${ic('plus')}</button></div>`;
function renderDash() {
  const s = stats();
  const K = [
    ['Valor estimado do estoque', money(s.value), 'a preço de venda', 'wallet', 'blue', 'produtos'],
    ['Produtos cadastrados', s.n, 'no catálogo', 'package', 'orange', 'produtos'],
    ['Unidades em estoque', s.units, 'soma de todos os produtos', 'paint-roller', 'purple', 'produtos'],
    ['Estoque baixo', s.low, `até ${LOW} un. · ${s.out} zerado${s.out === 1 ? '' : 's'}`, 'triangle-alert', 'yellow', 'produtos'],
    ['Pedidos pendentes', s.pending, 'pagos, separando ou prontos', 'clock', 'pink', 'pedidos'],
    ['Produtos em trânsito', s.inTransit, 'unidades em ordens de compra em trânsito', 'truck', 'blue', 'compras'],
    ['Ordens de compra abertas', s.openPO, 'rascunho, enviada ou em trânsito', 'clipboard-list', 'green', 'compras'],
    ['Vendas registradas', money(s.sales), `${s.salesN} pedido${s.salesN === 1 ? '' : 's'} (sem cancelados)`, 'trending-up', 'orange', 'pedidos']
  ];
  const low = db.products.filter(p => p.stock <= LOW).sort((a, b) => a.stock - b.stock).slice(0, 6);
  $('#sec-dashboard').innerHTML = `<div class="kpis">${K.map(k => `<button class="kpi" style="--c:var(--${k[4]})" data-go="${k[5]}"><span class="h">${k[0]}${ic(k[3])}</span><strong>${k[1]}</strong><small>${k[2]}</small></button>`).join('')}</div>
  <div class="two"><article class="panel"><h2>Estoque baixo</h2>${low.map(p => `<div class="row"><span>${esc(p.name)}<small>${esc(p.brand)}</small></span>${stepper(p)}</div>`).join('') || '<div class="empty">Nenhum item crítico.</div>'}</article>
  <article class="panel"><h2>Pedidos recentes</h2>${[...db.orders].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5).map(o => `<div class="row"><span><b>${esc(o.id)}</b> · ${esc(o.customer)}<small>${fdate(o.date)} · ${money(o.total)}</small></span>${stBadge(o.status)}</div>`).join('') || '<div class="empty">Nenhum pedido.</div>'}</article></div>`;
}

/* ---------- produtos & estoque ---------- */
function renderInv() {
  const q = norm($('#q').value), P = db.products;
  const cnt = { all: P.length, low: P.filter(p => p.stock > 0 && p.stock <= LOW).length, out: P.filter(p => p.stock === 0).length };
  $('#inv-chips').innerHTML = [['all', 'Todos'], ['low', 'Estoque baixo'], ['out', 'Zerado']].map(([k, l]) => `<button class="chip${F.inv === k ? ' on' : ''}" data-inv="${k}">${l} (${cnt[k]})</button>`).join('');
  const rows = P.filter(p => norm(`${p.name} ${p.brand} ${p.category}`).includes(q) && (F.inv === 'all' || (F.inv === 'low' ? p.stock > 0 && p.stock <= LOW : p.stock === 0)));
  $('#inv-table').innerHTML = `<thead><tr><th>Produto</th><th>Categoria</th><th>Preço (R$)</th><th>Estoque</th><th>Situação</th><th></th></tr></thead><tbody>${rows.map(p => `<tr>
    <td><div class="prod"><div class="thumb">${p.image ? `<img src="${esc(p.image)}" alt="">` : ''}</div><div><b>${esc(p.name)}</b><small>${esc(p.brand)}</small></div></div></td>
    <td>${esc(p.category)}</td>
    <td><input class="cell" type="number" step="0.01" min="0" value="${Number(p.price).toFixed(2)}" data-price="${p.id}" aria-label="Preço"></td>
    <td>${stepper(p)}</td>
    <td>${stBadge(p.stock === 0 ? 'Zerado' : p.stock <= LOW ? 'Baixo' : 'Normal')}</td>${actions('products', p.id)}</tr>`).join('') || `<tr><td colspan="6" class="empty">Nenhum produto encontrado.</td></tr>`}</tbody>`;
  $$('.thumb', $('#inv-table')).forEach(t => { if (!t.firstElementChild) t.innerHTML = ic('image'); });
}
const CATS = ['Parede', 'Piso', 'Madeira e Metal', 'Tratamento', 'Multiuso', 'Preparação', 'Texturas', 'Ferramentas'];
function productModal(p) {
  const v = p || { category: 'Parede', stock: 0, price: '', image: '' };
  const cats = CATS.includes(v.category) ? CATS : [...CATS, v.category];
  const extra = `<div class="imgbox"><div class="thumb" id="pv">${v.image ? `<img src="${esc(v.image)}" alt="">` : ic('image')}</div><div><label>URL da imagem<input name="image" id="imgurl" type="url" value="${v.image && !v.image.startsWith('data:') ? esc(v.image) : ''}" placeholder="https://..."></label><label>…ou enviar arquivo<input type="file" id="imgfile" accept="image/*"></label></div></div>`;
  form(p ? 'Editar produto' : 'Adicionar produto', [
    ['name', 'Nome', 'text', { req: 1 }], { grid: [['brand', 'Marca', 'text', { req: 1, list: [...new Set(db.products.map(x => x.brand))] }], ['category', 'Categoria', 'select', { opts: cats }]] },
    { grid: [['price', 'Preço (R$)', 'number', { step: '0.01', min: 0, req: 1 }], ['stock', 'Quantidade em estoque', 'number', { min: 0, req: 1 }]] },
    ['description', 'Descrição', 'textarea']], v, d => {
      d.image = pendingImg ?? (d.image || '');
      d.stock = Math.max(0, Math.round(d.stock));
      if (p) Object.assign(p, d); else db.products.unshift({ id: Math.max(0, ...db.products.map(x => x.id)) + 1, ...d });
      toast('Produto salvo');
    }, extra);
  let pendingImg = v.image?.startsWith('data:') ? v.image : null;
  $('#imgurl').oninput = e => { pendingImg = null; $('#pv').innerHTML = e.target.value ? `<img src="${esc(e.target.value)}" alt="">` : ic('image'); };
  $('#imgfile').onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => { const im = new Image(); im.onload = () => {
      const k = Math.min(1, 360 / Math.max(im.width, im.height)), c = document.createElement('canvas');
      c.width = im.width * k; c.height = im.height * k; c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
      pendingImg = c.toDataURL('image/jpeg', .82); $('#pv').innerHTML = `<img src="${pendingImg}" alt="">`;
    }; im.src = r.result; };
    r.readAsDataURL(f);
  };
}
function setStock(id, v) { const p = db.products.find(x => x.id == id); if (!p) return; p.stock = Math.max(0, Math.round(Number(v) || 0)); save(); renderAll(); }

/* ---------- listas genéricas ---------- */
function renderList(key) {
  const c = E[key], all = db[key], list = F[key] ? all.filter(r => r.status === F[key]) : all;
  const chips = ['', ...c.statuses].map(s => `<button class="chip${F[key] === s ? ' on' : ''}" data-f="${key}" data-v="${esc(s)}">${s || 'Todos'} (${s ? all.filter(r => r.status === s).length : all.length})</button>`).join('');
  const body = list.map(r => `<tr>${c.cols.map(([k, , fn]) => `<td class="${k === 'total' || k === 'items' ? 'num' : ''}">${k === 'status' ? stSelect(key, r) : k === 'id' ? `<b>${esc(r[k])}</b>` : fn ? fn(r[k], r) : esc(r[k] || '—')}</td>`).join('')}${actions(key, r.id)}</tr>`).join('');
  $('#sec-' + c.route).innerHTML = `<div class="bar"><div class="chips">${chips}</div><button class="btn" data-act="new" data-e="${key}">${ic('plus')}Nov${key === 'pos' || key === 'ships' ? 'a' : 'o'} ${c.one}</button></div>
  <div class="tw"><table><thead><tr>${c.cols.map(x => `<th>${x[1]}</th>`).join('')}<th></th></tr></thead><tbody>${body || `<tr><td colspan="${c.cols.length + 1}" class="empty">Nada por aqui ainda.</td></tr>`}</tbody></table></div>`;
}
function renderSuppliers() {
  const col = ['orange', 'blue', 'green', 'purple', 'pink', 'yellow'];
  $('#sec-fornecedores').innerHTML = `<div class="bar"><button class="btn" data-act="new" data-e="suppliers">${ic('plus')}Novo fornecedor</button></div><div class="cards">${db.suppliers.map((s, i) => `<article class="sup"><div class="t"><div class="av" style="--c:var(--${col[i % 6]})">${esc(s.name.slice(0, 1).toUpperCase())}</div><div><h3>${esc(s.name)}</h3><small>${esc(s.contact || '')}</small></div><span class="acts" style="margin-left:auto">${actions('suppliers', s.id).replace(/<\/?td[^>]*>/g, '')}</span></div>
  ${s.email ? `<p>${ic('mail')}${esc(s.email)}</p>` : ''}${s.phone ? `<p>${ic('phone')}${esc(s.phone)}</p>` : ''}<div class="lead">Prazo médio de entrega<b>${s.lead} dia${s.lead === 1 ? '' : 's'}</b></div></article>`).join('') || '<div class="empty">Nenhum fornecedor cadastrado.</div>'}</div>`;
}

function renderAll() {
  renderDash(); renderInv(); ['orders', 'pos', 'ships'].forEach(renderList); renderSuppliers();
  const s = stats(); const set = (id, n) => { const b = $(id); b.textContent = n; b.hidden = !n; };
  set('#nb-produtos', s.low + s.out); set('#nb-pedidos', s.pending);
}

/* ---------- navegação ---------- */
function route() {
  const r = ROUTES[location.hash.slice(1)] ? location.hash.slice(1) : 'dashboard';
  $$('.sec').forEach(s => s.classList.toggle('on', s.id === 'sec-' + r));
  $$('#nav a').forEach(a => a.classList.toggle('on', a.dataset.r === r));
  $('#title').textContent = ROUTES[r]; window.scrollTo(0, 0); document.title = `${ROUTES[r]} | Admin NAP Tintas`;
}

/* ---------- eventos ---------- */
document.addEventListener('click', e => {
  const t = e.target.closest('[data-act],[data-go],[data-inv],[data-f]'); if (!t) { if (e.target.id === 'modal') closeModal(); return; }
  if (t.dataset.go) { location.hash = t.dataset.go; return; }
  if (t.dataset.inv) { F.inv = t.dataset.inv; renderInv(); return; }
  if (t.dataset.f) { F[t.dataset.f] = t.dataset.v; renderList(t.dataset.f); return; }
  const { act, e: key, id } = t.dataset;
  if (act === 'close') closeModal();
  else if (act === 'stock') { const p = db.products.find(x => x.id == id); setStock(id, p.stock + Number(t.dataset.d) * (e.shiftKey ? 10 : 1)); }
  else if (act === 'new-product') productModal();
  else if (act === 'new') form(`Nov${key === 'pos' || key === 'ships' ? 'a' : 'o'} ${E[key].one}`, E[key].fields(), E[key].blank(), d => { db[key].unshift({ id: nextId(E[key].prefix, db[key]), ...d }); toast('Cadastrado'); });
  else if (act === 'edit') {
    if (key === 'products') return productModal(db.products.find(p => p.id == id));
    const r = db[key].find(x => x.id === id); form(`Editar ${E[key].one}`, E[key].fields(), r, d => { Object.assign(r, d); toast('Alterações salvas'); });
  } else if (act === 'del') {
    const list = db[key], r = list.find(x => String(x.id) === id);
    confirmBox(`Excluir "${r.name || r.id}"? Esta ação não pode ser desfeita.`, () => { db[key] = list.filter(x => x !== r); save(); renderAll(); toast('Excluído'); });
  } else if (act === 'reset') confirmBox('Apagar as alterações feitas neste navegador e voltar aos dados de exemplo?', () => { db = seed(); save(); renderAll(); toast('Dados de exemplo restaurados'); }, 'Restaurar');
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.qty) setStock(t.dataset.qty, t.value);
  else if (t.dataset.price) { const p = db.products.find(x => x.id == t.dataset.price); p.price = Math.max(0, Number(t.value) || 0); save(); renderAll(); toast('Preço atualizado'); }
  else if (t.dataset.status) {
    const r = db[t.dataset.status].find(x => x.id === t.dataset.id); r.status = t.value;
    if (t.dataset.status === 'ships' && ['Enviado', 'Em trânsito'].includes(t.value) && !r.sent_at) r.sent_at = today();
    save(); renderAll(); toast('Status atualizado');
  }
});
document.addEventListener('error', e => {
  const im = e.target; if (im.tagName !== 'IMG' || !im.closest('.thumb')) return;
  const t = im.parentElement; im.remove(); t.innerHTML = ic('image');
}, true);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); if (e.key === 'Enter' && e.target.matches('.cell,[data-qty]')) e.target.blur(); });
$('#q').addEventListener('input', renderInv);
window.addEventListener('hashchange', route);

load(); renderAll(); route();
})();
