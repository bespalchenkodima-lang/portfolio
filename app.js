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
    let projects = activeTag === "Все" ? allProjects : allProjects.filter((p) => (p.tags || []).includes(activeTag));
    if (document.body.dataset.projectPage === "home") projects = projects.slice(0, 3);
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
    grid.querySelectorAll("[data-project-id]").forEach((card) => {
      const openButton = card.querySelector(".project-open");
      if (!openButton) return;
      openButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const projectId = String(card.dataset.projectId || "");
        const project = allProjects.find((p) => String(p.id) === projectId);
        if (project) openProject(project);
      });
    });
  }

  function openProject(project) {
    if (!project || !modal || !modalContent) return;
    const gallery = [project.cover_url, ...(Array.isArray(project.gallery_urls) ? project.gallery_urls : [])].filter(Boolean);
    modalContent.innerHTML = `
      <div class="modal-project">
        <p class="eyebrow">PROJECT</p>
        <h2>${escapeHtml(project.title)}</h2>
        <div class="modal-tags tags">${(project.tags || []).map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>
        ${gallery.length ? `
          <div class="gallery-main"><img id="gallery-main-image" src="${escapeHtml(gallery[0])}" alt="${escapeHtml(project.title)}" decoding="async"></div>
          <div class="gallery-thumbs">${gallery.map((url, i) => `<button class="gallery-thumb ${i === 0 ? "active" : ""}" data-image="${escapeHtml(url)}" type="button"><img src="${escapeHtml(url)}" alt="" loading="lazy" decoding="async"></button>`).join("")}</div>
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
    if (modalContent) modalContent.innerHTML = "";
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
          <div><h3>${escapeHtml(review.nickname)}</h3>${review.source_label ? `<span class="review-source-label">${escapeHtml(review.source_label)}</span>` : ""}</div>
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

  const REVIEW_COOLDOWN_MS = 60 * 1000;

  function getReviewCooldownRemaining() {
    const last = Number(localStorage.getItem("portfolio_review_last_submit") || 0);
    return Math.max(0, REVIEW_COOLDOWN_MS - (Date.now() - last));
  }

  reviewForm?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const nickname = document.getElementById("review-nickname").value.trim();
    const body = document.getElementById("review-text").value.trim();
    const rating = Number(ratingInput.value);

    if (nickname.length < 2 || nickname.length > 32) {
      setReviewMessage("Ник должен быть от 2 до 32 символов.", true);
      return;
    }
    if (body.length < 10 || body.length > 1000) {
      setReviewMessage("Отзыв должен быть от 10 до 1000 символов.", true);
      return;
    }
    if (!Number.isInteger(rating) || rating < 0 || rating > 5) {
      setReviewMessage("Выберите оценку от 0 до 5.", true);
      return;
    }

    const remaining = getReviewCooldownRemaining();
    if (remaining > 0) {
      setReviewMessage(`Подождите ${Math.ceil(remaining / 1000)} сек. перед следующей отправкой.`, true);
      return;
    }

    reviewSubmit.disabled = true;
    setReviewMessage("Отправляем отзыв...");

    try {
      const { data, error } = await sb.rpc("submit_public_review", {
        p_nickname: nickname,
        p_body: body,
        p_rating: rating
      });

      if (error) throw error;

      localStorage.setItem("portfolio_review_last_submit", String(Date.now()));
      reviewForm.reset();
      updateRatingUI(0);
      setReviewMessage("Спасибо! Отзыв опубликован.");
      await loadReviews();
    } catch (err) {
      console.error(err);
      setReviewMessage(err.message || "Не удалось отправить отзыв.", true);
    } finally {
      reviewSubmit.disabled = false;
    }
  });

  loadProjects();
  loadServers();
  loadReviews();
})();

/* =========================================================
   DD-DEV animated code background
   Decorative only: creates itself on pages that load app.js.
   ========================================================= */
(() => {
  if (document.querySelector('.dev-code-bg')) return;

  const codePool = [
    'using Oxide.Core;',
    'using Oxide.Core.Plugins;',
    'using UnityEngine;',
    'using Newtonsoft.Json;',
    'using System.Collections.Generic;',
    'public class DDDev : RustPlugin { }',
    '[Info("DD-DEV Core", "DD-DEV", "1.0.0")]',
    'private const string PermAdmin = "dddev.admin";',
    'permission.RegisterPermission(PermAdmin, this);',
    'Interface.CallHook("OnServerInitialized");',
    'void OnServerInitialized() => InitializeSystems();',
    'void OnServerSave() => SaveData();',
    'void Unload() => DestroyAllUI();',
    'void OnPlayerConnected(BasePlayer player) => LoadPlayerData(player);',
    'void OnPlayerDisconnected(BasePlayer player, string reason) => SavePlayerData(player.userID);',
    'if (player == null || !player.IsConnected) return;',
    'if (!permission.UserHasPermission(player.UserIDString, PermAdmin)) return;',
    'var online = BasePlayer.activePlayerList.Count;',
    'var sleepers = BasePlayer.sleepingPlayerList.Count;',
    'BasePlayer player = BasePlayer.FindByID(userId);',
    'BasePlayer player = BasePlayer.FindAwakeOrSleeping(userId.ToString());',
    'timer.Once(1f, () => RefreshHUD(player));',
    'timer.Every(60f, () => SaveServerStats());',
    'timer.Repeat(5f, 0, () => UpdateEvents());',
    'NextTick(() => DrawInterface(player));',
    'ServerMgr.Instance.Invoke(() => SaveData(), 0.1f);',
    'Puts($"Online players: {BasePlayer.activePlayerList.Count}");',
    'PrintWarning("Configuration updated successfully");',
    'PrintError("Unable to load requested module");',
    'Config.WriteObject(config, true);',
    'config = Config.ReadObject<PluginConfig>();',
    'DataFileSystem.WriteObject(Name, storedData);',
    'storedData = Interface.Oxide.DataFileSystem.ReadObject<StoredData>(Name);',
    'Dictionary<ulong, PlayerData> players = new Dictionary<ulong, PlayerData>();',
    'HashSet<ulong> activeUsers = new HashSet<ulong>();',
    'List<BasePlayer> targets = BasePlayer.activePlayerList;',
    'private readonly Dictionary<string, Timer> activeTimers = new();',
    'var position = player.transform.position;',
    'var distance = Vector3.Distance(player.transform.position, target.transform.position);',
    'if (distance > config.MaxDistance) return;',
    'player.ChatMessage("Система успешно загружена");',
    'SendReply(player, "Команда выполнена");',
    'ConsoleSystem.Run(ConsoleSystem.Option.Server, "server.save");',
    'ConsoleSystem.Run(ConsoleSystem.Option.Server, "weather.clear");',
    'covalence.Server.Command("server.save");',
    'cmd.AddChatCommand("menu", this, nameof(CommandMenu));',
    'cmd.AddConsoleCommand("dddev.reload", this, nameof(ConsoleReload));',
    '[ChatCommand("stats")]',
    '[ConsoleCommand("dddev.ui.close")]',
    'CuiHelper.DestroyUi(player, "DDDev.Main");',
    'CuiHelper.AddUi(player, container);',
    'var container = new CuiElementContainer();',
    'container.Add(new CuiPanel { Image = { Color = "0.08 0.10 0.12 0.96" } });',
    'container.Add(new CuiLabel { Text = { Text = title, FontSize = 16 } });',
    'container.Add(new CuiButton { Button = { Command = "dddev.open" } });',
    'plugins.Find("ImageLibrary")?.Call("AddImage", imageUrl, imageName);',
    'plugins.Find("Economics")?.Call("Deposit", player.userID, amount);',
    'plugins.Find("ServerRewards")?.Call("AddPoints", player.userID, points);',
    'object balance = Economics?.Call("Balance", player.userID);',
    '[PluginReference] private Plugin ImageLibrary, Economics, Kits;',
    'webrequest.Enqueue(url, null, HandleResponse, this);',
    'webrequest.EnqueueGet(apiUrl, (code, response) => ProcessApi(code, response), this);',
    'if (code != 200 || string.IsNullOrEmpty(response)) return;',
    'var payload = JsonConvert.DeserializeObject<ApiResponse>(response);',
    'string json = JsonConvert.SerializeObject(data, Formatting.Indented);',
    'private void Broadcast(string message) => Server.Broadcast(message);',
    'Server.Broadcast("Событие началось. Удачи!");',
    'Effect.server.Run(effectPrefab, position);',
    'EffectNetwork.Send(new Effect(effectPrefab, player, 0, Vector3.zero, Vector3.forward));',
    'entity.Kill(BaseNetworkable.DestroyMode.None);',
    'var entity = GameManager.server.CreateEntity(prefab, position, rotation);',
    'entity?.Spawn();',
    'item.MoveToContainer(player.inventory.containerMain);',
    'Item item = ItemManager.CreateByName(shortname, amount);',
    'player.inventory.GiveItem(item);',
    'player.health = Mathf.Clamp(player.health + healAmount, 0f, player.MaxHealth());',
    'if (player.IsDead() || player.IsWounded()) return;',
    'player.Teleport(destination);',
    'player.SetPlayerFlag(BasePlayer.PlayerFlags.SafeZone, true);',
    'private bool IsAdmin(BasePlayer player) => player.IsAdmin || HasPermission(player);',
    'private bool HasPermission(BasePlayer player) => permission.UserHasPermission(player.UserIDString, PermAdmin);',
    'private string Lang(string key, string id) => lang.GetMessage(key, this, id);',
    'lang.RegisterMessages(messages, this, "ru");',
    'lang.RegisterMessages(messagesEn, this, "en");',
    'private void SaveServerStats() { stats.LastSave = DateTime.UtcNow; SaveData(); }',
    'private void UpdateEconomy() { market.RefreshPrices(); market.Save(); }',
    'private void StartEvent() { eventActive = true; Broadcast(config.EventStarted); }',
    'private void StopEvent() { eventActive = false; CleanupEntities(); }',
    'private void InitializeSystems() { LoadConfig(); LoadData(); RegisterCommands(); }',
    'private void RegisterCommands() { AddCovalenceCommand("dd", nameof(CommandDD)); }',
    'private void RefreshHUD(BasePlayer player) { DestroyHUD(player); DrawHUD(player); }',
    'private void CleanupEntities() => spawnedEntities.RemoveAll(x => x == null || x.IsDestroyed);',
    'server.hostname "DD-DEV | Custom Rust Server";',
    'server.maxplayers 250;',
    'server.secure true;',
    'server.saveinterval 300;',
    'server.worldsize 3500;',
    'server.seed 123456;',
    'decay.scale 1.0;',
    'craft.instant false;',
    'chat.enabled true;',
    'oxide.reload DDDevCore;',
    'oxide.reload CustomHUD;',
    'oxide.reload BossSystem;',
    'oxide.reload ServerEvents;',
    'oxide.reload EconomyCore;',
    'oxide.unload DebugModule;',
    'oxide.plugins;',
    'o.reload DDDevCore;',
    'o.reload CustomHUD;',
    'o.reload EventManager;',
    'fps.limit 120;',
    'server.writecfg;',
    'global.status;',
    'global.players;',
    'global.say "Server maintenance completed";',
    'if (DateTime.UtcNow >= nextRestart) ScheduleRestart();',
    'TimeSpan uptime = DateTime.UtcNow - serverStartedAt;',
    'var session = sessions.GetValueOrDefault(player.userID);',
    'session.PlayTime += TimeSpan.FromSeconds(1);',
    'stats.TotalConnections++;',
    'stats.PeakOnline = Math.Max(stats.PeakOnline, online);',
    'cache[player.userID] = new PlayerCache { UpdatedAt = DateTime.UtcNow };',
    'await Task.Delay(250);',
    'CancellationTokenSource refreshToken = new CancellationTokenSource();',
    'queue.Enqueue(new ServerTask("SavePlayer", player.userID));',
    'while (queue.Count > 0) ProcessTask(queue.Dequeue());',
    'switch (eventType) { case EventType.Boss: StartBossEvent(); break; }',
    'return result.Success ? Result.Ok() : Result.Fail(result.Error);',
    'Logger.Info($"[{Name}] module ready in {elapsed} ms");',
    'Metrics.Set("players.online", BasePlayer.activePlayerList.Count);',
    'Metrics.Increment("events.completed");',
    'Cache.RemoveExpired(DateTime.UtcNow);',
    'RateLimiter.Allow(player.UserIDString, "command", 3, TimeSpan.FromSeconds(5));',
    'Audit.Log(player.UserIDString, "admin.action", actionName);',
    'Permissions.Sync(player.UserIDString);',
    'Database.Enqueue(() => repository.Save(profile));',
    'repository.UpdateLastSeen(player.userID, DateTime.UtcNow);',
    'economy.Transfer(sender.userID, receiver.userID, amount);',
    'market.SetPrice(itemId, Math.Round(basePrice * multiplier, 2));',
    'eventBus.Publish(new PlayerJoinedEvent(player.userID));',
    'eventBus.Subscribe<ServerReadyEvent>(_ => WarmupCaches());',
    'scheduler.Schedule("daily-restart", restartAt, RestartServer);',
    'scheduler.Cancel("expired-event");',
    'ui.Open(player, "main-menu");',
    'ui.Close(player, "main-menu");',
    'ui.Update(player, "online-count", online.ToString());',
    'localization.Get("welcome.message", player.UserIDString);',
    'config.AutoSave = true;',
    'config.Features.CustomHud = true;',
    'config.Features.DynamicEvents = true;',
    'config.Security.AdminPermission = "dddev.admin";',
    'config.Economy.StartBalance = 1000;',
    'config.Restart.WarningMinutes = new[] { 30, 15, 5, 1 };',
    'JsonConvert.PopulateObject(rawConfig, config);',
    'File.WriteAllText(path, JsonConvert.SerializeObject(config));',
    'if (!Directory.Exists(dataPath)) Directory.CreateDirectory(dataPath);',
    'try { LoadModules(); } catch (Exception ex) { PrintError(ex.Message); }',
    'finally { initializationLock = false; }',
    'Debug.Log("DD-DEV background service started");',
    'Application.logMessageReceived += HandleUnityLog;',
    'Rust.Application.isLoading = false;',
    'Performance.report.frameRate;',
    'Net.sv.write.Start();',
    'SaveRestore.Save(true);',
    'RelationshipManager.ServerInstance.playerToTeam.TryGetValue(player.userID, out var team);',
    'Vis.Entities(position, radius, entities, Rust.Layers.Mask.Player_Server);',
    'Physics.Raycast(ray, out RaycastHit hit, maxDistance);',
    'Quaternion rotation = Quaternion.Euler(0f, yaw, 0f);',
    'Vector3 spawnPoint = FindSafePosition(origin);',
    'Mathf.Lerp(currentValue, targetValue, Time.deltaTime * smoothSpeed);'
  ];

  const layer = document.createElement('div');
  layer.className = 'dev-code-bg';
  layer.setAttribute('aria-hidden', 'true');

  const rowCount = window.innerWidth < 700 ? 7 : 11;

  function shuffledPool() {
    const list = [...codePool];
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }

  let bag = shuffledPool();
  let bagIndex = 0;

  function nextSnippets(count) {
    const result = [];
    while (result.length < count) {
      if (bagIndex >= bag.length) {
        bag = shuffledPool();
        bagIndex = 0;
      }
      result.push(bag[bagIndex++]);
    }
    return result;
  }

  function makeCodeText(rowIndex) {
    const count = window.innerWidth < 700 ? 6 : 10;
    const lines = nextSnippets(count);
    const prefixes = ['// CORE', '// SERVER', '// OXIDE', '// RUNTIME', '// DD-DEV'];
    return `${prefixes[rowIndex % prefixes.length]}   ${lines.join('    //    ')}    //    `;
  }

  function fillTrack(track, rowIndex) {
    const text = makeCodeText(rowIndex);
    track.replaceChildren();
    for (let i = 0; i < 2; i++) {
      const span = document.createElement('span');
      span.className = 'dev-code-copy';
      span.textContent = text;
      track.appendChild(span);
    }
  }

  for (let i = 0; i < rowCount; i++) {
    const row = document.createElement('div');
    row.className = `dev-code-row ${i % 2 ? 'dev-code-row--reverse' : ''}`;
    row.style.top = `${4 + (i * 92 / Math.max(1, rowCount - 1))}%`;
    row.style.setProperty('--code-duration', `${58 + (i % 5) * 11 + Math.random() * 9}s`);
    row.style.setProperty('--code-delay', `${-(Math.random() * 45)}s`);
    row.style.setProperty('--code-opacity', `${0.11 + (i % 4) * 0.018}`);

    const track = document.createElement('div');
    track.className = 'dev-code-track';
    fillTrack(track, i);
    row.appendChild(track);
    layer.appendChild(row);

    // Change the actual code after every completed pass so the background
    // does not repeat one permanent strip forever.
    track.addEventListener('animationiteration', () => fillTrack(track, i));
  }

  const glow = document.createElement('div');
  glow.className = 'dev-code-glow';
  layer.appendChild(glow);

  document.body.prepend(layer);
})();
