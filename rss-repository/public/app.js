(() => {
  const state = {
    groups: [],
    activeGroupId: '',
  };

  const groupChips = document.getElementById('groupChips');
  const articleGrid = document.getElementById('articleGrid');
  const emptyState = document.getElementById('emptyState');
  const statusEl = document.getElementById('status');
  const refreshBtn = document.getElementById('refreshBtn');
  const groupsPanel = document.getElementById('groupsPanel');
  const newGroupForm = document.getElementById('newGroupForm');
  const newGroupName = document.getElementById('newGroupName');
  const bulkAddForm = document.getElementById('bulkAddForm');
  const bulkUrls = document.getElementById('bulkUrls');
  const bulkGroupSelect = document.getElementById('bulkGroupSelect');
  const bulkNewGroupName = document.getElementById('bulkNewGroupName');
  const bulkStatus = document.getElementById('bulkStatus');

  const NEW_GROUP_VALUE = '__new__';

  const groupCardTpl = document.getElementById('groupCardTemplate');
  const feedItemTpl = document.getElementById('feedItemTemplate');
  const articleCardTpl = document.getElementById('articleCardTemplate');

  function setStatus(msg, isError) {
    statusEl.textContent = msg || '';
    statusEl.style.color = isError ? 'var(--danger)' : 'var(--text-muted)';
  }

  async function api(path, options) {
    const res = await fetch(`/api${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Request failed (${res.status})`);
    }
    if (res.status === 204) return null;
    return res.json();
  }

  // ---------- Tabs ----------

  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.tab).classList.add('active');
    });
  });

  // ---------- Magazine ----------

  function timeAgo(dateStr) {
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const mins = Math.round(diffMs / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.round(hours / 24);
    return `${days}d ago`;
  }

  function renderChips() {
    groupChips.innerHTML = '';
    const allChip = document.createElement('button');
    allChip.className = `chip ${state.activeGroupId === '' ? 'active' : ''}`;
    allChip.dataset.group = '';
    allChip.textContent = 'All';
    allChip.addEventListener('click', () => selectGroup(''));
    groupChips.appendChild(allChip);

    for (const g of state.groups) {
      const chip = document.createElement('button');
      chip.className = `chip ${state.activeGroupId === g.id ? 'active' : ''}`;
      chip.textContent = g.name;
      chip.addEventListener('click', () => selectGroup(g.id));
      groupChips.appendChild(chip);
    }
  }

  function selectGroup(groupId) {
    state.activeGroupId = groupId;
    renderChips();
    loadArticles();
  }

  function renderArticles(articles) {
    articleGrid.innerHTML = '';
    emptyState.hidden = articles.length > 0;

    for (const article of articles) {
      const node = articleCardTpl.content.cloneNode(true);
      const imageDiv = node.querySelector('.article-image');
      if (article.imageUrl) {
        imageDiv.style.backgroundImage = `url("${article.imageUrl}")`;
      }
      const group = state.groups.find((g) => g.id === article.groupId);
      node.querySelector('.article-group').textContent = group ? group.name : '';
      node.querySelector('.article-date').textContent = timeAgo(article.pubDate);
      const link = node.querySelector('.article-title a');
      link.textContent = article.title;
      link.href = article.link || '#';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      node.querySelector('.article-snippet').textContent = article.contentSnippet || '';
      node.querySelector('.article-source').textContent = article.author || '';
      articleGrid.appendChild(node);
    }
  }

  async function loadArticles() {
    const qs = state.activeGroupId ? `?groupId=${encodeURIComponent(state.activeGroupId)}` : '';
    const articles = await api(`/articles${qs}`);
    renderArticles(articles);
  }

  refreshBtn.addEventListener('click', async () => {
    refreshBtn.disabled = true;
    setStatus('Refreshing feeds…');
    try {
      const result = await api('/refresh', { method: 'POST', body: JSON.stringify({}) });
      setStatus(`Refreshed ${result.feedsRefreshed} feed(s), ${result.articlesAdded} new article(s).`);
      await loadArticles();
    } catch (err) {
      setStatus(err.message, true);
    } finally {
      refreshBtn.disabled = false;
    }
  });

  // ---------- Manage ----------

  function renderGroups() {
    groupsPanel.innerHTML = '';
    for (const group of state.groups) {
      const node = groupCardTpl.content.cloneNode(true);
      const card = node.querySelector('.group-card');
      node.querySelector('.group-name').textContent = `${group.name} (${group.feedCount} feed${group.feedCount === 1 ? '' : 's'}, ${group.articleCount} articles)`;
      node.querySelector('.feed-url-input').value = group.feedUrl;

      node.querySelector('.copy-btn').addEventListener('click', async (e) => {
        await navigator.clipboard.writeText(group.feedUrl);
        e.target.textContent = 'Copied!';
        setTimeout(() => { e.target.textContent = 'Copy'; }, 1200);
      });

      node.querySelector('.delete-group-btn').addEventListener('click', async () => {
        if (!confirm(`Delete group "${group.name}" and all its feeds?`)) return;
        await api(`/groups/${group.id}`, { method: 'DELETE' });
        await refreshAllData();
      });

      const feedList = node.querySelector('.feed-list');
      for (const feed of state.feedsByGroup[group.id] || []) {
        const feedNode = feedItemTpl.content.cloneNode(true);
        feedNode.querySelector('.feed-title').textContent = feed.title || feed.url;
        feedNode.querySelector('.feed-error').textContent = feed.lastError ? `⚠ ${feed.lastError}` : '';
        feedNode.querySelector('.delete-feed-btn').addEventListener('click', async () => {
          await api(`/feeds/${feed.id}`, { method: 'DELETE' });
          await refreshAllData();
        });
        feedList.appendChild(feedNode);
      }

      const addFeedForm = node.querySelector('.add-feed-form');
      addFeedForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = addFeedForm.querySelector('.add-feed-input');
        const url = input.value.trim();
        if (!url) return;
        const btn = addFeedForm.querySelector('button');
        btn.disabled = true;
        try {
          await api(`/groups/${group.id}/feeds`, { method: 'POST', body: JSON.stringify({ url }) });
          input.value = '';
          await refreshAllData();
        } catch (err) {
          alert(err.message);
        } finally {
          btn.disabled = false;
        }
      });

      groupsPanel.appendChild(card);
    }
  }

  newGroupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = newGroupName.value.trim();
    if (!name) return;
    await api('/groups', { method: 'POST', body: JSON.stringify({ name }) });
    newGroupName.value = '';
    await refreshAllData();
  });

  // ---------- Bulk add ----------

  function renderBulkGroupOptions() {
    const previous = bulkGroupSelect.value;
    bulkGroupSelect.innerHTML = '';
    for (const g of state.groups) {
      const opt = document.createElement('option');
      opt.value = g.id;
      opt.textContent = g.name;
      bulkGroupSelect.appendChild(opt);
    }
    const newOpt = document.createElement('option');
    newOpt.value = NEW_GROUP_VALUE;
    newOpt.textContent = '+ New group…';
    bulkGroupSelect.appendChild(newOpt);

    const stillExists = state.groups.some((g) => g.id === previous);
    bulkGroupSelect.value = stillExists ? previous : NEW_GROUP_VALUE;
    bulkNewGroupName.hidden = bulkGroupSelect.value !== NEW_GROUP_VALUE;
  }

  bulkGroupSelect.addEventListener('change', () => {
    bulkNewGroupName.hidden = bulkGroupSelect.value !== NEW_GROUP_VALUE;
  });

  bulkAddForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const urls = [...new Set(
      bulkUrls.value.split(/[\n,]+/).map((u) => u.trim()).filter(Boolean)
    )];
    if (urls.length === 0) return;

    const btn = bulkAddForm.querySelector('button');
    btn.disabled = true;
    bulkStatus.style.color = 'var(--text-muted)';
    bulkStatus.textContent = `Adding ${urls.length} feed(s)…`;

    try {
      let targetGroupId = bulkGroupSelect.value;
      let targetGroupName;

      if (targetGroupId === NEW_GROUP_VALUE) {
        const name = bulkNewGroupName.value.trim();
        if (!name) {
          bulkStatus.style.color = 'var(--danger)';
          bulkStatus.textContent = 'Enter a name for the new group.';
          return;
        }
        const group = await api('/groups', { method: 'POST', body: JSON.stringify({ name }) });
        targetGroupId = group.id;
        targetGroupName = group.name;
      } else {
        targetGroupName = (state.groups.find((g) => g.id === targetGroupId) || {}).name;
      }

      const result = await api(`/groups/${targetGroupId}/feeds/bulk`, {
        method: 'POST',
        body: JSON.stringify({ urls }),
      });

      const failed = result.results.filter((r) => !r.ok);
      let msg = `Added ${result.added} of ${result.requested} feed(s) to "${targetGroupName}".`;
      if (failed.length > 0) {
        msg += ` Failed: ${failed.map((f) => `${f.url} (${f.error})`).join('; ')}`;
      }
      bulkStatus.style.color = failed.length > 0 ? 'var(--danger)' : 'var(--text-muted)';
      bulkStatus.textContent = msg;

      bulkUrls.value = '';
      bulkNewGroupName.value = '';
      await refreshAllData();
      bulkGroupSelect.value = targetGroupId;
      bulkNewGroupName.hidden = true;
    } catch (err) {
      bulkStatus.style.color = 'var(--danger)';
      bulkStatus.textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  });

  // ---------- Data loading ----------

  async function refreshAllData() {
    state.groups = await api('/groups');
    const feeds = await api('/feeds');
    state.feedsByGroup = {};
    for (const feed of feeds) {
      (state.feedsByGroup[feed.groupId] ||= []).push(feed);
    }
    renderChips();
    renderGroups();
    renderBulkGroupOptions();
    await loadArticles();
  }

  refreshAllData().catch((err) => setStatus(err.message, true));
})();
