// public/admin.js - minimal admin UI client
const qs = id => document.getElementById(id);
let token = localStorage.getItem('pv_admin_token');

function show(msg){ qs('admin-messages').innerText = msg; setTimeout(()=>qs('admin-messages').innerText='',6000); }

async function req(path, opts = {}) {
  opts.headers = opts.headers || {};
  opts.headers['Content-Type'] = 'application/json';
  if (token) opts.headers['Authorization'] = 'Bearer ' + token;
  const res = await fetch(path, opts);
  const json = await res.json().catch(()=>({}));
  if (!res.ok) throw json;
  return json;
}

async function refreshAdminState(){
  if (!token) {
    qs('admin-auth').style.display = 'block';
    qs('admin-section').style.display = 'none';
    return;
  }
  try{
    const me = await req('/api/me');
    qs('admin-auth').style.display = 'none';
    qs('admin-section').style.display = 'block';
    loadSupport();
  }catch(e){
    token = null; localStorage.removeItem('pv_admin_token');
    qs('admin-auth').style.display = 'block';
    qs('admin-section').style.display = 'none';
  }
}

qs('btn-admin-login').onclick = async ()=>{
  try{
    const email = qs('admin-email').value; const password = qs('admin-password').value;
    const res = await fetch('/api/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({email,password}) });
    const json = await res.json();
    if (!res.ok) throw json;
    if (!json.is_admin) { show('Not an admin account'); return; }
    token = json.token; localStorage.setItem('pv_admin_token', token);
    await refreshAdminState();
  }catch(e){ show(e.error || JSON.stringify(e)); }
};

qs('btn-admin-logout').onclick = ()=>{
  token = null; localStorage.removeItem('pv_admin_token'); refreshAdminState();
};

qs('btn-deposit').onclick = async ()=>{
  try{
    const account = qs('dep-account').value; const amount = qs('dep-amount').value;
    await req('/api/admin/deposit', { method:'POST', body: JSON.stringify({account_number:account, amount}) });
    show('Deposit applied');
  }catch(e){ show(e.error || JSON.stringify(e)); }
};

qs('btn-authorize').onclick = async ()=>{
  try{
    const account = qs('auth-account').value; const authorize = qs('auth-action').value === 'true';
    await req('/api/admin/authorize', { method:'POST', body: JSON.stringify({account_number:account, authorize}) });
    show('Authorization updated');
  }catch(e){ show(e.error || JSON.stringify(e)); }
};

async function loadSupport(){
  try{
    // support_messages endpoint not exposed; read directly from DB is not possible here.
    // For demo, we can request /api/transactions or implement a support list endpoint later.
    // Display placeholder notice.
    qs('support-list').innerHTML = '<li>Support messages are stored in database. Add a support-list endpoint if you want to view them here.</li>';
  }catch(e){ console.warn(e); }
}

refreshAdminState();