const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { nanoid } = require("nanoid");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

/* ===== Questions (можно расширять) ===== */
const QUESTIONS = [
  { q: "Назовите популярный фрукт", a: [{ text: "яблоко", points: 1 }, { text: "банан", points: 2 }, { text: "апельсин", points: 3 }, { text: "виноград", points: 4 }, { text: "манго", points: 5 }] },
  { q: "Назовите вид транспорта", a: [{ text: "автобус", points: 1 }, { text: "машина", points: 2 }, { text: "поезд", points: 3 }, { text: "самолет", points: 4 }, { text: "метро", points: 5 }] },
  { q: "Назовите школьный предмет", a: [{ text: "математика", points: 1 }, { text: "русский язык", points: 2 }, { text: "история", points: 3 }, { text: "география", points: 4 }, { text: "физика", points: 5 }] },
  { q: "Назовите домашнее животное", a: [{ text: "кот", points: 1 }, { text: "собака", points: 2 }, { text: "хомяк", points: 3 }, { text: "попугай", points: 4 }, { text: "рыбки", points: 5 }] },
  { q: "Назовите напиток", a: [{ text: "чай", points: 1 }, { text: "кофе", points: 2 }, { text: "вода", points: 3 }, { text: "сок", points: 4 }, { text: "лимонад", points: 5 }] },
  { q: "Назовите профессию", a: [{ text: "врач", points: 1 }, { text: "учитель", points: 2 }, { text: "повар", points: 3 }, { text: "инженер", points: 4 }, { text: "водитель", points: 5 }] },
  { q: "Назовите время года", a: [{ text: "лето", points: 1 }, { text: "зима", points: 2 }, { text: "весна", points: 3 }, { text: "осень", points: 4 }, { text: "дождь", points: 5 }] },
  { q: "Назовите цвет", a: [{ text: "красный", points: 1 }, { text: "синий", points: 2 }, { text: "зелёный", points: 3 }, { text: "чёрный", points: 4 }, { text: "белый", points: 5 }] },
  { q: "Назовите популярное блюдо", a: [{ text: "пицца", points: 1 }, { text: "бургер", points: 2 }, { text: "пельмени", points: 3 }, { text: "суп", points: 4 }, { text: "салат", points: 5 }] },
  { q: "Назовите часть тела", a: [{ text: "рука", points: 1 }, { text: "нога", points: 2 }, { text: "голова", points: 3 }, { text: "глаз", points: 4 }, { text: "сердце", points: 5 }] },
  { q: "Назовите предмет мебели", a: [{ text: "стол", points: 1 }, { text: "стул", points: 2 }, { text: "кровать", points: 3 }, { text: "шкаф", points: 4 }, { text: "диван", points: 5 }] },
  { q: "Назовите бытовую технику", a: [{ text: "холодильник", points: 1 }, { text: "телевизор", points: 2 }, { text: "пылесос", points: 3 }, { text: "микроволновка", points: 4 }, { text: "стиральная машина", points: 5 }] },
  { q: "Назовите вид спорта", a: [{ text: "футбол", points: 1 }, { text: "баскетбол", points: 2 }, { text: "хоккей", points: 3 }, { text: "теннис", points: 4 }, { text: "плавание", points: 5 }] },
  { q: "Назовите город в России", a: [{ text: "москва", points: 1 }, { text: "санкт-петербург", points: 2 }, { text: "казань", points: 3 }, { text: "новосибирск", points: 4 }, { text: "екатеринбург", points: 5 }] },
  { q: "Назовите музыкальный инструмент", a: [{ text: "гитара", points: 1 }, { text: "пианино", points: 2 }, { text: "барабаны", points: 3 }, { text: "скрипка", points: 4 }, { text: "флейта", points: 5 }] },
  { q: "Назовите приложение в телефоне", a: [{ text: "ютуб", points: 1 }, { text: "телеграм", points: 2 }, { text: "вконтакте", points: 3 }, { text: "инстаграм", points: 4 }, { text: "тик ток", points: 5 }] },
  { q: "Назовите школьную принадлежность", a: [{ text: "тетрадь", points: 1 }, { text: "ручка", points: 2 }, { text: "карандаш", points: 3 }, { text: "линейка", points: 4 }, { text: "дневник", points: 5 }] },
  { q: "Назовите комнату в доме", a: [{ text: "кухня", points: 1 }, { text: "спальня", points: 2 }, { text: "гостиная", points: 3 }, { text: "ванная", points: 4 }, { text: "коридор", points: 5 }] },
  { q: "Назовите праздник", a: [{ text: "новый год", points: 1 }, { text: "день рождения", points: 2 }, { text: "8 марта", points: 3 }, { text: "23 февраля", points: 4 }, { text: "пасха", points: 5 }] },
  { q: "Назовите часть дома", a: [{ text: "дверь", points: 1 }, { text: "окно", points: 2 }, { text: "стена", points: 3 }, { text: "крыша", points: 4 }, { text: "пол", points: 5 }] },

  // + ещё чуть-чуть, чтобы было разнообразнее
  { q: "Назовите животное из леса", a: [{ text: "волк", points: 1 }, { text: "лиса", points: 2 }, { text: "медведь", points: 3 }, { text: "заяц", points: 4 }, { text: "лось", points: 5 }] },
  { q: "Назовите предмет в школе", a: [{ text: "доска", points: 1 }, { text: "парта", points: 2 }, { text: "учебник", points: 3 }, { text: "мел", points: 4 }, { text: "портфель", points: 5 }] },
  { q: "Назовите популярный мессенджер", a: [{ text: "телеграм", points: 1 }, { text: "ватсап", points: 2 }, { text: "вайбер", points: 3 }, { text: "дискорд", points: 4 }, { text: "сигнал", points: 5 }] },
  { q: "Назовите предмет на кухне", a: [{ text: "ложка", points: 1 }, { text: "вилка", points: 2 }, { text: "тарелка", points: 3 }, { text: "нож", points: 4 }, { text: "кастрюля", points: 5 }] },
  { q: "Назовите сладость", a: [{ text: "шоколад", points: 1 }, { text: "конфета", points: 2 }, { text: "печенье", points: 3 }, { text: "торт", points: 4 }, { text: "мороженое", points: 5 }] },
];

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
  const lim = clampInt(limit, 10, 20, 10);
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
