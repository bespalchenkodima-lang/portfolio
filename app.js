(() => {
  const cfg = window.PORTFOLIO_CONFIG;
  const year = document.getElementById("year");
  if (year) year.textContent = new Date().getFullYear();

  const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[char]));

  document.querySelectorAll("[data-contact]").forEach((link) => {
    const url = cfg?.CONTACTS?.[link.dataset.contact];
    if (url && url !== "#") {
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    } else {
      link.addEventListener("click", (e) => e.preventDefault());
      link.classList.add("disabled-link");
    }
  });

  const grid = document.getElementById("projects-grid");
  const filtersEl = document.getElementById("filters");
  const serversGrid = document.getElementById("servers-grid");
  const reviewsList = document.getElementById("reviews-list");
  const reviewsSummary = document.getElementById("reviews-summary");
  const modal = document.getElementById("project-modal");
  const modalContent = document.getElementById("modal-content");
  const reviewForm = document.getElementById("review-form");
  const reviewMessage = document.getElementById("review-message");
  const reviewSubmit = document.getElementById("review-submit");
  const ratingPicker = document.getElementById("rating-picker");
  const ratingInput = document.getElementById("review-rating");

  if (!cfg?.SUPABASE_URL || cfg.SUPABASE_URL.includes("YOUR-PROJECT")) {
    if (grid) grid.innerHTML = `<div class="empty-state"><h3>Supabase ещё не подключён</h3><p>Заполни config.js.</p></div>`;
    if (serversGrid) serversGrid.innerHTML = `<div class="empty-state"><p>Supabase ещё не подключён.</p></div>`;
    if (reviewsList) reviewsList.innerHTML = `<div class="empty-state"><p>Supabase ещё не подключён.</p></div>`;
    if (reviewSubmit) reviewSubmit.disabled = true;
    return;
  }

  const sb = supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  let allProjects = [];
  let activeTag = "Все";
  let turnstileWidgetId = null;
  let turnstileToken = "";

  function renderFilters() {
    if (!filtersEl) return;
    const tags = ["Все", ...new Set(allProjects.flatMap((p) => p.tags || []))];
    filtersEl.innerHTML = tags.map((tag) => `
      <button class="filter-btn ${tag === activeTag ? "active" : ""}" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</button>
    `).join("");
    filtersEl.querySelectorAll("[data-tag]").forEach((btn) => btn.addEventListener("click", () => {
      activeTag = btn.dataset.tag;
      renderFilters();
      renderProjects();
    }));
  }

  function renderProjects() {
    if (!grid) return;
    const projects = activeTag === "Все" ? allProjects : allProjects.filter((p) => (p.tags || []).includes(activeTag));
    if (!projects.length) {
      grid.innerHTML = `<div class="empty-state"><h3>Работ пока нет</h3><p>Скоро здесь появятся проекты.</p></div>`;
      return;
    }
    grid.innerHTML = projects.map((project) => `
      <article class="project-card" data-project-id="${project.id}">
        <div class="project-image-wrap">
          ${project.cover_url ? `<img class="project-image" src="${escapeHtml(project.cover_url)}" alt="${escapeHtml(project.title)}" loading="lazy">` : `<div class="project-image project-placeholder">NO IMAGE</div>`}
        </div>
        <div class="project-card-body">
          <div class="tags">${(project.tags || []).map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>
          <h3>${escapeHtml(project.title)}</h3>
          <p>${escapeHtml(project.short_description || "")}</p>
          <button class="project-open" type="button">Подробнее →</button>
        </div>
      </article>
    `).join("");
    grid.querySelectorAll("[data-project-id]").forEach((card) => card.addEventListener("click", () => {
      const project = allProjects.find((p) => p.id === card.dataset.projectId);
      if (project) openProject(project);
    }));
  }

  function openProject(project) {
    const gallery = [project.cover_url, ...(project.gallery_urls || [])].filter(Boolean);
    modalContent.innerHTML = `
      <div class="modal-project">
        <p class="eyebrow">PROJECT</p>
        <h2>${escapeHtml(project.title)}</h2>
        <div class="modal-tags tags">${(project.tags || []).map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>
        ${gallery.length ? `
          <div class="gallery-main"><img id="gallery-main-image" src="${escapeHtml(gallery[0])}" alt="${escapeHtml(project.title)}"></div>
          <div class="gallery-thumbs">${gallery.map((url, i) => `<button class="gallery-thumb ${i === 0 ? "active" : ""}" data-image="${escapeHtml(url)}" type="button"><img src="${escapeHtml(url)}" alt=""></button>`).join("")}</div>
        ` : ""}
        <div class="project-description">${(project.description || project.short_description || "").split("\n").filter(Boolean).map((line) => `<p>${escapeHtml(line)}</p>`).join("")}</div>
      </div>`;
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    const mainImage = document.getElementById("gallery-main-image");
    modalContent.querySelectorAll("[data-image]").forEach((btn) => btn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (mainImage) mainImage.src = btn.dataset.image;
      modalContent.querySelectorAll(".gallery-thumb").forEach((x) => x.classList.remove("active"));
      btn.classList.add("active");
    }));
  }

  function closeModal() {
    if (!modal) return;
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
  }
  document.querySelectorAll("[data-close-modal]").forEach((el) => el.addEventListener("click", closeModal));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

  async function loadProjects() {
    if (!grid) return;
    const { data, error } = await sb.from("projects").select("id,title,short_description,description,tags,cover_url,gallery_urls,created_at").eq("published", true).order("created_at", { ascending: false });
    if (error) {
      grid.innerHTML = `<div class="empty-state"><h3>Не удалось загрузить работы</h3><p>${escapeHtml(error.message)}</p></div>`;
      return;
    }
    allProjects = data || [];
    renderFilters();
    renderProjects();
  }

  async function loadServers() {
    if (!serversGrid) return;
    const { data, error } = await sb.from("servers").select("id,name,description,url,sort_order").eq("published", true).order("sort_order", { ascending: true }).order("created_at", { ascending: false });
    if (error) {
      serversGrid.innerHTML = `<div class="empty-state"><p>${escapeHtml(error.message)}</p></div>`;
      return;
    }
    const servers = data || [];
    if (!servers.length) {
      serversGrid.innerHTML = `<div class="empty-state"><p>Список серверов скоро появится.</p></div>`;
      return;
    }
    serversGrid.innerHTML = servers.map((server) => `
      <article class="server-card">
        <div class="server-card-top"><span class="server-dot"></span><span>RUST SERVER</span></div>
        <h3>${escapeHtml(server.name)}</h3>
        <p>${escapeHtml(server.description || "")}</p>
        ${server.url ? `<a class="project-open" href="${escapeHtml(server.url)}" target="_blank" rel="noopener noreferrer">Открыть →</a>` : ""}
      </article>`).join("");
  }

  function stars(rating) {
    const r = Math.max(0, Math.min(5, Number(rating) || 0));
    return `<span class="stars" aria-label="${r} из 5">${"★".repeat(r)}${"☆".repeat(5-r)}</span>`;
  }

  async function loadReviews() {
    if (!reviewsList) return;
    const { data, error } = await sb.from("review_public").select("id,nickname,rating,body,owner_added,source_label,created_at").order("created_at", { ascending: false }).limit(100);
    if (error) {
      reviewsList.innerHTML = `<div class="empty-state"><p>${escapeHtml(error.message)}</p></div>`;
      return;
    }
    const reviews = data || [];
    if (!reviews.length) {
      reviewsList.innerHTML = `<div class="empty-state"><p>Отзывов пока нет. Можно оставить первый.</p></div>`;
      reviewsSummary.innerHTML = "";
      return;
    }
    reviewsList.innerHTML = reviews.map((review) => `
      <article class="review-card">
        <div class="review-card-head">
          <div><h3>${escapeHtml(review.nickname)}</h3>${review.owner_added ? `<span class="owner-added-label">Добавлено владельцем${review.source_label ? ` · ${escapeHtml(review.source_label)}` : ""}</span>` : ""}</div>
          ${stars(review.rating)}
        </div>
        <p>${escapeHtml(review.body)}</p>
        <time datetime="${escapeHtml(review.created_at)}">${new Date(review.created_at).toLocaleDateString("ru-RU")}</time>
      </article>`).join("");
    const rated = reviews.filter((r) => Number(r.rating) > 0);
    const average = rated.length ? rated.reduce((sum, r) => sum + Number(r.rating), 0) / rated.length : 0;
    reviewsSummary.innerHTML = rated.length ? `<strong>${average.toFixed(1)}</strong><span>${stars(Math.round(average))}<small>${rated.length} оценок</small></span>` : `<span>Пока без оценок</span>`;
  }

  function updateRatingUI(value) {
    const rating = Number(value);
    ratingInput.value = String(rating);
    ratingPicker.querySelectorAll("button").forEach((btn) => {
      const n = Number(btn.dataset.rating);
      btn.classList.toggle("active", n === 0 ? rating === 0 : n <= rating && rating > 0);
    });
  }
  ratingPicker?.querySelectorAll("button").forEach((btn) => btn.addEventListener("click", () => updateRatingUI(btn.dataset.rating)));

  function setReviewMessage(text, isError = false) {
    reviewMessage.textContent = text || "";
    reviewMessage.classList.toggle("error", isError);
    reviewMessage.classList.toggle("success", !!text && !isError);
  }

  function renderTurnstileWhenReady(attempt = 0) {
    const siteKey = cfg?.TURNSTILE_SITE_KEY;
    const container = document.getElementById("turnstile-container");
    if (!container || !siteKey || siteKey.includes("YOUR_TURNSTILE")) {
      if (reviewSubmit) reviewSubmit.disabled = true;
      if (container) container.innerHTML = `<p class="security-note">Форма отзывов будет доступна после настройки Turnstile.</p>`;
      return;
    }
    if (!window.turnstile) {
      if (attempt < 40) setTimeout(() => renderTurnstileWhenReady(attempt + 1), 250);
      return;
    }
    if (turnstileWidgetId !== null) return;
    turnstileWidgetId = window.turnstile.render(container, {
      sitekey: siteKey,
      theme: "dark",
      callback: (token) => { turnstileToken = token; setReviewMessage(""); },
      "expired-callback": () => { turnstileToken = ""; },
      "error-callback": () => { turnstileToken = ""; setReviewMessage("Не удалось загрузить проверку безопасности.", true); }
    });
  }

  reviewForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const nickname = document.getElementById("review-nickname").value.trim();
    const body = document.getElementById("review-text").value.trim();
    const rating = Number(ratingInput.value);
    if (!turnstileToken) { setReviewMessage("Подтверди, что ты не бот.", true); return; }
    reviewSubmit.disabled = true;
    setReviewMessage("Отправляем отзыв...");
    try {
      const { data, error } = await sb.functions.invoke("submit-review", { body: { nickname, body, rating, turnstileToken } });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.message || "Не удалось отправить отзыв");
      reviewForm.reset();
      updateRatingUI(0);
      turnstileToken = "";
      if (window.turnstile && turnstileWidgetId !== null) window.turnstile.reset(turnstileWidgetId);
      setReviewMessage("Спасибо! Отзыв опубликован.");
      await loadReviews();
    } catch (err) {
      setReviewMessage(err.message || "Не удалось отправить отзыв.", true);
      if (window.turnstile && turnstileWidgetId !== null) window.turnstile.reset(turnstileWidgetId);
      turnstileToken = "";
    } finally {
      reviewSubmit.disabled = false;
    }
  });

  loadProjects();
  loadServers();
  loadReviews();
  renderTurnstileWhenReady();
})();
