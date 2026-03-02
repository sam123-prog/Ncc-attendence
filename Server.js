// ============================================
// NCC ATTENDANCE SYSTEM - BACKEND SERVER
// ============================================

// Load environment variables from .env file
require("dotenv").config();

// Import required libraries
const express = require("express");
const { Pool } = require("pg");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cors = require("cors");

// Create express app
const app = express();

// Allow frontend to communicate with backend
app.use(cors());

// Allow JSON body parsing
app.use(express.json());

// Serve frontend files from /public folder
app.use(express.static("public"));


// ============================================
// DATABASE CONNECTION (LOCAL POSTGRESQL)
// ============================================

const pool = new Pool({
  user: "postgres",           // Change if needed
  host: "localhost",
  database: "ncc_db",         // Must create this database
  password: "your_password",  // Replace with your PostgreSQL password
  port: 5432
});


// ============================================
// AUTHENTICATION MIDDLEWARE
// ============================================

// This function verifies JWT token
// Optionally checks for required role
function authenticate(requiredRole = null) {
  return (req, res, next) => {

    const token = req.headers.authorization;

    if (!token) {
      return res.status(401).json({ message: "No token provided" });
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      req.user = decoded;

      // If specific role required, verify it
      if (requiredRole && decoded.role !== requiredRole) {
        return res.status(403).json({ message: "Access denied" });
      }

      next();

    } catch (err) {
      return res.status(401).json({ message: "Invalid token" });
    }
  };
}


// ============================================
// CADET SEARCH (PUBLIC)
// ============================================

app.post("/cadet/search", async (req, res) => {

  const { regimental_number, name, college_name } = req.body;

  try {
    const result = await pool.query(
      `SELECT * FROM cadets 
       WHERE regimental_number = $1 
       AND name = $2 
       AND college_name = $3`,
      [regimental_number, name, college_name]
    );

    if (result.rows.length === 0) {
      return res.json({ message: "No Record Found" });
    }

    res.json(result.rows[0]);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// ============================================
// ADMIN LOGIN
// ============================================

app.post("/admin/login", async (req, res) => {

  const { email, password } = req.body;

  try {

    const result = await pool.query(
      "SELECT * FROM admins WHERE email = $1",
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const admin = result.rows[0];

    const match = await bcrypt.compare(password, admin.password);

    if (!match) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    // Create JWT token
    const token = jwt.sign(
      {
        email: admin.email,
        role: admin.role,
        college: admin.college_name
      },
      process.env.JWT_SECRET,
      { expiresIn: "8h" }
    );

    res.json({ token, role: admin.role });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// ============================================
// MARK ATTENDANCE
// ============================================

app.post("/attendance", authenticate(), async (req, res) => {

  const { regimental_number, date, status } = req.body;

  try {

    // College admin restriction:
    // They can only mark attendance for their own college
    if (req.user.role === "COLLEGE_ADMIN") {

      const cadet = await pool.query(
        "SELECT college_name FROM cadets WHERE regimental_number = $1",
        [regimental_number]
      );

      if (cadet.rows.length === 0) {
        return res.status(400).json({ message: "Cadet not found" });
      }

      if (cadet.rows[0].college_name !== req.user.college) {
        return res.status(403).json({ message: "Cannot modify other college" });
      }
    }

    await pool.query(
      `INSERT INTO attendance 
       (regimental_number, date, status, marked_by)
       VALUES ($1, $2, $3, $4)`,
      [regimental_number, date, status, req.user.email]
    );

    // Log action
    await pool.query(
      `INSERT INTO admin_logs 
       (admin_email, action, target_regimental_number)
       VALUES ($1, $2, $3)`,
      [req.user.email, "Marked Attendance", regimental_number]
    );

    res.json({ message: "Attendance marked successfully" });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// ============================================
// ADD MARKS
// ============================================

app.post("/marks", authenticate(), async (req, res) => {

  const { regimental_number, event_name, marks } = req.body;

  try {

    // Restrict college admin to own college
    if (req.user.role === "COLLEGE_ADMIN") {

      const cadet = await pool.query(
        "SELECT college_name FROM cadets WHERE regimental_number = $1",
        [regimental_number]
      );

      if (cadet.rows.length === 0) {
        return res.status(400).json({ message: "Cadet not found" });
      }

      if (cadet.rows[0].college_name !== req.user.college) {
        return res.status(403).json({ message: "Cannot modify other college" });
      }
    }

    await pool.query(
      `INSERT INTO marks
       (regimental_number, event_name, marks, added_by)
       VALUES ($1, $2, $3, $4)`,
      [regimental_number, event_name, marks, req.user.email]
    );

    // Log action
    await pool.query(
      `INSERT INTO admin_logs 
       (admin_email, action, target_regimental_number)
       VALUES ($1, $2, $3)`,
      [req.user.email, "Added Marks", regimental_number]
    );

    res.json({ message: "Marks added successfully" });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// ============================================
// DELETE ATTENDANCE (PI ONLY)
// ============================================

app.delete("/attendance/:id", authenticate("PI"), async (req, res) => {

  const id = req.params.id;

  try {
    await pool.query("DELETE FROM attendance WHERE id = $1", [id]);

    res.json({ message: "Attendance deleted" });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// ============================================
// DELETE MARKS (PI ONLY)
// ============================================

app.delete("/marks/:id", authenticate("PI"), async (req, res) => {

  const id = req.params.id;

  try {
    await pool.query("DELETE FROM marks WHERE id = $1", [id]);

    res.json({ message: "Marks deleted" });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// ============================================
// VIEW ADMIN LOGS (PI ONLY)
// ============================================

app.get("/logs", authenticate("PI"), async (req, res) => {

  try {

    const result = await pool.query(
      "SELECT * FROM admin_logs ORDER BY timestamp DESC"
    );

    res.json(result.rows);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// ============================================
// START SERVER
// ============================================

app.listen(5000, () => {
  console.log("NCC Server running on http://localhost:5000");
});
