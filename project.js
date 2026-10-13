(() => {
  const cfg = window.PORTFOLIO_CONFIG;
  const root = document.getElementById("project-detail");
  const year = document.getElementById("year");
  if (year) year.textContent = new Date().getFullYear();

  const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[char]));

  if (!root) return;
  const id = new URLSearchParams(location.search).get("id");
  if (!id) {
    root.innerHTML = `<div class="empty-state"><h3>Проект не найден</h3><p>В ссылке отсутствует ID проекта.</p></div>`;
    return;
  }

  if (!cfg?.SUPABASE_URL || cfg.SUPABASE_URL.includes("YOUR-PROJECT")) {
    root.innerHTML = `<div class="empty-state"><h3>Supabase ещё не подключён</h3></div>`;
    return;
  }

  const sb = supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

  async function loadProject() {
    const { data: project, error } = await sb
      .from("projects")
      .select("id,title,short_description,description,tags,cover_url,gallery_urls,created_at")
      .eq("id", id)
      .eq("published", true)
      .maybeSingle();

    if (error || !project) {
      root.innerHTML = `<div class="empty-state"><h3>Проект не найден</h3><p>${escapeHtml(error?.message || "Возможно, он снят с публикации.")}</p></div>`;
      return;
    }

    document.title = `${project.title} — DD-DEV`;
    const gallery = [project.cover_url, ...(Array.isArray(project.gallery_urls) ? project.gallery_urls : [])]
      .filter(Boolean)
      .filter((url, index, arr) => arr.indexOf(url) === index);

    root.innerHTML = `
      <article class="project-detail-card">
        <p class="eyebrow">PROJECT</p>
        <h1>${escapeHtml(project.title)}</h1>
        <div class="modal-tags tags">${(project.tags || []).map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>
        ${gallery.length ? `
          <div class="gallery-main project-detail-main"><img id="gallery-main-image" src="${escapeHtml(gallery[0])}" alt="${escapeHtml(project.title)}" decoding="async"></div>
          ${gallery.length > 1 ? `<div class="gallery-thumbs">${gallery.map((url, i) => `<button class="gallery-thumb ${i === 0 ? "active" : ""}" data-image="${escapeHtml(url)}" type="button"><img src="${escapeHtml(url)}" alt="" loading="lazy" decoding="async"></button>`).join("")}</div>` : ""}
        ` : ""}
        <div class="project-description">${(project.description || project.short_description || "").split("\n").filter(Boolean).map((line) => `<p>${escapeHtml(line)}</p>`).join("")}</div>
      </article>`;

    const mainImage = document.getElementById("gallery-main-image");
    root.querySelectorAll("[data-image]").forEach((btn) => btn.addEventListener("click", () => {
      if (mainImage) mainImage.src = btn.dataset.image;
      root.querySelectorAll(".gallery-thumb").forEach((x) => x.classList.remove("active"));
      btn.classList.add("active");
    }));
  }

  loadProject();
})();
