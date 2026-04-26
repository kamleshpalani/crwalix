const $ = (id) => document.getElementById(id);

const EXAMPLES = {
  'google-maps': { query: 'coffee shops', location: 'Berlin', limit: 10 },
  'google-serp': { query: 'best vscode extensions', limit: 10 },
  'email-phone': { url: 'https://example.com', maxPages: 2 },
  yelp: { query: 'pizza', location: 'New York', limit: 10 },
  amazon: { query: 'mechanical keyboard', limit: 10 },
  instagram: { username: 'nasa' },
  generic: {
    url: 'https://news.ycombinator.com',
    selector: '.athing',
    fields: { title: '.titleline a' },
  },
};

async function loadAdapters() {
  const r = await fetch('/api/adapters').then((res) => res.json());
  const sel = $('adapter');
  sel.innerHTML = '';
  for (const a of r.adapters) {
    const opt = document.createElement('option');
    opt.value = a.name;
    opt.textContent = `${a.name} — ${a.description}`;
    sel.appendChild(opt);
  }
  sel.onchange = () => {
    $('input').value = JSON.stringify(EXAMPLES[sel.value] ?? {}, null, 2);
  };
  sel.onchange();
}

async function loadJobs() {
  const r = await fetch('/api/jobs?limit=50').then((res) => res.json());
  const tbody = $('jobs');
  tbody.innerHTML = '';
  for (const j of r.jobs) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><code>${j.id}</code></td>
      <td>${j.adapter}</td>
      <td><span class="status ${j.status}">${j.status}</span></td>
      <td>${j.itemsCollected ?? ''}</td>
      <td>${new Date(j.createdAt).toLocaleTimeString()}</td>
      <td><button data-id="${j.id}" class="btn-inline">View</button></td>
    `;
    tr.querySelector('button').onclick = async () => {
      const full = await fetch(`/api/jobs/${j.id}`).then((res) => res.json());
      $('detail').textContent = JSON.stringify(full, null, 2);
    };
    tbody.appendChild(tr);
  }
}

$('submit').onclick = async () => {
  $('error').textContent = '';
  $('submit').disabled = true;
  try {
    const body = {
      adapter: $('adapter').value,
      input: JSON.parse($('input').value),
    };
    const res = await fetch('/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(JSON.stringify(await res.json()));
    await loadJobs();
  } catch (e) {
    $('error').textContent = e.message;
  } finally {
    $('submit').disabled = false;
  }
};

$('refresh').onclick = loadJobs;
loadAdapters();
loadJobs();
setInterval(loadJobs, 2500);
