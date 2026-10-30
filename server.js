
const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");
const path = require("path");

const app = express();
const db = new Database(path.join(__dirname, "mandal.db"));
const PORT = process.env.PORT || 3000;

// ==========================================
// MIDDLEWARE
// ==========================================

app.use(express.json({ limit: "20kb" }));
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    name: "dwarkesh.sid",
    secret:
      process.env.SESSION_SECRET ||
      "development-only-change-this-secret-before-deployment",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 4 * 60 * 60 * 1000
    }
  })
);

app.use(express.static(path.join(__dirname, "public")));

// ==========================================
// DATABASE SETUP
// Existing data is preserved.
// ==========================================

db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    phone TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('volunteer', 'donor')),
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS volunteer_interests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    activity TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, activity),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS donations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    activity TEXT NOT NULL,
    amount REAL NOT NULL CHECK(amount > 0),
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS activity_date_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    donor_id INTEGER NOT NULL,
    activity TEXT NOT NULL,
    requested_date TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(donor_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS activity_date_responses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id INTEGER NOT NULL,
    volunteer_id INTEGER NOT NULL,
    response TEXT NOT NULL
      CHECK(response IN ('accepted', 'rejected')),
    responded_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(request_id, volunteer_id),
    FOREIGN KEY(request_id) REFERENCES activity_date_requests(id),
    FOREIGN KEY(volunteer_id) REFERENCES users(id)
  );
`);

// ==========================================
// ACTIVITY DATA
// ==========================================

const scheduledActivities = [
  {
    id: "food",
    title: "Food Distribution",
    icon: "🍲",
    category: "Community",
    description:
      "Help prepare and distribute meals to people who need support.",
    goal: "Food seva",
    scheduleDate: "2026-11-07"
  },
  {
    id: "education",
    title: "Education Support",
    icon: "📚",
    category: "Education",
    description:
      "Support children's learning with books and educational resources.",
    goal: "Education seva",
    scheduleDate: "2026-11-10"
  },
  {
    id: "medical",
    title: "Medical Help",
    icon: "🩺",
    category: "Health",
    description:
      "Assist with community health camps and non-clinical support.",
    goal: "Health and wellbeing",
    scheduleDate: "2026-11-14"
  },
  {
    id: "clothes",
    title: "Clothes Distribution",
    icon: "👕",
    category: "Community",
    description:
      "Help sort, organize and distribute essential clothing.",
    goal: "Essential supplies",
    scheduleDate: "2026-11-18"
  },
  {
    id: "animal",
    title: "Animal Care",
    icon: "🐄",
    category: "Animal Welfare",
    description:
      "Help with feeding, cleanliness and animal welfare activities.",
    goal: "Animal welfare",
    scheduleDate: "2026-11-21"
  },
  {
    id: "community",
    title: "Community Seva",
    icon: "🤝",
    category: "Community",
    description:
      "Participate in community clean-up and local welfare activities.",
    goal: "Community welfare",
    scheduleDate: "2026-11-28"
  }
];

const findActivity = (id) =>
  scheduledActivities.find((item) => item.id === id);

const safeUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  role: user.role
});

// ==========================================
// AUTHENTICATION HELPERS
// ==========================================

function requireLogin(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({
      message: "Please log in to continue."
    });
  }

  next();
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.session.userId) {
      return res.status(401).json({
        message: "Please log in to continue."
      });
    }

    if (req.session.role !== role) {
      return res.status(403).json({
        message: `This action is available to ${role}s only.`
      });
    }

    next();
  };
}

function isValidISODate(value) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

function getTodayISO() {
  const now = new Date();

  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0")
  ].join("-");
}

// ==========================================
// REGISTER
// ==========================================

app.post("/api/register", (req, res) => {
  try {
    const { name, email, phone, password, role } = req.body;

    if (
      !name ||
      !email ||
      !phone ||
      !password ||
      !["volunteer", "donor"].includes(role)
    ) {
      return res.status(400).json({
        message: "Please complete all fields and choose a valid role."
      });
    }

    const cleanName = String(name).trim();
    const cleanEmail = String(email).trim().toLowerCase();
    const cleanPhone = String(phone).trim();

    if (cleanName.length < 2 || cleanName.length > 80) {
      return res.status(400).json({
        message: "Name must contain 2 to 80 characters."
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({
        message: "Enter a valid email address."
      });
    }

    if (!/^[0-9+\-\s()]{7,20}$/.test(cleanPhone)) {
      return res.status(400).json({
        message: "Enter a valid phone number."
      });
    }

    if (String(password).length < 8) {
      return res.status(400).json({
        message: "Password must contain at least 8 characters."
      });
    }

    const passwordHash = bcrypt.hashSync(String(password), 12);

    const result = db.prepare(`
      INSERT INTO users
        (name, email, phone, password_hash, role)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      cleanName,
      cleanEmail,
      cleanPhone,
      passwordHash,
      role
    );

    req.session.regenerate((sessionError) => {
      if (sessionError) {
        return res.status(500).json({
          message:
            "Account created, but session setup failed. Please log in."
        });
      }

      req.session.userId = Number(result.lastInsertRowid);
      req.session.role = role;

      req.session.save((saveError) => {
        if (saveError) {
          return res.status(500).json({
            message: "Unable to save your session. Please log in."
          });
        }

        res.status(201).json({
          message: "Registration successful!",
          user: {
            id: Number(result.lastInsertRowid),
            name: cleanName,
            email: cleanEmail,
            phone: cleanPhone,
            role
          }
        });
      });
    });
  } catch (error) {
    if (String(error.code).includes("SQLITE_CONSTRAINT_UNIQUE")) {
      return res.status(409).json({
        message: "This email is already registered. Please log in."
      });
    }

    console.error("Registration error:", error);

    res.status(500).json({
      message: "Unable to register right now."
    });
  }
});

// ==========================================
// LOGIN
// ==========================================

app.post("/api/login", (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "Enter your email and password."
      });
    }

    const user = db.prepare(
      "SELECT * FROM users WHERE email = ?"
    ).get(String(email).trim().toLowerCase());

    if (
      !user ||
      !bcrypt.compareSync(String(password), user.password_hash)
    ) {
      return res.status(401).json({
        message: "Invalid email or password."
      });
    }

    req.session.regenerate((err) => {
      if (err) {
        return res.status(500).json({
          message: "Unable to create a login session."
        });
      }

      req.session.userId = user.id;
      req.session.role = user.role;

      req.session.save((saveError) => {
        if (saveError) {
          return res.status(500).json({
            message: "Unable to save login session."
          });
        }

        res.json({
          message: "Login successful!",
          user: safeUser(user)
        });
      });
    });
  } catch (error) {
    console.error("Login error:", error);

    res.status(500).json({
      message: "Unable to log in right now."
    });
  }
});

// ==========================================
// CURRENT USER
// ==========================================

app.get("/api/me", requireLogin, (req, res) => {
  const user = db.prepare(`
    SELECT id, name, email, phone, role
    FROM users
    WHERE id = ?
  `).get(req.session.userId);

  if (!user) {
    return res.status(401).json({
      message: "Account not found. Please log in again."
    });
  }

  res.json({ user });
});

// ==========================================
// GET ALL ACTIVITIES
// ==========================================

app.get("/api/activities", (req, res) => {
  res.json({ activities: scheduledActivities });
});

// ==========================================
// VOLUNTEER REGISTERS FOR AN ACTIVITY
// ==========================================

app.post(
  "/api/volunteer-interest",
  requireRole("volunteer"),
  (req, res) => {
    const selectedActivity = findActivity(req.body.activity);

    if (!selectedActivity) {
      return res.status(400).json({
        message: "Please select a valid activity."
      });
    }

    try {
      db.prepare(`
        INSERT INTO volunteer_interests (user_id, activity)
        VALUES (?, ?)
      `).run(req.session.userId, selectedActivity.id);

      res.status(201).json({
        message:
          `You registered for ${selectedActivity.title}. ` +
          `Default schedule: ${selectedActivity.scheduleDate}.`,
        scheduleDate: selectedActivity.scheduleDate
      });
    } catch (error) {
      if (
        String(error.code).includes("SQLITE_CONSTRAINT_UNIQUE")
      ) {
        return res.status(409).json({
          message:
            `You are already registered for ${selectedActivity.title}.`,
          scheduleDate: selectedActivity.scheduleDate
        });
      }

      console.error("Volunteer registration error:", error);

      res.status(500).json({
        message: "Unable to register for this activity."
      });
    }
  }
);

// ==========================================
// VOLUNTEER REGISTRATION HISTORY
// ==========================================

app.get(
  "/api/my-volunteer-interests",
  requireRole("volunteer"),
  (req, res) => {
    const rows = db.prepare(`
      SELECT id, activity, created_at
      FROM volunteer_interests
      WHERE user_id = ?
      ORDER BY id DESC
    `).all(req.session.userId);

    const interests = rows.map((row) => {
      const activity = findActivity(row.activity);

      return {
        ...row,
        title: activity?.title || "Activity",
        icon: activity?.icon || "🤝",
        scheduleDate: activity?.scheduleDate || null
      };
    });

    res.json({ interests });
  }
);

// ==========================================
// DONOR CREATES A DONATION PLEDGE
// This records a pledge, not a real payment.
// ==========================================

app.post(
  "/api/donations",
  requireRole("donor"),
  (req, res) => {
    const selectedActivity = findActivity(req.body.activity);
    const amount = Number(req.body.amount);

    if (!selectedActivity) {
      return res.status(400).json({
        message: "Please select a valid cause."
      });
    }

    if (
      !Number.isFinite(amount) ||
      amount < 1 ||
      amount > 10000000
    ) {
      return res.status(400).json({
        message: "Enter an amount between ₹1 and ₹1,00,00,000."
      });
    }

    try {
      const result = db.prepare(`
        INSERT INTO donations (user_id, activity, amount)
        VALUES (?, ?, ?)
      `).run(
        req.session.userId,
        selectedActivity.id,
        amount
      );

      res.status(201).json({
        message:
          `Your pledge of ₹${amount.toLocaleString("en-IN")} ` +
          `for ${selectedActivity.title} has been recorded.`,
        donation: {
          id: Number(result.lastInsertRowid),
          activity: selectedActivity.id,
          title: selectedActivity.title,
          icon: selectedActivity.icon,
          amount
        }
      });
    } catch (error) {
      console.error("Donation error:", error);

      res.status(500).json({
        message: "Unable to record your pledge."
      });
    }
  }
);

// ==========================================
// DONOR PLEDGE HISTORY
// ==========================================

app.get(
  "/api/my-donations",
  requireRole("donor"),
  (req, res) => {
    const rows = db.prepare(`
      SELECT id, activity, amount, created_at
      FROM donations
      WHERE user_id = ?
      ORDER BY id DESC
    `).all(req.session.userId);

    const donations = rows.map((row) => {
      const activity = findActivity(row.activity);

      return {
        ...row,
        title: activity?.title || "Donation",
        icon: activity?.icon || "💛"
      };
    });

    res.json({ donations });
  }
);

// ==========================================
// ACTIVITY DATE REQUESTS
// ==========================================

// DONOR: Propose a date for an activity
app.post(
  "/api/activity-date-requests",
  requireRole("donor"),
  (req, res) => {
    const { activity, requestedDate } = req.body;
    const selectedActivity = findActivity(activity);

    if (!selectedActivity) {
      return res.status(400).json({
        message: "Please select a valid activity."
      });
    }

    if (!isValidISODate(requestedDate)) {
      return res.status(400).json({
        message: "Please choose a valid date."
      });
    }

    if (requestedDate < getTodayISO()) {
      return res.status(400).json({
        message: "Please choose today or a future date."
      });
    }

    try {
      const result = db.prepare(`
        INSERT INTO activity_date_requests
          (donor_id, activity, requested_date)
        VALUES (?, ?, ?)
      `).run(
        req.session.userId,
        selectedActivity.id,
        requestedDate
      );

      res.status(201).json({
        message:
          `Date request created for ${selectedActivity.title} ` +
          `on ${requestedDate}. Registered volunteers can now respond.`,
        requestId: Number(result.lastInsertRowid)
      });
    } catch (error) {
      console.error("Date request error:", error);

      res.status(500).json({
        message: "Unable to create the activity date request."
      });
    }
  }
);

// VOLUNTEER: View date requests for activities they registered for
app.get(
  "/api/volunteer-date-requests",
  requireRole("volunteer"),
  (req, res) => {
    const rows = db.prepare(`
      SELECT
        r.id AS requestId,
        r.activity,
        r.requested_date AS requestedDate,
        r.created_at AS createdAt,
        u.name AS donorName,
        ar.response AS myResponse,
        ar.responded_at AS respondedAt
      FROM activity_date_requests r
      JOIN volunteer_interests vi
        ON vi.activity = r.activity
       AND vi.user_id = ?
      JOIN users u
        ON u.id = r.donor_id
      LEFT JOIN activity_date_responses ar
        ON ar.request_id = r.id
       AND ar.volunteer_id = ?
      ORDER BY r.requested_date ASC, r.id DESC
    `).all(req.session.userId, req.session.userId);

    const requests = rows.map((row) => {
      const activity = findActivity(row.activity);

      return {
        ...row,
        title: activity?.title || "Activity",
        icon: activity?.icon || "🤝",
        myResponse: row.myResponse || "pending"
      };
    });

    res.json({ requests });
  }
);

// VOLUNTEER: Accept or reject a date request
app.post(
  "/api/activity-date-requests/:id/respond",
  requireRole("volunteer"),
  (req, res) => {
    const requestId = Number(req.params.id);
    const { response } = req.body;

    if (
      !Number.isSafeInteger(requestId) ||
      requestId < 1
    ) {
      return res.status(400).json({
        message: "Invalid date request."
      });
    }

    if (!["accepted", "rejected"].includes(response)) {
      return res.status(400).json({
        message: "Choose Accept or Reject."
      });
    }

    // Verify that this volunteer registered for the activity.
    const request = db.prepare(`
      SELECT r.id
      FROM activity_date_requests r
      JOIN volunteer_interests vi
        ON vi.activity = r.activity
       AND vi.user_id = ?
      WHERE r.id = ?
    `).get(req.session.userId, requestId);

    if (!request) {
      return res.status(404).json({
        message:
          "This request was not found for your registered activities."
      });
    }

    try {
      db.prepare(`
        INSERT INTO activity_date_responses
          (request_id, volunteer_id, response)
        VALUES (?, ?, ?)
        ON CONFLICT(request_id, volunteer_id)
        DO UPDATE SET
          response = excluded.response,
          responded_at = CURRENT_TIMESTAMP
      `).run(
        requestId,
        req.session.userId,
        response
      );

      res.json({
        message:
          `Your response has been recorded as ${response.toUpperCase()}.`,
        response
      });
    } catch (error) {
      console.error("Volunteer response error:", error);

      res.status(500).json({
        message: "Unable to save your response."
      });
    }
  }
);

// DONOR: View their date requests and volunteer responses
app.get(
  "/api/donor-date-requests",
  requireRole("donor"),
  (req, res) => {
    const rows = db.prepare(`
      SELECT
        r.id AS requestId,
        r.activity,
        r.requested_date AS requestedDate,
        r.created_at AS createdAt,
        v.id AS volunteerId,
        v.name AS volunteerName,
        v.email AS volunteerEmail,
        ar.response AS volunteerResponse,
        ar.responded_at AS respondedAt
      FROM activity_date_requests r
      LEFT JOIN volunteer_interests vi
        ON vi.activity = r.activity
      LEFT JOIN users v
        ON v.id = vi.user_id
       AND v.role = 'volunteer'
      LEFT JOIN activity_date_responses ar
        ON ar.request_id = r.id
       AND ar.volunteer_id = v.id
      WHERE r.donor_id = ?
      ORDER BY r.id DESC, v.name ASC
    `).all(req.session.userId);

    const requestMap = new Map();

    for (const row of rows) {
      if (!requestMap.has(row.requestId)) {
        const activity = findActivity(row.activity);

        requestMap.set(row.requestId, {
          requestId: row.requestId,
          activity: row.activity,
          title: activity?.title || "Activity",
          icon: activity?.icon || "🤝",
          requestedDate: row.requestedDate,
          createdAt: row.createdAt,
          volunteers: []
        });
      }

      if (row.volunteerId !== null) {
        requestMap.get(row.requestId).volunteers.push({
          id: row.volunteerId,
          name: row.volunteerName,
          email: row.volunteerEmail,
          response: row.volunteerResponse || "pending",
          respondedAt: row.respondedAt
        });
      }
    }

    const requests = Array.from(requestMap.values()).map(
      (request) => {
        const total = request.volunteers.length;

        const accepted = request.volunteers.filter(
          (volunteer) => volunteer.response === "accepted"
        ).length;

        const rejected = request.volunteers.filter(
          (volunteer) => volunteer.response === "rejected"
        ).length;

        const pending = total - accepted - rejected;

        return {
          ...request,
          summary: {
            total,
            accepted,
            rejected,
            pending
          }
        };
      }
    );

    res.json({ requests });
  }
);

// ==========================================
// LOGOUT
// ==========================================

app.post("/api/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({
        message: "Unable to log out."
      });
    }

    res.clearCookie("dwarkesh.sid");

    res.json({
      message: "Logged out successfully."
    });
  });
});

// ==========================================
// UNKNOWN API ROUTES
// ==========================================

app.use("/api", (req, res) => {
  res.status(404).json({
    message: "API endpoint not found."
  });
});

// ==========================================
// START SERVER
// ==========================================

app.listen(PORT, () => {
  console.log(
    `Dwarkesh Seva Mandal is running at http://localhost:${PORT}`
  );
});
