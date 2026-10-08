/* Минимальная обёртка над fetch — общая для всех страниц DreamShop. */
(function (global) {
  async function req(method, url, body) {
    const opts = {
      method,
      credentials: 'same-origin',
      headers: {},
    };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(url, opts);
    const text = await res.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { error: text };
      }
    }
    if (!res.ok) {
      let msg = (data && data.error) || `HTTP ${res.status}`;
      if (data && Array.isArray(data.details) && data.details.length) {
        const lines = data.details
          .map((d) => {
            const path = Array.isArray(d.path) ? d.path.join('.') : d.path;
            return path ? `${path}: ${d.message}` : d.message;
          })
          .filter(Boolean);
        if (lines.length) msg += ' — ' + lines.join('; ');
      }
      const err = new Error(msg);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  const API = {
    get: (u) => req('GET', u),
    post: (u, b) => req('POST', u, b),
    put: (u, b) => req('PUT', u, b),
    patch: (u, b) => req('PATCH', u, b),
    del: (u) => req('DELETE', u),
    req,
  };

  global.API = API;
})(window);