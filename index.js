// main.js
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const { createConnection } = require("./db");
const nodemailer = require('nodemailer');

const { syncData } = require('./facebook');
const { syncDatas } = require('./facebook34');
const { syncData5 } = require('./facebook5');
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  transports: ['websocket', 'polling'],
});

const PORT = 4004;

// Email Configuration
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "uppalahemanth4@gmail.com",
    pass: "oimoftsgtwradkux",
  },
  tls: {
    rejectUnauthorized: false,
  },
});

// Function to send server down email
const sendServerDownEmail = async (reason) => {
  try {
    await transporter.sendMail({
      from: '"Server Monitor" <uppalahemanth4@gmail.com>',
      to: "uppalahemanth4@gmail.com", // Admin email
      subject: "🚨 Server Down Alert!",
      text: `Server http://localhost:${PORT} has stopped.\nReason: ${reason}`,
    });
    console.log("Server down notification sent via email.");
  } catch (error) {
    console.error("Failed to send email:", error);
  }
};

// Handle server shutdown events
const handleExit = async (reason) => {
  console.log(`Server is stopping... Reason: ${reason}`);
  await sendServerDownEmail(reason);
  process.exit(1);
};

process.on("SIGINT", () => handleExit("Manual shutdown (Ctrl+C)"));
process.on("SIGTERM", () => handleExit("System termination"));
process.on("uncaughtException", async (err) => {
  console.error("Uncaught Exception:", err);
  await sendServerDownEmail(`Uncaught Exception: ${err.message}`);
  process.exit(1);
});

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors());

// Attach Socket.io to requests
app.use((req, res, next) => {
  req.io = io;
  next();
});


app.get('/ivrs/enquiries', (req, res) => {
  const db = createConnection(); // Create a new connection instance

  const query = 'SELECT * FROM addleads ORDER BY created_at DESC';

  db.query(query, (err, results) => {
    db.end(); // Close connection after query execution

    if (err) {
      console.error('Error fetching enquiries:', err);
      return res.status(500).json({ message: 'Error fetching enquiries' });
    }
    res.json(results);
  });
});


// WebSocket connection
io.on('connection', (socket) => {
  console.log('A user connected');
  socket.on('disconnect', () => {
    console.log('A user disconnected');
  });
});

// Start Google Sheets sync
//  setInterval(syncData, 30 * 60 * 1000);
//   setInterval(syncDatas, 40 * 60 * 1000);
//    setInterval(syncData5, 50 * 60 * 1000);
// setInterval(syncData, 1 * 60 * 1000);

 setInterval(syncData, 10000);
 setInterval(syncDatas, 10000);
 setInterval(syncData5, 10000);
// Start server
server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});