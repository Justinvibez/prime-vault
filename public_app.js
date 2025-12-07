// public/app.js - minimal client for customer
const base = '';

function qs(id){return document.getElementById(id);}
function showMessage(msg){qs('messages').innerText = msg; setTimeout(()=>qs('messages').innerText='',6000);}

let token = localStorage.getItem('pv_token');

async function request(path, opts = {}) {
  opts.headers = opts.headers || {};
  opts.headers['Content-Type'] = 'application/json';
  if (token) opts.headers['Authorization'] = 'Bearer ' + token;
  const res = await fetch(base + path, opts);
  const json = await res.json().catch(()=>({}));
  if (!res.ok) throw json;
  return json;
}

async function refreshMe(){
  try{
    const { user } = await request('/api/me');
    qs('account-info').innerHTML = `<strong>${user.name}</strong> (${user.email})<br>Account: ${user.account_number}<br>Balance: $${(user.balance_cents/100).toFixed(2)}<br>Authorized: ${user.is_authorized ? 'Yes' : 'No'}`;
    qs('auth-section').style.display = 'none';
    qs('account-section').style.display = 'block';
    loadTransactions();
  } catch(e){
    // not logged in
    qs('auth-section').style.display = 'block';
    qs('account-section').style.display = 'none';
  }
}

qs('btn-register').onclick = async ()=>{
  try{
    const name = qs('reg-name').value; const email = qs('reg-email').value; const password = qs('reg-password').value;
    const res = await request('/api/register', { method:'POST', body: JSON.stringify({name,email,password}) });
    showMessage('Registered. Your account number: ' + res.account_number + '. Ask admin to authorize to enable transfers.');
  }catch(e){ showMessage(e.error || JSON.stringify(e)); }
};

qs('btn-login').onclick = async ()=>{
  try{
    const email = qs('login-email').value; const password = qs('login-password').value;
    const res = await request('/api/login', { method:'POST', body: JSON.stringify({email,password}) });
    token = res.token; localStorage.setItem('pv_token', token);
    await refreshMe();
  }catch(e){ showMessage(e.error || JSON.stringify(e)); }
};

qs('btn-logout').onclick = ()=>{
  token = null; localStorage.removeItem('pv_token'); refreshMe();
};

qs('btn-transfer').onclick = async ()=>{
  try{
    const to = qs('transfer-to').value; const amount = qs('transfer-amount').value; const note = qs('transfer-note').value;
    const res = await request('/api/transfer', { method:'POST', body: JSON.stringify({to_account:to, amount, note}) });
    showMessage('Transfer success');
    await refreshMe();
  }catch(e){ showMessage(e.error || JSON.stringify(e)); }
};

qs('btn-support').onclick = async ()=>{
  try{
    const subject = qs('support-subject').value; const message = qs('support-message').value;
    await request('/api/support', { method:'POST', body: JSON.stringify({subject,message}) });
    showMessage('Support message sent to admin');
    qs('support-subject').value = ''; qs('support-message').value = '';
  }catch(e){ showMessage(e.error || JSON.stringify(e)); }
};

async function loadTransactions(){
  try{
    const res = await request('/api/transactions');
    const ul = qs('transactions'); ul.innerHTML = '';
    (res.transactions||[]).forEach(t=>{
      const li = document.createElement('li');
      li.innerText = `${t.created_at} | ${t.type} | ${t.from_account || '-'} -> ${t.to_account || '-'} | $${(t.amount_cents/100).toFixed(2)} ${t.note?(' | '+t.note):''}`;
      ul.appendChild(li);
    });
  }catch(e){ console.warn(e); }
}

refreshMe();