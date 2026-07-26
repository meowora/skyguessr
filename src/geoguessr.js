import { Viewer } from "@photo-sphere-viewer/core";
import { CubemapAdapter } from "@photo-sphere-viewer/cubemap-adapter";

function cubemap(folder) {
  return {
    type: "separate",
    paths: {
      left: `assets/screenshots/${folder}/panorama_3.png`,
      front: `assets/screenshots/${folder}/panorama_0.png`,
      right: `assets/screenshots/${folder}/panorama_1.png`,
      back: `assets/screenshots/${folder}/panorama_2.png`,
      top: `assets/screenshots/${folder}/panorama_4.png`,
      bottom: `assets/screenshots/${folder}/panorama_5.png`,
    },
    flipTopBottom: true,
  };
}

const LOCATIONS = [
  { folder: "scene1", x: -53, z: 67, hint: "Scene 1" },
  { folder: "scene2", x: -703, z: -8, hint: "Scene 2" },
  { folder: "scene3", x: -303, z: -250, hint: "Scene 3" },
  { folder: "3b63f23c-e87a-4e9d-ab7f-5f0f611c2f1b", x: -24, z: -602, hint: "Scene 4" },
  { folder: "scene5", x: 209, z: -260, hint: "Scene 5" },
  { folder: "scene6", x: -79, z: -20, hint: "Scene 6" },
  { folder: "scene7", x: -351, z: -168, hint: "Scene 7" },
  { folder: "0c3841d6-1a36-44cb-bff3-d705b5ac1446", x: -231, z: -200, hint: "Scene 8" },
  { folder: "scene9", x: 253, z: -475, hint: "Scene 9" },
  { folder: "0ac1c0df-cf5c-444b-b98a-52125a6d01d9", x: -6, z: -794, hint: "meow" },
  { folder: "25c9294c-055f-4a50-a208-020231eaecaa", x: -683, z: 81, hint: "meow" },
  { folder: "485fd19c-e005-464d-a2d4-beccfb4747bc", x: -49, z: -195, hint: "meow" },
  { folder: "884f1e7a-2b83-4770-a835-e7b7b336960a", x: 19, z: -582, hint: "meow" },
  { folder: "c47216eb-339b-4613-9375-39eebe20514d", x: -541, z: -890, hint: "meow" },
  { folder: "db9b4bbb-c0b0-4d0e-bb19-3473d38e20ae", x: 116, z: -36, hint: "meow" },
  { folder: "3e3fa9c1-1211-478a-b09a-e928b1748db6", x: -629, z: -88, hint: "meow" },
  { folder: "17543a72-b24c-492d-a116-3d0497f5c9b0", x: 60, z: 5, hint: "meow" },
  { folder: "429c8ffc-d51f-477a-9020-36cb29ba460b", x: -671, z: -276, hint: "meow" },
  { folder: "3b59ac06-394d-48f4-807c-5406a0fd0436", x: -586, z: -2, hint: "meow" },
  { folder: "cc9920d5-3333-4378-9454-fbded471d3a8", x: -81, z: -134, hint: "meow" },
];

const ROUNDS_PER_GAME = 10;

function pickRounds(count) {
  const pool = LOCATIONS.slice();

  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  const picked = pool.slice(0, Math.min(count, pool.length));
  // if (picked.length < count) {
  //   console.warn(`Only ${picked.length} locations available — add more to LOCATIONS for ${count} rounds per game.`);
  // }

  return picked.map((loc) => ({
    cubemap: cubemap(loc.folder),
    x: loc.x,
    z: loc.z,
    hint: loc.hint,
  }));
}

let ROUNDS = [];

const MAX_DISTANCE = 600;
const MAX_SCORE_EACH = 5000;
const EXTRA_ZOOM = 2;
const SCORE_EXPONENT = 2.2;

let currentRound = 0;
let totalScore = 0;
let guessCoords = null;
let resultVisible = false;
let roundScores = [];

let psViewer = null;

let unminedInstance = null;
let guessSource = null;
let lineSource = null;
let mapWidgetApi = null;

function preserveMapViewport() {
  if (!unminedInstance?.olMap) return;

  const view = unminedInstance.olMap.getView();
  const center = view.getCenter();
  const resolution = view.getResolution();
  const zoom = view.getZoom();

  unminedInstance.olMap.updateSize();

  requestAnimationFrame(() => {
    if (center && resolution) {
      view.setCenter(center);
      view.setResolution(resolution);
      if (Number.isFinite(zoom)) {
        view.setZoom(zoom);
      }
    }
  });
}

function refreshMapSize() {
  if (!unminedInstance?.olMap) return;
  unminedInstance.olMap.updateSize();
  preserveMapViewport();
}

function initMapWidget() {
  const widget = document.getElementById("map-widget");
  const expandBtn = document.getElementById("map-expand-btn");
  const collapseBtn = document.getElementById("map-collapse-btn");
  const header = document.getElementById("map-header");
  const mapBody = document.getElementById("map");
  const bottomBar = document.getElementById("bottombar");
  const gameUi = document.getElementById("game-ui");
  const splitter = document.getElementById("splitter");

  let isExpanded = false;
  let isCollapsed = false;
  let splitRatio = 50;
  let isDragging = false;

  function setSplitRatio(ratio) {
    const clamped = Math.min(70, Math.max(50, ratio));
    splitRatio = clamped;
    gameUi.style.setProperty("--split-ratio", `${clamped}%`);
  }

  function updateButtons() {
    expandBtn.textContent = isExpanded ? "⤡" : "⤢";
    expandBtn.title = isExpanded ? "Shrink map" : "Expand map";
    collapseBtn.textContent = isCollapsed ? "▲" : "▼";
    collapseBtn.title = isCollapsed ? "Show map" : "Hide map";
    gameUi.classList.toggle("map-expanded", isExpanded && !isCollapsed);
    gameUi.classList.toggle("map-collapsed", isCollapsed);

    if (isExpanded && !isCollapsed) {
      setSplitRatio(splitRatio);
    } else {
      gameUi.style.removeProperty("--split-ratio");
    }
  }

  function setExpanded(val) {
    isExpanded = val;
    widget.classList.toggle("expanded", isExpanded);
    updateButtons();
  }

  function setCollapsed(val) {
    isCollapsed = val;
    if (isCollapsed) {
      isExpanded = false;
      widget.classList.remove("expanded");
    }
    widget.classList.toggle("collapsed", isCollapsed);
    updateButtons();
  }

  expandBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (isCollapsed) setCollapsed(false);
    setExpanded(!isExpanded);
    setTimeout(refreshMapSize, 240);
  });

  collapseBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    setCollapsed(!isCollapsed);
    if (!isCollapsed) {
      setTimeout(refreshMapSize, 240);
    }
  });

  const setHoverExpanded = (isHovered) => {
    if (widget.classList.contains("expanded") && !widget.classList.contains("collapsed")) {
      widget.classList.add("map-hovered");
      return;
    }
    widget.classList.toggle("map-hovered", isHovered);
  };

  const handleHoverLeave = (event) => {
    const next = event.relatedTarget;
    if (next && widget.contains(next)) return;
    setHoverExpanded(false);
  };

  mapBody?.addEventListener("mouseenter", () => setHoverExpanded(true));
  mapBody?.addEventListener("mouseleave", handleHoverLeave);

  [header, bottomBar].filter(Boolean).forEach((target) => {
    target.addEventListener("mouseenter", () => {
      if (widget.classList.contains("map-hovered")) {
        setHoverExpanded(true);
      }
    });
    target.addEventListener("mouseleave", handleHoverLeave);
  });

  if (splitter) {
    splitter.addEventListener("pointerdown", (e) => {
      if (!gameUi.classList.contains("map-expanded")) return;
      e.preventDefault();
      isDragging = true;
      splitter.setPointerCapture?.(e.pointerId);
    });

    const stopDragging = () => {
      if (!isDragging) return;
      isDragging = false;
      setTimeout(refreshMapSize, 50);
    };

    document.addEventListener("pointermove", (e) => {
      if (!isDragging || !gameUi.classList.contains("map-expanded")) return;
      const rect = gameUi.getBoundingClientRect();
      const ratio = ((e.clientX - rect.left) / rect.width) * 100;
      setSplitRatio(ratio);
    });

    splitter.addEventListener("pointerup", stopDragging);
    splitter.addEventListener("pointercancel", stopDragging);
    document.addEventListener("pointerup", stopDragging);
  }

  header.addEventListener("click", (e) => {
    if (e.target === expandBtn || e.target === collapseBtn) return;
    collapseBtn.click();
  });

  mapWidgetApi = {
    expandForResult() {
      if (isCollapsed) setCollapsed(false);
      if (!isExpanded) setExpanded(true);
    },
    collapseForNextRound() {
      if (isExpanded) setExpanded(false);
    },
  };
}

function initMap() {
  const mapEl = document.getElementById("map");

  const patchedProps = Object.assign({}, UnminedMapProperties, {
    maxZoom: UnminedMapProperties.maxZoom + EXTRA_ZOOM,
    centerX: -180,
    centerZ: -450,
    markers: [],
    playerMarkers: [],
    showMarkers: false,
    showPlayers: false,
  });

  unminedInstance = new Unmined(mapEl, patchedProps, UnminedRegions);
  const olMap = unminedInstance.olMap;
  olMap.on("change:size", preserveMapViewport);
  window.addEventListener("resize", preserveMapViewport);

  mapEl.querySelectorAll("canvas").forEach((c) => (c.style.imageRendering = "pixelated"));
  const observer = new MutationObserver(() => {
    mapEl.querySelectorAll("canvas").forEach((c) => (c.style.imageRendering = "pixelated"));
  });
  observer.observe(mapEl, { childList: true, subtree: true });

  guessSource = new ol.source.Vector();
  const guessLayer = new ol.layer.Vector({
    source: guessSource,
    zIndex: 2000,
    style: () =>
      new ol.style.Style({
        image: new ol.style.RegularShape({
          fill: new ol.style.Fill({ color: "#c9b458" }),
          stroke: new ol.style.Stroke({ color: "#000", width: 2 }),
          points: 4,
          radius: 10,
          angle: Math.PI / 4,
        }),
        text: new ol.style.Text({
          text: "?",
          font: "bold 13px sans-serif",
          fill: new ol.style.Fill({ color: "#000" }),
          offsetY: 1,
        }),
      }),
  });
  olMap.addLayer(guessLayer);

  lineSource = new ol.source.Vector();
  const lineLayer = new ol.layer.Vector({ source: lineSource, zIndex: 1999 });
  olMap.addLayer(lineLayer);

  olMap.on("click", (evt) => {
    if (resultVisible) return;

    const raw = ol.proj.transform(evt.coordinate, unminedInstance.viewProjection, unminedInstance.dataProjection);

    guessCoords = [Math.floor(raw[0]) + 0.5, Math.floor(raw[1]) + 0.5];

    const snapped = ol.proj.transform(guessCoords, unminedInstance.dataProjection, unminedInstance.viewProjection);

    guessSource.clear();
    guessSource.addFeature(new ol.Feature({ geometry: new ol.geom.Point(snapped) }));

    document.getElementById("guess-coords").textContent = `X: ${Math.floor(guessCoords[0])},  Z: ${Math.floor(guessCoords[1])}`;
    document.getElementById("guess-coords").style.color = "var(--gold)";
    document.getElementById("guess-btn").disabled = false;
  });
}

function showPanoramaLoading() {
  const placeholder = document.getElementById("screenshot-placeholder");
  placeholder.style.display = "flex";
  placeholder.innerHTML = "<span>Loading panorama...</span>";
}

function hidePanoramaLoading() {
  document.getElementById("screenshot-placeholder").style.display = "none";
}

function showPanoramaError(round) {
  document.getElementById("screenshot-placeholder").innerHTML = `<span style="font-size:32px">📷</span>
     <span style="color:var(--yellow)">Screenshot not found:<br><code style="font-size:12px">${round.cubemap.paths.front}</code></span>`;
}

function loadPanorama(round) {
  showPanoramaLoading();

  if (!psViewer) {
    psViewer = new Viewer({
      container: document.getElementById("psv-viewer"),
      adapter: CubemapAdapter,
      panorama: round.cubemap,
      navbar: ["zoom"],
      mousewheel: true,
      defaultZoomLvl: 0,
      minZoomLvl: 0,
    });
    psViewer.addEventListener("ready", hidePanoramaLoading, { once: true });
    psViewer.addEventListener("panorama-error", () => showPanoramaError(round), { once: true });
  } else {
    psViewer
      .setPanorama(round.cubemap, { transition: false })
      .then(hidePanoramaLoading)
      .catch(() => showPanoramaError(round));
  }
}

function startRound(idx) {
  const round = ROUNDS[idx];
  resultVisible = false;
  guessCoords = null;

  guessSource?.clear();
  lineSource?.clear();

  document.getElementById("guess-coords").textContent = "";
  document.getElementById("guess-coords").style.color = "var(--text-bright)";
  document.getElementById("guess-btn").textContent = "Confirm Guess";
  document.getElementById("guess-btn").disabled = true;
  document.getElementById("map-label").textContent = "Click map to guess";
  document.getElementById("round-val").textContent = `${idx + 1} / ${ROUNDS.length}`;
  document.getElementById("score-val").textContent = totalScore.toLocaleString();

  loadPanorama(round);

  document.getElementById("screenshot-label").textContent = round.hint ? `Round ${idx + 1} - ${round.hint}` : `Round ${idx + 1}`;
}

function submitGuess() {
  if (!guessCoords || resultVisible) return;

  document.getElementById("guess-btn").disabled = true;

  const round = ROUNDS[currentRound];
  const dx = guessCoords[0] - 0.5 - round.x;
  const dz = guessCoords[1] - 0.5 - round.z;
  const dist = Math.round(Math.sqrt(dx * dx + dz * dz));
  const normalized = Math.min(1, dist / MAX_DISTANCE);
  const pts = Math.max(0, Math.round(MAX_SCORE_EACH * Math.pow(1 - normalized, SCORE_EXPONENT)));

  totalScore += pts;
  roundScores.push(pts);

  mapWidgetApi?.expandForResult();
  setTimeout(() => {
    unminedInstance?.olMap.updateSize();
    drawResult(round.x, round.z);
  }, 260);

  showResult(dist, pts, round);
}

function drawResult(actualX, actualZ) {
  lineSource.clear();

  const vp = unminedInstance.viewProjection;
  const dp = unminedInstance.dataProjection;

  const guessPt = ol.proj.transform(guessCoords, dp, vp);
  const actualPt = ol.proj.transform([actualX + 0.5, actualZ + 0.5], dp, vp);

  const line = new ol.Feature({ geometry: new ol.geom.LineString([guessPt, actualPt]) });
  line.setStyle(
    new ol.style.Style({
      stroke: new ol.style.Stroke({ color: "#ffaa00", width: 2, lineDash: [6, 4] }),
    }),
  );
  lineSource.addFeature(line);

  const actualFeature = new ol.Feature({ geometry: new ol.geom.Point(actualPt) });
  actualFeature.setStyle(
    new ol.style.Style({
      image: new ol.style.Circle({
        radius: 10,
        fill: new ol.style.Fill({ color: "#6aaa64" }),
        stroke: new ol.style.Stroke({ color: "#000", width: 2 }),
      }),
      text: new ol.style.Text({
        text: "✓",
        font: "bold 13px sans-serif",
        fill: new ol.style.Fill({ color: "#000" }),
        offsetY: 1,
      }),
    }),
  );
  lineSource.addFeature(actualFeature);

  const extent = ol.extent.boundingExtent([guessPt, actualPt]);
  ol.extent.buffer(extent, 500, extent);
  unminedInstance.olMap.getView().fit(extent, { duration: 600, padding: [40, 40, 40, 40] });
}

function showResult(dist, pts, round) {
  resultVisible = true;

  const titleEl = document.getElementById("result-title");
  const ptsEl = document.getElementById("result-points");

  if (dist < 50) {
    titleEl.textContent = "Bullseye!";
    titleEl.style.color = "#6aaa64";
  } else if (dist < 200) {
    titleEl.textContent = "Very Close!";
    titleEl.style.color = "#6aaa64";
  } else if (dist < 600) {
    titleEl.textContent = "Getting Warmer…";
    titleEl.style.color = "#c9b458";
  } else if (dist < 1200) {
    titleEl.textContent = "Pretty Far Away";
    titleEl.style.color = "#d6414d";
  } else {
    titleEl.textContent = "Way Off!";
    titleEl.style.color = "#d6414d";
  }

  ptsEl.textContent = `+${pts.toLocaleString()}`;
  ptsEl.style.color = pts > MAX_SCORE_EACH * 0.7 ? "#6aaa64" : pts > MAX_SCORE_EACH * 0.3 ? "#c9b458" : "#d6414d";

  document.getElementById("result-distance").innerHTML = `Distance: <strong>${dist.toLocaleString()} blocks</strong>`;
  document.getElementById("res-guess").textContent = `X: ${Math.floor(guessCoords[0])},  Z: ${Math.floor(guessCoords[1])}`;
  document.getElementById("res-actual").textContent = `X: ${round.x},  Z: ${round.z}`;
  document.getElementById("score-val").textContent = totalScore.toLocaleString();

  const isLast = currentRound === ROUNDS.length - 1;
  document.getElementById("next-btn").textContent = isLast ? "See Results" : "Next Round";

  const guessBtn = document.getElementById("guess-btn");
  guessBtn.textContent = isLast ? "See Results" : "Continue";
  guessBtn.disabled = false;

  document.getElementById("result-overlay").classList.add("visible");
}

function hideResult() {
  document.getElementById("result-overlay").classList.remove("visible");
}

function nextRound() {
  hideResult();
  mapWidgetApi?.collapseForNextRound();
  currentRound++;
  if (currentRound >= ROUNDS.length) {
    showEndScreen();
  } else {
    startRound(currentRound);
  }
}

function showEndScreen() {
  const breakdown = roundScores
    .map((s, i) => `Round ${i + 1}: <span style="color:${s > MAX_SCORE_EACH * 0.6 ? "#6aaa64" : "#c9b458"}">${s.toLocaleString()} pts</span>`)
    .join(" &nbsp;|&nbsp; ");

  document.getElementById("final-score-display").textContent = totalScore.toLocaleString();
  document.getElementById("final-breakdown").innerHTML = breakdown;
  document.getElementById("end-screen").classList.remove("hidden");
  document.getElementById("game-ui").classList.add("hidden");
}

function restartGame() {
  currentRound = 0;
  totalScore = 0;
  roundScores = [];
  ROUNDS = pickRounds(ROUNDS_PER_GAME);
  document.getElementById("end-screen").classList.add("hidden");
  document.getElementById("game-ui").classList.remove("hidden");
  startRound(0);
}

document.getElementById("start-btn").addEventListener("click", () => {
  document.getElementById("start-screen").classList.add("hidden");
  document.getElementById("game-ui").classList.remove("hidden");
  ROUNDS = pickRounds(ROUNDS_PER_GAME);
  initMap();
  initMapWidget();
  startRound(0);
});

document.getElementById("guess-btn").addEventListener("click", () => {
  if (resultVisible) {
    nextRound();
  } else {
    submitGuess();
  }
});
document.getElementById("next-btn").addEventListener("click", nextRound);
document.getElementById("view-map-btn").addEventListener("click", hideResult);
document.getElementById("play-again-btn").addEventListener("click", restartGame);
