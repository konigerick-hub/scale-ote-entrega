// API de dados da calculadora OTE Entrega Scale.
// Guarda um arquivo JSON por mês (dados/AAAA-MM.json) num repositório GitHub.
//
// Variáveis de ambiente (Vercel → Settings → Environment Variables):
//   GITHUB_TOKEN   token do GitHub com permissão "Contents: Read and write" no repositório de dados
//   GITHUB_REPO    repositório no formato dono/nome (ex: erickkonig/scale-ote-dados)
//   GITHUB_BRANCH  opcional, padrão "main"
//   APP_SENHA      opcional, senha que o time digita para acessar (recomendado)

const GH = 'https://api.github.com';

function cfg() {
  return {
    token: process.env.GITHUB_TOKEN,
    repo: process.env.GITHUB_REPO,
    branch: process.env.GITHUB_BRANCH || 'main',
    senha: process.env.APP_SENHA || '',
  };
}

function ghHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'scale-ote-entrega',
  };
}

function emptyDoc(periodo) {
  return { periodo, coletiva: { expMeta: '', expReal: '', demais: [] }, resultados: {}, atualizadoEm: null };
}

async function readDoc(c, periodo) {
  const path = `dados/${periodo}.json`;
  const r = await fetch(`${GH}/repos/${c.repo}/contents/${path}?ref=${encodeURIComponent(c.branch)}`, {
    headers: ghHeaders(c.token),
    cache: 'no-store',
  });
  if (r.status === 404) return { doc: emptyDoc(periodo), sha: null };
  if (!r.ok) throw Object.assign(new Error('github_read_' + r.status), { status: 502 });
  const j = await r.json();
  const doc = JSON.parse(Buffer.from(j.content, 'base64').toString('utf8'));
  return { doc, sha: j.sha };
}

async function writeDoc(c, periodo, doc, sha, message) {
  const path = `dados/${periodo}.json`;
  const body = {
    message,
    content: Buffer.from(JSON.stringify(doc, null, 2), 'utf8').toString('base64'),
    branch: c.branch,
  };
  if (sha) body.sha = sha;
  const r = await fetch(`${GH}/repos/${c.repo}/contents/${path}`, {
    method: 'PUT',
    headers: { ...ghHeaders(c.token), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (r.status === 409 || r.status === 422) return { conflict: true };
  if (!r.ok) throw Object.assign(new Error('github_write_' + r.status), { status: 502 });
  return { conflict: false };
}

function cleanStr(v, max = 300) {
  return String(v == null ? '' : v).slice(0, max);
}

function applyOp(doc, body) {
  const { op } = body;
  if (op === 'coletiva') {
    const d = body.data || {};
    doc.coletiva = {
      expMeta: cleanStr(d.expMeta, 30),
      expReal: cleanStr(d.expReal, 30),
      demais: (Array.isArray(d.demais) ? d.demais : []).slice(0, 30).map((x) => ({
        nome: cleanStr(x.nome, 120),
        meta: cleanStr(x.meta, 30),
        real: cleanStr(x.real, 30),
      })),
    };
    return 'Metas coletivas';
  }
  if (op === 'salvar') {
    const rec = body.data || {};
    if (!rec.id || !/^[A-Za-z0-9_-]{1,60}$/.test(rec.id)) throw Object.assign(new Error('id_invalido'), { status: 400 });
    if (JSON.stringify(rec).length > 50000) throw Object.assign(new Error('registro_grande'), { status: 400 });
    rec.periodo = doc.periodo;
    doc.resultados[rec.id] = rec;
    return `Resultado de ${cleanStr(rec.nome, 60) || rec.id}`;
  }
  if (op === 'remover') {
    if (!body.id) throw Object.assign(new Error('id_invalido'), { status: 400 });
    delete doc.resultados[body.id];
    return `Remove resultado ${cleanStr(body.id, 60)}`;
  }
  throw Object.assign(new Error('op_invalida'), { status: 400 });
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const c = cfg();

  if (!c.token || !c.repo) return res.status(503).json({ error: 'nao_configurado' });

  if (c.senha) {
    const enviada = req.headers['x-senha'] || '';
    if (!enviada) return res.status(401).json({ error: 'senha_necessaria' });
    if (enviada !== c.senha) return res.status(401).json({ error: 'senha_incorreta' });
  }

  try {
    if (req.method === 'GET') {
      const periodo = String(req.query.periodo || '');
      if (!/^\d{4}-\d{2}$/.test(periodo)) return res.status(400).json({ error: 'periodo_invalido' });
      const { doc } = await readDoc(c, periodo);
      return res.status(200).json(doc);
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
      const periodo = String(body.periodo || '');
      if (!/^\d{4}-\d{2}$/.test(periodo)) return res.status(400).json({ error: 'periodo_invalido' });

      // leitura → alteração → gravação, repetindo se outra pessoa salvou no meio
      for (let tentativa = 0; tentativa < 4; tentativa++) {
        const { doc, sha } = await readDoc(c, periodo);
        doc.periodo = periodo;
        doc.resultados = doc.resultados || {};
        const msg = applyOp(doc, body);
        doc.atualizadoEm = new Date().toISOString();
        const w = await writeDoc(c, periodo, doc, sha, `[${periodo}] ${msg}`);
        if (!w.conflict) return res.status(200).json(doc);
        await new Promise((r) => setTimeout(r, 250 + Math.random() * 400));
      }
      return res.status(409).json({ error: 'conflito' });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'metodo_invalido' });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message || 'erro' });
  }
};
