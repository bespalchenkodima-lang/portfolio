(() => {
  const cfg = window.PORTFOLIO_CONFIG;
  const $ = (id) => document.getElementById(id);
  const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[char]));

  if (!cfg?.SUPABASE_URL || cfg.SUPABASE_URL.includes("YOUR-PROJECT")) {
    $("login-view").innerHTML = `<p class="eyebrow">CONFIG REQUIRED</p><h1>Сначала подключи Supabase</h1><p>Заполни config.js.</p>`;
    return;
  }

  const sb = supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  let projects = [];
  let editingProject = null;
  let servers = [];
  let editingServer = null;

  function setMessage(el, text, isError = false) {
    if (!el) return;
    el.textContent = text || "";
    el.classList.toggle("error", isError);
    el.classList.toggle("success", !!text && !isError);
  }

  function setAuthUI(isLoggedIn) {
    $("login-view").classList.toggle("hidden", isLoggedIn);
    $("admin-view").classList.toggle("hidden", !isLoggedIn);
    $("logout-btn").classList.toggle("hidden", !isLoggedIn);
    if (isLoggedIn) Promise.all([loadProjects(), loadReviews(), loadServers()]);
  }

  async function checkSession() {
    const { data } = await sb.auth.getSession();
    setAuthUI(!!data.session);
  }

  $("login-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    setMessage($("login-message"), "Входим...");
    const { error } = await sb.auth.signInWithPassword({ email: $("login-email").value.trim(), password: $("login-password").value });
    if (error) return setMessage($("login-message"), error.message, true);
    setMessage($("login-message"), "");
    const test = await sb.from("projects").select("id").limit(1);
    if (test.error) {
      await sb.auth.signOut();
      setMessage($("login-message"), "Этот аккаунт не имеет прав администратора.", true);
      return;
    }
    setAuthUI(true);
  });

  $("logout-btn")?.addEventListener("click", async () => { await sb.auth.signOut(); setAuthUI(false); });

  document.querySelectorAll("[data-admin-tab]").forEach((btn) => btn.addEventListener("click", () => {
    const tab = btn.dataset.adminTab;
    document.querySelectorAll("[data-admin-tab]").forEach((x) => x.classList.toggle("active", x === btn));
    document.querySelectorAll("[data-admin-panel]").forEach((panel) => panel.classList.toggle("hidden", panel.dataset.adminPanel !== tab));
  }));

  function safeFileName(name) { return name.toLowerCase().replace(/[^a-z0-9а-яё._-]+/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, ""); }

  async function compressImage(file, maxWidth = 1920, quality = 0.82) {
    if (!file.type.startsWith("image/")) throw new Error("Можно загружать только изображения.");
    if (file.size > 12 * 1024 * 1024) throw new Error("Исходное изображение больше 12 МБ.");
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxWidth / bitmap.width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", quality));
    if (!blob) throw new Error("Не удалось обработать изображение.");
    return new File([blob], safeFileName(file.name.replace(/\.[^.]+$/, "")) + ".webp", { type: "image/webp" });
  }

  async function uploadFile(file) {
    const compressed = await compressImage(file);
    const path = `projects/${crypto.randomUUID()}.webp`;
    const { error } = await sb.storage.from("portfolio").upload(path, compressed, { cacheControl: "3600", upsert: false, contentType: "image/webp" });
    if (error) throw error;
    return sb.storage.from("portfolio").getPublicUrl(path).data.publicUrl;
  }

  async function uploadMany(files) {
    const urls = [];
    for (const file of files) urls.push(await uploadFile(file));
    return urls;
  }

  $("refresh-btn")?.addEventListener("click", loadProjects);
  $("new-project-btn")?.addEventListener("click", () => resetProjectForm());
  $("cancel-edit-btn")?.addEventListener("click", () => resetProjectForm());

  $("project-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    setMessage($("project-message"), "Сохраняем...");
    $("save-btn").disabled = true;
    try {
      let coverUrl = editingProject?.cover_url || null;
      let galleryUrls = [...(editingProject?.gallery_urls || [])];
      const coverFile = $("cover-file").files?.[0];
      if (coverFile) coverUrl = await uploadFile(coverFile);
      const galleryFiles = Array.from($("gallery-files").files || []);
      if (galleryFiles.length) galleryUrls.push(...await uploadMany(galleryFiles));
      const payload = {
        title: $("title").value.trim(), short_description: $("short-description").value.trim(), description: $("description").value.trim(),
        tags: $("tags").value.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 20), cover_url: coverUrl,
        gallery_urls: galleryUrls.slice(0, 30), published: $("published").checked, updated_at: new Date().toISOString()
      };
      const result = editingProject
        ? await sb.from("projects").update(payload).eq("id", editingProject.id).select().single()
        : await sb.from("projects").insert(payload).select().single();
      if (result.error) throw result.error;
      setMessage($("project-message"), "Готово. Работа сохранена.");
      resetProjectForm(false);
      await loadProjects();
    } catch (err) { setMessage($("project-message"), err.message || "Ошибка", true); }
    finally { $("save-btn").disabled = false; }
  });

  function resetProjectForm(clearMessage = true) {
    editingProject = null; $("project-form").reset(); $("published").checked = true; $("project-id").value = "";
    $("form-title").textContent = "Новая работа"; $("cancel-edit-btn").classList.add("hidden"); $("current-cover").innerHTML = ""; $("current-gallery").innerHTML = "";
    if (clearMessage) setMessage($("project-message"), "");
  }

  function fillProjectForm(project) {
    editingProject = structuredClone(project); $("project-id").value = project.id; $("title").value = project.title || ""; $("short-description").value = project.short_description || "";
    $("description").value = project.description || ""; $("tags").value = (project.tags || []).join(", "); $("published").checked = !!project.published;
    $("form-title").textContent = "Редактирование"; $("cancel-edit-btn").classList.remove("hidden");
    $("current-cover").innerHTML = project.cover_url ? `<div class="media-preview"><img src="${escapeHtml(project.cover_url)}" alt=""><span>Текущая главная картинка</span></div>` : "";
    renderCurrentGallery(); window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderCurrentGallery() {
    const gallery = editingProject?.gallery_urls || [];
    $("current-gallery").innerHTML = gallery.map((url, i) => `<div class="gallery-admin-item"><img src="${escapeHtml(url)}" alt=""><button type="button" data-remove-gallery="${i}">×</button></div>`).join("");
    $("current-gallery").querySelectorAll("[data-remove-gallery]").forEach((btn) => btn.addEventListener("click", () => { editingProject.gallery_urls.splice(Number(btn.dataset.removeGallery), 1); renderCurrentGallery(); }));
  }

  async function loadProjects() {
    const { data, error } = await sb.from("projects").select("*").order("created_at", { ascending: false });
    if (error) { $("admin-projects-list").innerHTML = `<div class="empty-state"><p>${escapeHtml(error.message)}</p></div>`; return; }
    projects = data || []; renderProjectList();
  }

  function renderProjectList() {
    $("admin-projects-list").innerHTML = projects.length ? projects.map((p) => `
      <article class="admin-project-item"><div class="admin-project-thumb">${p.cover_url ? `<img src="${escapeHtml(p.cover_url)}" alt="">` : `<span>NO IMAGE</span>`}</div>
      <div class="admin-project-info"><div class="admin-project-title-row"><h3>${escapeHtml(p.title)}</h3><span class="status-badge ${p.published ? "published" : "draft"}">${p.published ? "Опубликовано" : "Черновик"}</span></div>
      <p>${escapeHtml(p.short_description || "")}</p><div class="admin-item-actions"><button class="mini-btn" data-edit-project="${p.id}">Редактировать</button><button class="mini-btn danger" data-delete-project="${p.id}">Удалить</button></div></div></article>`).join("") : `<div class="empty-state"><p>Работ пока нет.</p></div>`;
    $("admin-projects-list").querySelectorAll("[data-edit-project]").forEach((btn) => btn.addEventListener("click", () => { const p = projects.find((x) => x.id === btn.dataset.editProject); if (p) fillProjectForm(p); }));
    $("admin-projects-list").querySelectorAll("[data-delete-project]").forEach((btn) => btn.addEventListener("click", async () => {
      const p = projects.find((x) => x.id === btn.dataset.deleteProject); if (!p || !confirm(`Удалить работу "${p.title}"?`)) return;
      const { error } = await sb.from("projects").delete().eq("id", p.id); if (error) return alert(error.message); await loadProjects();
    }));
  }

  $("refresh-reviews-btn")?.addEventListener("click", loadReviews);
  $("manual-review-form")?.addEventListener("submit", async (e) => {
    e.preventDefault(); setMessage($("manual-review-message"), "Добавляем...");
    const payload = { nickname: $("manual-review-nickname").value.trim(), body: $("manual-review-text").value.trim(), rating: Number($("manual-review-rating").value), owner_added: true, source_label: $("manual-review-source").value.trim() || null, published: true };
    const { error } = await sb.from("reviews").insert(payload); if (error) return setMessage($("manual-review-message"), error.message, true);
    $("manual-review-form").reset(); $("manual-review-rating").value = "5"; setMessage($("manual-review-message"), "Отзыв добавлен."); await loadReviews();
  });

  async function loadReviews() {
    const { data, error } = await sb.from("reviews").select("id,nickname,rating,body,owner_added,source_label,published,created_at").order("created_at", { ascending: false });
    if (error) { $("admin-reviews-list").innerHTML = `<div class="empty-state"><p>${escapeHtml(error.message)}</p></div>`; return; }
    const reviews = data || [];
    $("admin-reviews-list").innerHTML = reviews.length ? reviews.map((r) => `
      <article class="admin-review-item"><div class="admin-review-top"><div><h3>${escapeHtml(r.nickname)}</h3><span class="status-badge ${r.published ? "published" : "draft"}">${r.published ? "Виден" : "Скрыт"}</span>${r.owner_added ? `<span class="owner-added-label">Добавлен владельцем${r.source_label ? ` · ${escapeHtml(r.source_label)}` : ""}</span>` : ""}</div><strong>${r.rating}/5 ★</strong></div>
      <p>${escapeHtml(r.body)}</p><div class="admin-item-actions"><button class="mini-btn" data-toggle-review="${r.id}" data-published="${r.published}">${r.published ? "Скрыть" : "Показать"}</button><button class="mini-btn danger" data-delete-review="${r.id}">Удалить</button></div></article>`).join("") : `<div class="empty-state"><p>Отзывов пока нет.</p></div>`;
    $("admin-reviews-list").querySelectorAll("[data-toggle-review]").forEach((btn) => btn.addEventListener("click", async () => { const { error } = await sb.from("reviews").update({ published: btn.dataset.published !== "true" }).eq("id", btn.dataset.toggleReview); if (error) alert(error.message); else loadReviews(); }));
    $("admin-reviews-list").querySelectorAll("[data-delete-review]").forEach((btn) => btn.addEventListener("click", async () => { if (!confirm("Удалить этот отзыв?")) return; const { error } = await sb.from("reviews").delete().eq("id", btn.dataset.deleteReview); if (error) alert(error.message); else loadReviews(); }));
  }

  $("refresh-servers-btn")?.addEventListener("click", loadServers);
  $("server-cancel-btn")?.addEventListener("click", () => resetServerForm());
  $("server-form")?.addEventListener("submit", async (e) => {
    e.preventDefault(); setMessage($("server-message"), "Сохраняем...");
    const payload = { name: $("server-name").value.trim(), description: $("server-description").value.trim(), url: $("server-url").value.trim() || null, sort_order: Number($("server-sort-order").value) || 0, published: $("server-published").checked, updated_at: new Date().toISOString() };
    const result = editingServer ? await sb.from("servers").update(payload).eq("id", editingServer.id) : await sb.from("servers").insert(payload);
    if (result.error) return setMessage($("server-message"), result.error.message, true);
    setMessage($("server-message"), "Сохранено."); resetServerForm(false); await loadServers();
  });

  function resetServerForm(clearMessage = true) { editingServer = null; $("server-form").reset(); $("server-sort-order").value = 0; $("server-published").checked = true; $("server-cancel-btn").classList.add("hidden"); if (clearMessage) setMessage($("server-message"), ""); }
  function fillServerForm(s) { editingServer = s; $("server-name").value = s.name || ""; $("server-description").value = s.description || ""; $("server-url").value = s.url || ""; $("server-sort-order").value = s.sort_order || 0; $("server-published").checked = !!s.published; $("server-cancel-btn").classList.remove("hidden"); }

  async function loadServers() {
    const { data, error } = await sb.from("servers").select("*").order("sort_order", { ascending: true }).order("created_at", { ascending: false });
    if (error) { $("admin-servers-list").innerHTML = `<div class="empty-state"><p>${escapeHtml(error.message)}</p></div>`; return; }
    servers = data || [];
    $("admin-servers-list").innerHTML = servers.length ? servers.map((s) => `
      <article class="admin-review-item"><div class="admin-review-top"><div><h3>${escapeHtml(s.name)}</h3><span class="status-badge ${s.published ? "published" : "draft"}">${s.published ? "Виден" : "Скрыт"}</span></div><strong>#${s.sort_order || 0}</strong></div><p>${escapeHtml(s.description || "")}</p><div class="admin-item-actions"><button class="mini-btn" data-edit-server="${s.id}">Редактировать</button><button class="mini-btn danger" data-delete-server="${s.id}">Удалить</button></div></article>`).join("") : `<div class="empty-state"><p>Серверов пока нет.</p></div>`;
    $("admin-servers-list").querySelectorAll("[data-edit-server]").forEach((btn) => btn.addEventListener("click", () => { const s = servers.find((x) => x.id === btn.dataset.editServer); if (s) fillServerForm(s); }));
    $("admin-servers-list").querySelectorAll("[data-delete-server]").forEach((btn) => btn.addEventListener("click", async () => { if (!confirm("Удалить этот сервер из списка?")) return; const { error } = await sb.from("servers").delete().eq("id", btn.dataset.deleteServer); if (error) alert(error.message); else loadServers(); }));
  }

  sb.auth.onAuthStateChange((_event, session) => setAuthUI(!!session));
  checkSession();
})();
