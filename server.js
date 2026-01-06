const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { nanoid } = require("nanoid");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const QUESTIONS = [
  {
    q: "Назовите популярный фрукт",
    a: [
      { text: "яблоко", points: 1 },
      { text: "банан", points: 2 },
      { text: "апельсин", points: 3 },
      { text: "виноград", points: 4 },
      { text: "манго", points: 5 },
    ],
  },
  {
    q: "Назовите вид транспорта",
    a: [
      { text: "автобус", points: 1 },
      { text: "машина", points: 2 },
      { text: "поезд", points: 3 },
      { text: "самолет", points: 4 },
      { text: "вертолет", points: 5 },
    ],
  },
  {
    q: "Назовите школьный предмет",
    a: [
      { text: "математика", points: 1 },
      { text: "русский язык", points: 2 },
      { text: "история", points: 3 },
      { text: "география", points: 4 },
      { text: "физика", points: 5 },
    ],
  },
];

const rooms = new Map();

function normalize(text) {
  return (text || "").toLowerCase().trim().replace(/ё/g, "е");
}

function createRoom(hostSocketId) {
  return {
    code: nanoid(6).toUpperCase(),
    hostSocketId,
    currentIndex: -1,
    phase: "lobby", // lobby | question | results | finished
    players: new Map(), // socketId -> { name, score }
    submissions: new Map(), // socketId -> { text, points }
    timer: null,
    timeLeft: 0,

    // ✅ NEW: длительность вопроса (секунды) — по умолчанию 60
    questionDuration: 60,
  };
}

function getQuestion(room) {
  if (room.currentIndex < 0 || room.currentIndex >= QUESTIONS.length) return null;
  return QUESTIONS[room.currentIndex];
}

function allAnswered(room) {
  const playerCount = room.players.size;
  if (playerCount === 0) return false;
  return room.submissions.size >= playerCount;
}

// === TIMER ===
function stopTimer(room) {
  if (room.timer) {
    clearInterval(room.timer);
    room.timer = null;
  }
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
      }
      return;
    }

    emitUpdates(room);
  }, 1000);
}

// === STATE ===
function getPublicState(room) {
  const qObj = getQuestion(room);
  const question = qObj ? qObj.q : "—";

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
    phase: room.phase,
    questionNumber: room.currentIndex + 1, // 0 в lobby
    totalQuestions: QUESTIONS.length,
    question,
    players,
    submissions,
    answeredCount: room.submissions.size,
    playerCount: room.players.size,
    timeLeft: room.timeLeft,

    // ✅ NEW: чтобы прогресс-бар знал “всего сколько”
    questionDuration: room.questionDuration,
  };
}

function getHostState(room) {
  const base = getPublicState(room);
  const qObj = getQuestion(room);

  const key = qObj
    ? qObj.a.map((x) => ({ text: x.text, points: x.points })).sort((a, b) => a.points - b.points)
    : [];

  return { ...base, key };
}

function emitUpdates(room) {
  io.to(room.code).emit("room:update", getPublicState(room));
  if (room.hostSocketId) {
    io.to(room.hostSocketId).emit("host:update", getHostState(room));
  }
}

io.on("connection", (socket) => {
  socket.on("host:create", () => {
    const room = createRoom(socket.id);
    rooms.set(room.code, room);
    socket.join(room.code);
    socket.emit("host:created", { code: room.code });
    emitUpdates(room);
  });

  socket.on("player:join", ({ code, name }) => {
    const room = rooms.get(code);
    if (!room) return socket.emit("error:msg", "Комната не найдена");

    const safeName = (name || "Игрок").trim().slice(0, 24) || "Игрок";
    room.players.set(socket.id, { name: safeName, score: 0 });
    socket.join(code);

    emitUpdates(room);
  });

  // ✅ NEW: ведущий меняет длительность вопроса (сек)
  socket.on("host:set_time", ({ code, seconds }) => {
    const room = rooms.get(code);
    if (!room) return;
    if (room.hostSocketId !== socket.id) return;

    let s = Number(seconds);
    if (!Number.isFinite(s)) return;

    // ограничим разумно: 10..300 сек
    s = Math.max(10, Math.min(300, Math.floor(s)));
    room.questionDuration = s;

    // если вопрос уже идёт — подрежем timeLeft, чтобы не было больше нового лимита
    if (room.phase === "question") {
      room.timeLeft = Math.min(room.timeLeft, room.questionDuration);
    }

    emitUpdates(room);
  });

  socket.on("host:next", ({ code }) => {
    const room = rooms.get(code);
    if (!room) return;
    if (room.hostSocketId !== socket.id) return;

    stopTimer(room);

    room.currentIndex++;
    if (room.currentIndex >= QUESTIONS.length) {
      room.phase = "finished";
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
    const room = rooms.get(code);
    if (!room) return;
    if (room.hostSocketId !== socket.id) return;
    if (room.phase !== "question") return;

    stopTimer(room);
    room.timeLeft = 0;
    room.phase = "results";
    emitUpdates(room);
  });

  // 🔄 НОВАЯ ИГРА
  socket.on("host:reset", ({ code }) => {
    console.log("RESET GAME:", code);

    const room = rooms.get(code);
    if (!room) return;
    if (room.hostSocketId !== socket.id) return;

    stopTimer(room);
    room.timeLeft = 0;
    room.currentIndex = -1;
    room.phase = "lobby";
    room.submissions.clear();

    for (const p of room.players.values()) {
      p.score = 0;
    }

    emitUpdates(room);
  });

  socket.on("player:answer", ({ code, text }) => {
    const room = rooms.get(code);
    if (!room) return;
    if (room.phase !== "question") return;
    if (room.submissions.has(socket.id)) return;

    const qObj = getQuestion(room);
    if (!qObj) return;

    const answerNorm = normalize(text);
    let points = 0;

    for (const a of qObj.a) {
      if (normalize(a.text) === answerNorm) {
        points = a.points;
        break;
      }
    }

    const player = room.players.get(socket.id);
    if (!player) return;

    player.score += points;
    room.submissions.set(socket.id, { text: (text || "").trim().slice(0, 60), points });

    if (allAnswered(room)) {
      stopTimer(room);
      room.timeLeft = 0;
      room.phase = "results";
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
        }

        emitUpdates(room);
      }
    }
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log("Сервер запущен на порту:", PORT);
});
