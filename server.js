const express = require("express");
const mongoose = require("mongoose");
const bodyParse = require("body-parser");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");

const { v4: uuidv4 } = require("uuid");

const app = express();
const PORT = 5000;

const JWT_SECRET = "usertoken";
const MONGO_URI =
  "mongodb+srv://admin:admin123@ssc.hirsz.mongodb.net/?retryWrites=true&w=majority&appName=SSC";

const corsOptions = {
  origin: "https://www.ssceventsattendance.com",
  credentials: true,
};

app.use(cors(corsOptions));
app.use(bodyParse.json());
app.use(cookieParser());

mongoose.connect(MONGO_URI);
const db = mongoose.connection;

db.on("error", console.error.bind(console, "connection error"));
db.once("open", () => {
  console.log("Connected to MongoDB");
});

const userSchema = new mongoose.Schema({
  userId: { type: String, unique: true },
  email: { type: String, unique: true },
  password: String,
  fullname: String,
  course: String,
  year: String,
  age: Number,
  studentId: String,
  gender: String,
  role: { type: String, enum: ["user", "admin"], default: "user" },
});

const User = mongoose.model("User", userSchema);

const eventSchema = new mongoose.Schema({
  eventId: { type: String, unique: true },
  eventTitle: { type: String, required: true },
  dueDate: { type: Date, required: true },
  timeLimit: { type: String, required: true },
  releaseDate: { type: Date, required: true },
});

const Event = mongoose.model("Event", eventSchema);

const participantSchema = new mongoose.Schema({
  name: String,
  course: String,
  gender: String,
  studentId: String,
  year: String,
  time: String,
});

const eventQrSchema = new mongoose.Schema({
  eventQrId: { type: String, unique: true },
  eventTitle: String,
  participants: [participantSchema],
});

const QrScanEvent = mongoose.model("QrScanEvent", eventQrSchema);

app.post("/api/signup", async (req, res) => {
  const {
    email,
    password,
    fullname,
    course,
    year,
    age,
    studentId,
    gender,
    role,
  } = req.body;

  try {
    const adminExist = await User.findOne({ role: "admin" });
    const assignedRole = adminExist ? "user" : role || "admin";
    const userId = uuidv4();

    const hashedPassword = await bcrypt.hash(password, 10);

    const newuser = new User({
      userId,
      email,
      password: hashedPassword,
      fullname,
      course,
      year,
      age,
      studentId,
      gender,
      role: assignedRole,
    });
    await newuser.save();
    res.status(201).json({ message: "User registered successfully!" });
  } catch {
    res.status(500).json({ error: "Failed to register user" });
  }
});

app.get("/api/users", async (req, res) => {
  try {
    const users = await User.find();
    res.status(200).json(users);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ error: "Invalid email or password" });
    }

    const isPasswordMatch = await bcrypt.compare(password, user.password);
    if (!isPasswordMatch) {
      return res.status(400).json({ error: "Invalid email or password" });
    }

    const token = jwt.sign(
      { userId: user.userId, role: user.role },
      JWT_SECRET,
      {
        expiresIn: "1h",
      }
    );
    res.cookie("token", token, {
      httOnly: true,
      secure: true,
      sameSite: "None",
    });
    res.status(200).json({
      message: "Login successfully",
      user,
    });
  } catch (error) {
    console.error("Login error", error);
    res.status(500).json({ error: "Failed to login user" });
  }
});

const authenticate = (req, res, next) => {
  const token = req.cookies.token;
  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid token" });
  }
};

app.post("/api/events", async (req, res) => {
  console.log("Received event data:", req.body);
  const { eventTitle, dueDate, timeLimit, releaseDate } = req.body;
  const eventId = uuidv4();

  try {
    const newEvent = new Event({
      eventId,
      eventTitle,
      dueDate: new Date(dueDate),
      timeLimit,
      releaseDate: new Date(releaseDate),
    });

    await newEvent.save();
    res.status(201).json({ message: "Event created successfully!" });
  } catch (error) {
    console.error("Error creating event:", error);
    res.status(500).json({ error: "Failed to create event" });
  }
});

app.get("/api/events", async (req, res) => {
  try {
    const events = await Event.find();
    res.json(events);
  } catch {
    res.status(500).json({ error: "Failed to fetch events" });
  }
});

app.post("/api/scanEvent", async (req, res) => {
  const { eventTitle, name, course, studentId, year, time } = req.body;
  const eventQrId = uuidv4();
  try {
    let event = await QrScanEvent.findOne({ eventTitle });

    if (!event) {
      event = new QrScanEvent({
        eventQrId,
        eventTitle,
        participants: [],
      });
    }

    const existingParticipant = event.participants.find(
      (participant) => participant.studentId === studentId
    );

    if (existingParticipant) {
      return res
        .status(400)
        .json({ message: "Participant already scanned for this event" });
    }

    const newParticipant = {
      name,
      gender,
      course,
      studentId,
      year,
      time,
    };

    event.participants.push(newParticipant);

    await event.save();
    res
      .status(200)
      .json({ message: "Participant scanned successfully!", event });
  } catch (error) {
    console.error("Error processing scan:", error);
    res.status(500).json({ message: "Server error", error });
  }
});

app.get("/api/scanEvent/:eventTitle", async (req, res) => {
  const { eventTitle } = req.params;

  try {
    const event = await QrScanEvent.findOne({ eventTitle });

    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }
    res.status(200).json(event);
  } catch (error) {
    console.error("Error fetching qrScanEvent", error);
    res.status(500).json({ message: "Server error", error });
  }
});

app.get("/api/scanEvents", async (req, res) => {
  try {
    const events = await QrScanEvent.find();

    if (!events || events.length === 0) {
      return res.status(404).json({ message: "No events found" });
    }

    res.status(200).json(events);
  } catch (error) {
    console.error("Error fetching all scan events:", error);
    res.status(500).json({ message: "Server error", error });
  }
});

app.post("/api/logout", (req, res) => {
  res.clearCookie("token");
  res.status(200).json({ message: "Logged out successfully" });
});

app.get("/api/protected", authenticate, (req, res) => {
  res.status(200).json({ message: "You have access to this protected route" });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
