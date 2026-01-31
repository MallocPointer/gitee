// Moark Web (Cloudflare Pages/Workers)
// - Calls ai.gitee.com via same-origin proxy: /api/* (Pages Functions) to avoid CORS.
// - Downloads images/videos via /dl?url=... (Pages Function) to avoid cross-origin blocks.

const BASE_V1 = "https://ai.gitee.com/v1"; // for reference only (proxied)
const $ = (id) => document.getElementById(id);

const Z_RESOLUTIONS = {
  "1:1 (2048x2048)": [2048, 2048],
  "1:1 (1024x1024)": [1024, 1024],
  "3:4 (768x1024)": [768, 1024],
  "4:3 (1024x768)": [1024, 768],
  "16:9 (1024x576)": [1024, 576],
  "9:16 (576x1024)": [576, 1024],
};

const EDIT_TASK_TYPES = ["id", "style", "pose", "layout", "color", "background"];

const WAN_RES_PRESETS = {
  "480p 横屏 / 832x480 (推荐 / Recommended)": [832, 480],
  "480p 竖屏 / 480x832": [480, 832],
  "720p 横屏 / 1280x720": [1280, 720],
  "720p 竖屏 / 720x1280": [720, 1280],
  "1024 方图 / 1024x1024": [1024, 1024],
  "2048 方图 / 2048x2048 (高成本 / Expensive)": [2048, 2048],
};

function nowTs() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function setStatus(text, kind="info") {
  const badge = $("statusBadge");
  badge.textContent = text;
  // tiny visual cue
  badge.style.borderColor =
    kind === "ok" ? "rgba(37,194,160,.7)" :
    kind === "err" ? "rgba(255,84,112,.75)" :
    "rgba(255,255,255,.10)";
}

function getApiKey() {
  const key = $("apiKey").value.trim();
  if (!key) throw new Error("请输入 API Key / Please enter API Key");
  return key;
}

function rememberKeyMaybe() {
  const key = $("apiKey").value.trim();
  if ($("rememberKey").checked && key) {
    localStorage.setItem("moark_api_key", key);
  }
}

function loadRememberedKey() {
  const key = localStorage.getItem("moark_api_key") || "";
  if (key) {
    $("apiKey").value = key;
    $("rememberKey").checked = true;
  }
}

function clearRememberedKey() {
  localStorage.removeItem("moark_api_key");
  $("apiKey").value = "";
  $("rememberKey").checked = false;
}

function showPanel(model) {
  $("panelZ").style.display = model === "z-image" ? "block" : "none";
  $("panelEdit").style.display = model === "Edit-2511" ? "block" : "none";
  $("panelWan").style.display = model === "Wan2.2-I2V-A14B" ? "block" : "none";
  $("panelHunyuan").style.display = model === "HunyuanVideo-1.5" ? "block" : "none";
}

function addOutputItem({title, kind="info", meta="", element=null, rawJson=null, download=null, openUrl=null}) {
  const out = $("output");
  const box = document.createElement("div");
  box.className = "item";

  const h = document.createElement("h3");
  h.textContent = title;
  box.appendChild(h);

  if (meta) {
    const m = document.createElement("div");
    m.className = "meta";
    m.textContent = meta;
    box.appendChild(m);
  }

  if (element) box.appendChild(element);

  if (rawJson) {
    const pre = document.createElement("pre");
    pre.textContent = JSON.stringify(rawJson, null, 2);
    box.appendChild(pre);

    const btns = document.createElement("div");
    btns.className = "row";
    const b = document.createElement("button");
    b.className = "btn";
    b.textContent = "下载 JSON / Download JSON";
    b.onclick = () => downloadBlob(new Blob([pre.textContent], {type:"application/json"}), `${title}_${nowTs()}.json`);
    btns.appendChild(b);
    box.appendChild(btns);
  }

  if (download) {
    const btn = document.createElement("a");
    btn.className = "btn";
    btn.textContent = "下载 / Download";
    btn.href = download.href;
    btn.download = download.filename || "";
    btn.target = "_blank";
    btn.rel = "noopener";
    const row = document.createElement("div");
    row.className = "row";
    row.appendChild(btn);

    if (openUrl) {
      const b2 = document.createElement("a");
      b2.className = "btn";
      b2.textContent = "打开 file_url";
      b2.href = openUrl;
      b2.target = "_blank";
      b2.rel = "noopener";
      row.appendChild(b2);
    }
    box.appendChild(row);
  } else if (openUrl) {
    const row = document.createElement("div");
    row.className = "row";
    const b2 = document.createElement("a");
    b2.className = "btn";
    b2.textContent = "打开 file_url";
    b2.href = openUrl;
    b2.target = "_blank";
    b2.rel = "noopener";
    row.appendChild(b2);
    box.appendChild(row);
  }

  out.prepend(box);
  return box;
}

function clearOutput() {
  $("output").innerHTML = "";
}

// Same-origin proxy to ai.gitee.com/v1
async function apiFetch(path, {method="GET", headers={}, body=null, signal=null}={}) {
  const res = await fetch(`/api/${path.replace(/^\/+/, "")}`, {
    method,
    headers,
    body,
    signal,
  });
  return res;
}

// Download proxy for arbitrary file_url/image urls to avoid CORS
async function dlFetch(url, {signal=null}={}) {
  const u = `/dl?url=${encodeURIComponent(url)}`;
  const res = await fetch(u, {method:"GET", signal});
  return res;
}

async function readJsonSafely(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { _text: text };
  }
}

function clampInt(v, lo, hi, defv) {
  const n = Number.parseInt(String(v), 10);
  if (Number.isFinite(n)) return Math.max(lo, Math.min(hi, n));
  return defv;
}

function clampFloat(v, lo, hi, defv) {
  const n = Number.parseFloat(String(v));
  if (Number.isFinite(n)) return Math.max(lo, Math.min(hi, n));
  return defv;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

async function fetchAsBlob(url, kindHint="file") {
  const r = await dlFetch(url);
  if (!r.ok) {
    const j = await readJsonSafely(r);
    throw new Error(`下载失败 / Download failed (${r.status}): ${JSON.stringify(j).slice(0, 240)}`);
  }
  const blob = await r.blob();
  const objUrl = URL.createObjectURL(blob);
  return { blob, objUrl };
}

// Poll task status
async function pollTask(taskId, apiKey, {timeoutMs=30*60*1000, intervalMs=6000, onTick=null}={}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (onTick) onTick();
    const res = await apiFetch(`task/${encodeURIComponent(taskId)}`, {
      method: "GET",
      headers: { "Authorization": `Bearer ${apiKey}` },
    });
    const j = await readJsonSafely(res);
    const st = j.status || "unknown";
    if (st === "success" || st === "failed" || st === "cancelled") {
      return { status: st, raw: j };
    }
    await new Promise(r => setTimeout(r, intervalMs));
  }
  return { status: "timeout", raw: { status:"timeout", message:"maximum wait time exceeded" } };
}


// -------- HunyuanVideo-1.5 (Text-to-Video) --------
async function runHunyuanVideo() {
  const apiKey = getApiKey();
  rememberKeyMaybe();

  const prompt = $("hyPrompt").value.trim();
  if (!prompt) throw new Error("请输入提示词 / Please input prompt");

  const negative_prompt = $("hyNeg").value.trim();

  const aspect_ratio = $("hyAspect").value;
  const num_inferenece_steps = clampInt($("hySteps").value, 1, 10, 10);
  const num_frames = clampInt($("hyFrames").value, 81, 241, 241);

  // seed must be positive integer
  const seedRaw = $("hySeed").value;
  const seed = Number.parseInt(String(seedRaw), 10);
  if (!Number.isFinite(seed) || seed <= 0) {
    throw new Error("seed 必须是正整数 / seed must be a positive integer");
  }

  const fps = clampInt($("hyFps").value, 1, 24, 24);
  const openAfter = $("hyOpenUrl").checked;

  // Compose payload (keep server field name: num_inferenece_steps)
  const payload = {
    prompt,
    model: "HunyuanVideo-1.5",
    aspect_ratio,
    negative_prompt,
    num_inferenece_steps,
    num_frames,
    seed,
    fps,
  };

  setStatus("HunyuanVideo 创建任务... / Creating task...");
  const res = await apiFetch("async/videos/generations", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const j = await readJsonSafely(res);
  if (!res.ok) {
    setStatus("HunyuanVideo 失败 / Failed", "err");
    addOutputItem({
      title: "HunyuanVideo 创建任务失败 / Create task failed",
      meta: `HTTP ${res.status}`,
      rawJson: j,
    });
    throw new Error(`API 错误 / API Error (${res.status})`);
  }

  const taskId = j.task_id;
  if (!taskId) {
    setStatus("HunyuanVideo 失败 / Failed", "err");
    addOutputItem({
      title: "HunyuanVideo 未返回 task_id / Missing task_id",
      rawJson: j,
    });
    throw new Error("Task ID not found in response");
  }

  addOutputItem({
    title: "HunyuanVideo 任务已创建 / Task created",
    meta: `task_id=${taskId} • aspect_ratio=${aspect_ratio} • frames=${num_frames} • fps=${fps} • steps=${num_inferenece_steps} • seed=${seed}`,
    rawJson: j,
    openUrl: openAfter ? `https://ai.gitee.com/v1/task/${encodeURIComponent(taskId)}` : null,
  });

  setStatus("HunyuanVideo 轮询中... / Polling...");
  let tick = 0;
  const result = await pollTask(taskId, apiKey, {
    intervalMs: 10 * 1000,
    timeoutMs: 30 * 60 * 1000,
    onTick: () => {
      tick++;
      if (tick % 2 === 0) setStatus(`HunyuanVideo 轮询中... (${tick}) / Polling... (${tick})`);
    },
  });

  const st = result.status;
  const raw = result.raw || {};

  if (st !== "success") {
    setStatus(`HunyuanVideo ${st} / ${st}`, st === "failed" ? "err" : "info");
    addOutputItem({
      title: `HunyuanVideo 任务结束：${st} / Task ended: ${st}`,
      rawJson: raw,
      meta: `task_id=${taskId}`,
    });
    return;
  }

  // success
  const fileUrl = raw?.output?.file_url;
  const textRes = raw?.output?.text_result;

  if (fileUrl) {
    const blobInfo = await fetchAsBlob(fileUrl, "video");
    const video = document.createElement("video");
    video.src = blobInfo.objUrl;
    video.controls = true;
    video.playsInline = true;

    addOutputItem({
      title: "HunyuanVideo 输出 / Output",
      meta: `task_id=${taskId} • file_url=${fileUrl}`,
      element: video,
      rawJson: raw,
      download: { href: blobInfo.objUrl, filename: `hunyuan-video-${nowTs()}.mp4` },
      openUrl: openAfter ? fileUrl : null,
    });

    setStatus("HunyuanVideo 成功 / Success", "ok");
  } else if (textRes) {
    addOutputItem({
      title: "HunyuanVideo 文本输出 / Text output",
      meta: `task_id=${taskId}`,
      rawJson: raw,
    });
    setStatus("HunyuanVideo 成功 / Success", "ok");
  } else {
    addOutputItem({
      title: "HunyuanVideo 成功但无输出 / Success but no output",
      meta: `task_id=${taskId}`,
      rawJson: raw,
    });
    setStatus("HunyuanVideo 成功 / Success", "ok");
  }
}

// -------- z-image --------
async function runZImage() {
  const apiKey = getApiKey();
  rememberKeyMaybe();

  const prompt = $("zPrompt").value.trim();
  if (!prompt) throw new Error("请输入提示词 / Please input prompt");

  const n = clampInt($("zN").value, 1, 4, 1);
  const [w, h] = Z_RESOLUTIONS[$("zRes").value];
  const size = `${w}x${h}`;

  setStatus("z-image 生成中... / Generating...");
  const payload = { prompt, model: "z-image-turbo", n, size };

  const res = await apiFetch("images/generations", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const j = await readJsonSafely(res);
  if (!res.ok) {
    setStatus("z-image 失败 / Failed", "err");
    addOutputItem({ title: "z-image 生成失败 / Failed", rawJson: j, meta: `HTTP ${res.status}` });
    throw new Error(`API 错误 / API Error (${res.status})`);
  }

  // Expect OpenAI-like: { data: [ { url | b64_json } ] }
  const data = Array.isArray(j.data) ? j.data : [];
  if (!data.length) {
    addOutputItem({ title: "z-image 返回无数据 / Empty response", rawJson: j });
    setStatus("z-image 失败 / Failed", "err");
    return;
  }

  for (let i = 0; i < data.length; i++) {
    const item = data[i] || {};
    let blobInfo = null;

    if (item.url) {
      blobInfo = await fetchAsBlob(item.url, "image");
    } else if (item.b64_json) {
      const byteChars = atob(item.b64_json);
      const bytes = new Uint8Array(byteChars.length);
      for (let k = 0; k < byteChars.length; k++) bytes[k] = byteChars.charCodeAt(k);
      const blob = new Blob([bytes], { type: "image/png" });
      blobInfo = { blob, objUrl: URL.createObjectURL(blob) };
    } else {
      addOutputItem({ title: `z-image 第${i+1}张无数据 / No image data`, rawJson: item });
      continue;
    }

    const img = document.createElement("img");
    img.src = blobInfo.objUrl;

    const filename = `z-image-${nowTs()}-${i+1}.png`;
    addOutputItem({
      title: `z-image 输出 #${i+1}`,
      meta: `size=${size}, n=${n}`,
      element: img,
      download: { href: blobInfo.objUrl, filename },
    });
  }

  setStatus("z-image 成功 / Success", "ok");
}

// -------- Edit-2511 --------
async function runEdit() {
  const apiKey = getApiKey();
  rememberKeyMaybe();

  const f1 = $("editImg1").files?.[0];
  const f2 = $("editImg2").files?.[0];
  const prompt = $("editPrompt").value.trim();
  if (!f1 || !f2 || !prompt) throw new Error("请上传2张图片并输入提示词 / Please provide 2 images and prompt");

  const taskTypes = Array.from(document.querySelectorAll("input[name='editTaskType']:checked")).map(x => x.value);
  if (!taskTypes.length) throw new Error("至少选择一个 task_types / Choose at least one task type");

  const steps = clampInt($("editSteps").value, 1, 50, 4);
  const guidance = clampFloat($("editGuidance").value, 0, 10, 1.0);

  const fd = new FormData();
  fd.append("prompt", prompt);
  fd.append("model", "Qwen-Image-Edit-2511");
  fd.append("num_inference_steps", String(steps));
  fd.append("guidance_scale", String(guidance));
  for (const t of taskTypes) fd.append("task_types", t);
  fd.append("image", f1, f1.name);
  fd.append("image", f2, f2.name);

  setStatus("Edit-2511 创建任务中... / Creating task...");
  const res = await apiFetch("async/images/edits", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}` },
    body: fd,
  });

  const j = await readJsonSafely(res);
  if (!res.ok || !j.task_id) {
    setStatus("Edit-2511 创建失败 / Create failed", "err");
    addOutputItem({
      title: "Edit-2511 创建任务失败 / Create failed",
      meta: `HTTP ${res.status}`,
      rawJson: j,
    });
    throw new Error("创建任务失败 / Create failed");
  }

  const taskId = j.task_id;
  setStatus(`Edit-2511 轮询中... / Polling... (${taskId.slice(0,8)})`);

  const result = await pollTask(taskId, apiKey, {
    intervalMs: 6000,
    onTick: () => setStatus(`Edit-2511 轮询中... / Polling... (${taskId.slice(0,8)})`),
  });

  addOutputItem({ title: `Edit-2511 任务结果 task=${taskId.slice(0,8)}`, rawJson: result.raw });

  if (result.status !== "success") {
    setStatus("Edit-2511 失败 / Failed", "err");
    throw new Error(`任务失败 / Task failed: ${result.status}`);
  }

  const fileUrl = result.raw?.output?.file_url;
  if (!fileUrl) throw new Error("success 但没有 file_url / no file_url");

  setStatus("Edit-2511 下载中... / Downloading...");
  const { objUrl } = await fetchAsBlob(fileUrl, "image");

  const img = document.createElement("img");
  img.src = objUrl;

  addOutputItem({
    title: "Edit-2511 输出图片",
    meta: `task_id=${taskId}`,
    element: img,
    download: { href: objUrl, filename: `edit-2511-${nowTs()}.png` },
    openUrl: $("editOpenUrl").checked ? fileUrl : null,
  });

  setStatus("Edit-2511 成功 / Success", "ok");
}

// -------- Wan2.2 I2V --------
function applyWanResolution() {
  const key = $("wanResPreset").value;
  const [w, h] = WAN_RES_PRESETS[key];
  $("wanW").value = String(w);
  $("wanH").value = String(h);
}

function applyWanPreset() {
  const p = $("wanPreset").value;
  let steps = 30;
  let guidance = 5.0;
  let fps = 24;

  if (p.includes("更清晰")) { steps = 60; guidance = 6.0; }
  else if (p.includes("更动感")) { steps = 40; guidance = 5.0; fps = 30; }
  else if (p.includes("更快")) { steps = 20; guidance = 4.0; }

  $("wanSteps").value = String(steps);
  $("wanGuidance").value = String(guidance);
  $("wanFps").value = String(fps);

  if ($("wanAutoFrames").checked) {
    $("wanFrames").value = String(Math.max(1, Math.min(300, fps * 5)));
  }
}

function buildWanFormData({
  imageFile, prompt, model, numInferenceSteps, numFrames, guidanceScale,
  width, height, negativePrompt, seed, watermark, promptExtend, useTypoField=false
}) {
  const fd = new FormData();
  fd.append("prompt", prompt);
  fd.append("model", model);
  fd.append("num_frames", String(numFrames));
  fd.append("guidance_scale", String(guidanceScale));
  fd.append("height", String(height));
  fd.append("width", String(width));
  if (negativePrompt?.trim()) fd.append("negative_prompt", negativePrompt.trim());
  if (seed !== null && seed !== undefined) fd.append("seed", String(seed));
  if (watermark !== null && watermark !== undefined) fd.append("watermark", watermark ? "true" : "false");
  if (promptExtend !== null && promptExtend !== undefined) fd.append("prompt_extend", promptExtend ? "true" : "false");
  fd.append(useTypoField ? "num_inferenece_steps" : "num_inference_steps", String(numInferenceSteps));
  fd.append("image", imageFile, imageFile.name);
  return fd;
}

async function createWanTask(apiKey, params) {
  // Try correct field name first
  let fd = buildWanFormData({ ...params, useTypoField:false });
  let res = await apiFetch("async/videos/image-to-video", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}` },
    body: fd,
  });
  let j = await readJsonSafely(res);
  if (res.ok && j.task_id) return { ok:true, res, json:j, tried:"num_inference_steps" };

  // Fallback to typo
  fd = buildWanFormData({ ...params, useTypoField:true });
  res = await apiFetch("async/videos/image-to-video", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}` },
    body: fd,
  });
  const j2 = await readJsonSafely(res);
  if (res.ok && j2.task_id) return { ok:true, res, json:j2, tried:"num_inferenece_steps" };

  return { ok:false, res, json:{ _try1: j, _try2: j2 }, tried:"both" };
}

// Optional: zip segments via JSZip loaded dynamically when needed
async function ensureJsZip() {
  if (window.JSZip) return window.JSZip;
  const script = document.createElement("script");
  script.src = "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js";
  script.crossOrigin = "anonymous";
  document.head.appendChild(script);
  await new Promise((resolve, reject) => {
    script.onload = resolve;
    script.onerror = () => reject(new Error("加载 JSZip 失败 / Failed to load JSZip"));
  });
  return window.JSZip;
}

async function zipAndDownloadMp4s(files, zipName) {
  const JSZip = await ensureJsZip();
  const zip = new JSZip();
  for (const f of files) {
    zip.file(f.name, f.blob);
  }
  const blob = await zip.generateAsync({ type: "blob" });
  downloadBlob(blob, zipName);
}

async function runWan() {
  const apiKey = getApiKey();
  rememberKeyMaybe();

  const img = $("wanImg").files?.[0];
  if (!img) throw new Error("请选择有效图片 / Please select a valid image");

  const prompt = $("wanPrompt").value.trim();
  if (!prompt) throw new Error("请输入提示词 / Please input prompt");

  const neg = $("wanNeg").value.trim();

  const width = clampInt($("wanW").value, 64, 2048, 832);
  const height = clampInt($("wanH").value, 64, 2048, 480);
  const steps = clampInt($("wanSteps").value, 1, 100, 30);
  const guidance = clampFloat($("wanGuidance").value, 0, 20, 5.0);

  const fps = clampInt($("wanFps").value, 1, 60, 24);
  const duration = clampFloat($("wanDuration").value, 0.5, 60, 5.0);

  let numFrames;
  if ($("wanAutoFrames").checked) {
    numFrames = Math.max(1, Math.min(300, fps * 5));
    $("wanFrames").value = String(numFrames);
  } else {
    numFrames = clampInt($("wanFrames").value, 1, 300, 30);
  }

  const seedVal = clampInt($("wanSeed").value, -1, 2147483647, -1);
  const seed = seedVal < 0 ? null : seedVal;

  const watermark = $("wanWatermark").checked;
  const promptExtend = $("wanPromptExtend").checked;

  // segment logic (same spirit as desktop): assume backend returns 5s per segment
  const segmentLen = 5.0;
  const segCount = Math.max(1, Math.ceil(duration / segmentLen));

  const segments = []; // {name, blob, objUrl, fileUrl, taskId}

  for (let i = 0; i < segCount; i++) {
    setStatus(`Wan2.2 分段 ${i+1}/${segCount} 创建中... / Segment ${i+1}/${segCount} creating...`);

    const create = await createWanTask(apiKey, {
      imageFile: img,
      prompt,
      model: "Wan2_2-I2V-A14B",
      numInferenceSteps: steps,
      numFrames,
      guidanceScale: guidance,
      width,
      height,
      negativePrompt: neg,
      seed,
      watermark,
      promptExtend,
    });

    if (!create.ok) {
      setStatus("Wan2.2 创建失败 / Create failed", "err");
      addOutputItem({
        title: `Wan2.2 创建任务失败（分段 ${i+1}）`,
        meta: `tried=${create.tried}, HTTP ${create.res.status}`,
        rawJson: create.json,
      });
      throw new Error("创建任务失败 / Create failed");
    }

    const taskId = create.json.task_id;
    setStatus(`Wan2.2 分段 ${i+1}/${segCount} 轮询中... / Polling... (${taskId.slice(0,8)})`);

    const result = await pollTask(taskId, apiKey, {
      timeoutMs: 60*60*1000,
      intervalMs: 8000,
      onTick: () => setStatus(`Wan2.2 分段 ${i+1}/${segCount} 轮询中... / Polling... (${taskId.slice(0,8)})`),
    });

    addOutputItem({ title: `Wan2.2 分段 ${i+1} 任务结果`, rawJson: result.raw, meta: `task_id=${taskId}` });

    if (result.status !== "success") {
      setStatus("Wan2.2 失败 / Failed", "err");
      throw new Error(`任务失败 / Task failed: ${result.status}`);
    }

    const fileUrl = result.raw?.output?.file_url;
    if (!fileUrl) throw new Error("success 但没有 file_url / no file_url");

    setStatus(`Wan2.2 分段 ${i+1}/${segCount} 下载中... / Downloading...`);
    const dl = await fetchAsBlob(fileUrl, "video");
    const name = `wan_seg${i+1}_${nowTs()}.mp4`;

    segments.push({ name, blob: dl.blob, objUrl: dl.objUrl, fileUrl, taskId });

    // Show each segment playable + download
    const video = document.createElement("video");
    video.controls = true;
    video.src = dl.objUrl;

    addOutputItem({
      title: `Wan2.2 输出视频（分段 ${i+1}/${segCount}）`,
      meta: `width=${width}, height=${height}, frames=${numFrames}, steps=${steps}, guidance=${guidance}`,
      element: video,
      download: { href: dl.objUrl, filename: name },
      openUrl: $("wanOpenUrl").checked ? fileUrl : null,
    });
  }

  // Optional zip download
  if (segCount > 1 && $("wanZipSegments").checked) {
    try {
      setStatus("Wan2.2 打包 zip 中... / Zipping...");
      await zipAndDownloadMp4s(segments, `wan_segments_${nowTs()}.zip`);
      setStatus("Wan2.2 成功 / Success", "ok");
    } catch (e) {
      addOutputItem({ title: "Wan2.2 zip 打包失败 / Zip failed", meta: String(e) });
      setStatus("Wan2.2 成功（但 zip 失败）/ Success (zip failed)", "ok");
    }
  } else {
    setStatus("Wan2.2 成功 / Success", "ok");
  }
}

// ---- init UI ----
function initUi() {
  // fill selects
  const zRes = $("zRes");
  for (const k of Object.keys(Z_RESOLUTIONS)) {
    const o = document.createElement("option");
    o.value = k; o.textContent = k;
    zRes.appendChild(o);
  }
  zRes.value = Object.keys(Z_RESOLUTIONS)[0];

  const wanRes = $("wanResPreset");
  for (const k of Object.keys(WAN_RES_PRESETS)) {
    const o = document.createElement("option");
    o.value = k; o.textContent = k;
    wanRes.appendChild(o);
  }
  wanRes.value = Object.keys(WAN_RES_PRESETS)[0];
  applyWanResolution();

  // task type checkboxes
  const box = $("editTaskTypes");
  for (const t of EDIT_TASK_TYPES) {
    const label = document.createElement("label");
    label.className = "chk";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.name = "editTaskType";
    input.value = t;
    input.checked = (t === "id" || t === "style");
    label.appendChild(input);
    label.appendChild(document.createTextNode(" " + t));
    box.appendChild(label);
  }

  // model selection
  $("modelSel").addEventListener("change", (e) => showPanel(e.target.value));
  showPanel($("modelSel").value);

  // buttons
  $("btnZRun").onclick = async () => {
    try { await runZImage(); }
    catch (e) { addOutputItem({ title:"z-image 错误 / Error", meta:String(e) }); }
  };
  $("btnEditRun").onclick = async () => {
    try { await runEdit(); }
    catch (e) { addOutputItem({ title:"Edit-2511 错误 / Error", meta:String(e) }); }
  };
  $("btnWanRun").onclick = async () => {
    try { await runWan(); }
    catch (e) { addOutputItem({ title:"Wan2.2 错误 / Error", meta:String(e) }); }
  };

  $("btnHyRun").onclick = async () => {
    try { await runHunyuanVideo(); }
    catch (e) { addOutputItem({ title:"HunyuanVideo 错误 / Error", meta:String(e) }); }
  };


  $("btnClearOutput").onclick = clearOutput;

  $("btnWanApplyPreset").onclick = applyWanPreset;
  $("wanResPreset").addEventListener("change", applyWanResolution);
  $("wanAutoFrames").addEventListener("change", () => {
    if ($("wanAutoFrames").checked) {
      const fps = clampInt($("wanFps").value, 1, 60, 24);
      $("wanFrames").value = String(Math.max(1, Math.min(300, fps * 5)));
    }
  });
  $("wanFps").addEventListener("change", () => {
    if ($("wanAutoFrames").checked) {
      const fps = clampInt($("wanFps").value, 1, 60, 24);
      $("wanFrames").value = String(Math.max(1, Math.min(300, fps * 5)));
    }
  });

  $("btnClearKey").onclick = clearRememberedKey;

  loadRememberedKey();
}

window.addEventListener("DOMContentLoaded", () => {
  initUi();
  setStatus("准备就绪 / Ready");
});
