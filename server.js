const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { nanoid } = require("nanoid");
const fs = require("fs");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

/* ===== Questions (из questions.json) ===== */
const QUESTIONS_PATH = path.join(__dirname, "questions.json");

function loadQuestions() {
  try {
    const raw = fs.readFileSync(QUESTIONS_PATH, "utf-8");
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) throw new Error("questions.json должен быть массивом");
    return data;
  } catch (e) {
    console.error("Не удалось загрузить questions.json:", e.message);
    return [];
  }
}

let QUESTIONS = loadQuestions();

if (QUESTIONS.length < 10) {
  console.warn("В questions.json мало вопросов (нужно хотя бы 10). Сейчас:", QUESTIONS.length);
}

const rooms = new Map();

function normalize(text) {
  return (text || "").toLowerCase().trim().replace(/ё/g, "е");
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function clampInt(v, min, max, def) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function buildDeck(limit) {
  // перечитаем вопросы при построении новой колоды (чтобы обновления файла подхватывались после рестарта/правки)
  // Если хочешь подхватывать изменения без перезапуска — можно оставить так, оно будет читать файл каждый раз.
  const fresh = loadQuestions();
  if (fresh.length >= 10) QUESTIONS = fresh;

  const lim = clampInt(limit, 10, 20, 10);
  if (!QUESTIONS.length) return [];
  return shuffle(QUESTIONS).slice(0, lim);
}

/*
  mode:
    - host   (есть ведущий, вручную next/results/finish)
    - solo   (без ведущего, 1 игрок, авто-переходы)
    - auto2  (без ведущего, 2+ игроков, старт при >=2, авто-переходы)
*/
function createRoom({ hostSocketId = null, mode = "host", questionCount = 10, questionDuration = 60 } = {}) {
  const m = ["host", "solo", "auto2"].includes(mode) ? mode : "host";
  const qc = clampInt(questionCount, 10, 20, 10);
  const dur = clampInt(questionDuration, 10, 300, 60);

  const minPlayersToStart = m === "auto2" ? 2 : 1;
  const autoAdvance = m === "solo" || m === "auto2";

  return {
    code: nanoid(6).toUpperCase(),
    hostSocketId,
    mode: m,

    phase: "lobby", // lobby | question | results | finished
    currentIndex: -1,

    players: new Map(),      // socketId -> {name, score}
    submissions: new Map(),  // socketId -> {text, points}

    timer: null,
    timeLeft: 0,
    questionDuration: dur,

    deck: buildDeck(qc),

    autoAdvance,
    minPlayersToStart,

    autoTimer: null,
    autoToken: 0,
  };
}

function stopTimer(room) {
  if (room.timer) clearInterval(room.timer);
  room.timer = null;
}

function stopAuto(room) {
  room.autoToken++;
  if (room.autoTimer) clearTimeout(room.autoTimer);
  room.autoTimer = null;
}

function startTimer(room) {
  stopTimer(room);
  room.timeLeft = room.questionDuration;

  room.timer = setInterval(() => {
    room.timeLeft--;
    if (room.timeLeft <= 0) {
      stopTimer(room);
      room.timeLeft = 0;
      if (room.phase === "question") {
        room.phase = "results";
        emitUpdates(room);
        maybeScheduleAutoNext(room);
      } else {
        emitUpdates(room);
      }
      return;
    }
    emitUpdates(room);
  }, 1000);
}

function getQuestion(room) {
  if (room.currentIndex < 0 || room.currentIndex >= room.deck.length) return null;
  return room.deck[room.currentIndex];
}

function allAnswered(room) {
  const playerCount = room.players.size;
  if (playerCount === 0) return false;
  return room.submissions.size >= playerCount;
}

function getPublicState(room) {
  const qObj = getQuestion(room);

  const submissions = [];
  for (const [sid, sub] of room.submissions.entries()) {
    const p = room.players.get(sid);
    if (!p) continue;
    submissions.push({ name: p.name, text: sub.text, points: sub.points });
  }
  submissions.sort((a, b) => (b.points - a.points) || a.name.localeCompare(b.name, "ru"));

  const players = Array.from(room.players.values()).sort(
    (a, b) => (b.score - a.score) || a.name.localeCompare(b.name, "ru")
  );

  return {
    code: room.code,
    mode: room.mode,
    phase: room.phase,
    questionNumber: room.currentIndex + 1,
    totalQuestions: room.deck.length,
    question: qObj ? qObj.q : "—",

    players,
    submissions,

    answeredCount: room.submissions.size,
    playerCount: room.players.size,

    timeLeft: room.timeLeft,
    questionDuration: room.questionDuration,
    minPlayersToStart: room.minPlayersToStart,
  };
}

function getHostState(room) {
  const base = getPublicState(room);
  const qObj = getQuestion(room);
  const key = qObj ? qObj.a.slice().sort((a, b) => a.points - b.points) : [];
  return { ...base, key };
}

function emitUpdates(room) {
  io.to(room.code).emit("room:update", getPublicState(room));
  if (room.hostSocketId) io.to(room.hostSocketId).emit("host:update", getHostState(room));
}

function startNextQuestion(room) {
  stopAuto(room);
  stopTimer(room);

  room.currentIndex++;

  if (room.currentIndex >= room.deck.length) {
    room.currentIndex = room.deck.length - 1;
    room.phase = "finished";
    room.timeLeft = 0;
    emitUpdates(room);
    return;
  }

  room.phase = "question";
  room.submissions.clear();
  startTimer(room);
  emitUpdates(room);
}

function maybeStartAutoGame(room) {
  if (!room.autoAdvance) return;
  if (room.phase !== "lobby") return;
  if (room.players.size < room.minPlayersToStart) return;

  startNextQuestion(room);
}

const AUTO_RESULTS_DELAY_MS = 3000;

function maybeScheduleAutoNext(room) {
  if (!room.autoAdvance) return;
  if (room.phase !== "results") return;

  const token = ++room.autoToken;
  room.autoTimer = setTimeout(() => {
    if (token !== room.autoToken) return;

    const isLast = (room.currentIndex + 1) >= room.deck.length;
    if (isLast) {
      room.phase = "finished";
      room.timeLeft = 0;
      emitUpdates(room);
      return;
    }
    startNextQuestion(room);
  }, AUTO_RESULTS_DELAY_MS);
}

/* ===== Socket ===== */
io.on("connection", (socket) => {
  /* Host mode */
  socket.on("host:create", () => {
    const room = createRoom({ hostSocketId: socket.id, mode: "host", questionCount: 10, questionDuration: 60 });
    rooms.set(room.code, room);
    socket.join(room.code);
    socket.emit("host:created", { code: room.code });
    emitUpdates(room);
  });

  /* Auto create (solo / auto2) */
  socket.on("auto:create", ({ mode, name, seconds, count }) => {
    const m = mode === "auto2" ? "auto2" : "solo";
    const room = createRoom({
      hostSocketId: null,
      mode: m,
      questionCount: count,
      questionDuration: seconds,
    });

    rooms.set(room.code, room);

    const safeName = (name || "Игрок").trim().slice(0, 24) || "Игрок";
    room.players.set(socket.id, { name: safeName, score: 0 });
    socket.join(room.code);

    socket.emit("auto:created", {
      code: room.code,
      mode: room.mode,
    });

    emitUpdates(room);
    maybeStartAutoGame(room);
  });

  /* Player join into existing room */
  socket.on("player:join", ({ code, name }) => {
    const room = rooms.get((code || "").toUpperCase());
    if (!room) return socket.emit("error:msg", "Комната не найдена");

    const safeName = (name || "Игрок").trim().slice(0, 24) || "Игрок";
    room.players.set(socket.id, { name: safeName, score: 0 });
    socket.join(room.code);

    emitUpdates(room);
    maybeStartAutoGame(room);
  });

  socket.on("host:set_time", ({ code, seconds }) => {
    const room = rooms.get((code || "").toUpperCase());
    if (!room || room.hostSocketId !== socket.id) return;

    room.questionDuration = clampInt(seconds, 10, 300, room.questionDuration);

    if (room.phase === "question") room.timeLeft = Math.min(room.timeLeft, room.questionDuration);
    emitUpdates(room);
  });

  socket.on("host:set_qcount", ({ code, count }) => {
    const room = rooms.get((code || "").toUpperCase());
    if (!room || room.hostSocketId !== socket.id) return;
    if (room.phase !== "lobby") return;

    const c = clampInt(count, 10, 20, 10);
    room.deck = buildDeck(c);
    room.currentIndex = -1;
    room.submissions.clear();
    room.timeLeft = 0;
    emitUpdates(room);
  });

  socket.on("host:next", ({ code }) => {
    const room = rooms.get((code || "").toUpperCase());
    if (!room || room.hostSocketId !== socket.id) return;
    if (!(room.phase === "lobby" || room.phase === "results")) return;

    stopAuto(room);
    stopTimer(room);

    room.currentIndex++;
    if (room.currentIndex >= room.deck.length) {
      room.currentIndex = room.deck.length - 1;
      room.phase = "results";
      room.timeLeft = 0;
      emitUpdates(room);
      return;
    }

    room.phase = "question";
    room.submissions.clear();
    startTimer(room);
    emitUpdates(room);
  });

  socket.on("host:show_results", ({ code }) => {
    const room = rooms.get((code || "").toUpperCase());
    if (!room || room.hostSocketId !== socket.id) return;
    if (room.phase !== "question") return;

    stopTimer(room);
    room.timeLeft = 0;
    room.phase = "results";
    emitUpdates(room);
  });

  socket.on("host:finish", ({ code }) => {
    const room = rooms.get((code || "").toUpperCase());
    if (!room || room.hostSocketId !== socket.id) return;

    stopAuto(room);
    stopTimer(room);
    room.timeLeft = 0;
    room.phase = "finished";
    emitUpdates(room);
  });

  socket.on("host:reset", ({ code }) => {
    const room = rooms.get((code || "").toUpperCase());
    if (!room || room.hostSocketId !== socket.id) return;

    stopAuto(room);
    stopTimer(room);

    room.timeLeft = 0;
    room.currentIndex = -1;
    room.phase = "lobby";
    room.submissions.clear();
    for (const p of room.players.values()) p.score = 0;

    emitUpdates(room);
  });

  socket.on("player:answer", ({ code, text }) => {
    const room = rooms.get((code || "").toUpperCase());
    if (!room || room.phase !== "question") return;
    if (room.submissions.has(socket.id)) return;

    const qObj = getQuestion(room);
    if (!qObj) return;

    const answerNorm = normalize(text);
    let points = 0;
    for (const a of qObj.a) {
      if (normalize(a.text) === answerNorm) { points = a.points; break; }
    }

    const player = room.players.get(socket.id);
    if (!player) return;

    player.score += points;
    room.submissions.set(socket.id, { text: (text || "").trim().slice(0, 60), points });

    if (allAnswered(room)) {
      stopTimer(room);
      room.timeLeft = 0;
      room.phase = "results";
      emitUpdates(room);
      maybeScheduleAutoNext(room);
      return;
    }

    emitUpdates(room);
  });

  socket.on("disconnect", () => {
    for (const room of rooms.values()) {
      if (room.hostSocketId === socket.id) room.hostSocketId = null;

      const removed = room.players.delete(socket.id);
      if (removed) {
        room.submissions.delete(socket.id);

        if (room.phase === "question" && allAnswered(room)) {
          stopTimer(room);
          room.timeLeft = 0;
          room.phase = "results";
          emitUpdates(room);
          maybeScheduleAutoNext(room);
          continue;
        }

        // если авто2 и игроков стало меньше минимума — вернёмся в lobby
        if (room.mode === "auto2" && room.players.size < room.minPlayersToStart) {
          stopAuto(room);
          stopTimer(room);
          room.timeLeft = 0;
          room.phase = "lobby";
          room.submissions.clear();
          emitUpdates(room);
          continue;
        }

        emitUpdates(room);
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Сервер запущен на порту:", PORT));
