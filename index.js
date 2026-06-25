require("dotenv").config();

const express = require("express");
const cors = require("cors");
const {
  MongoClient,
  ServerApiVersion,
  ObjectId,
} = require("mongodb");

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

app.use(express.json());

// MongoDB URI
const uri = process.env.MONGODB_URI;

if (!uri) {
  console.error("❌ MONGODB_URI is missing in .env");
  process.exit(1);
}

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();

    console.log("✅ MongoDB Connected Successfully");

    const db = client.db("skill-swap");
    const tasksCollection = db.collection("tasks");

    // Root Route
    app.get("/", (req, res) => {
      res.send("🚀 SkillSwap Server Running");
    });

    // Create Task
    app.post("/api/tasks", async (req, res) => {
      try {
        const task = {
          ...req.body,
          status: "Open",
          createdAt: new Date(),
        };

        const result = await tasksCollection.insertOne(task);

        res.status(201).send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send({
          message: "Failed to create task",
        });
      }
    });

    // Get All Tasks (with optional search & category filter)
    app.get("/api/tasks", async (req, res) => {
      try {
        const { search, category } = req.query;

        const filter = {};

        // Title search — case-insensitive partial match
        if (search && search.trim()) {
          filter.title = { $regex: search.trim(), $options: "i" };
        }

        // Category exact match
        if (category && category !== "All") {
          filter.category = category;
        }

        const result = await tasksCollection
          .find(filter)
          .sort({ createdAt: -1 })
          .toArray();

        res.send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send({
          message: "Failed to fetch tasks",
        });
      }
    });

    // Get Single Task
    app.get("/api/tasks/:id", async (req, res) => {
      try {
        const id = req.params.id;

        if (!ObjectId.isValid(id)) {
          return res.status(400).send({
            message: "Invalid Task ID",
          });
        }

        const result = await tasksCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!result) {
          return res.status(404).send({
            message: "Task not found",
          });
        }

        res.send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send({
          message: "Failed to fetch task",
        });
      }
    });

    // Get My Tasks
    app.get("/api/my-tasks/:email", async (req, res) => {
      try {
        const email = req.params.email;

        const result = await tasksCollection
          .find({ client_email: email })
          .sort({ createdAt: -1 })
          .toArray();

        res.send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send({
          message: "Failed to fetch tasks",
        });
      }
    });

    // Update Task
    app.put("/api/tasks/:id", async (req, res) => {
      try {
        const id = req.params.id;

        if (!ObjectId.isValid(id)) {
          return res.status(400).send({
            message: "Invalid Task ID",
          });
        }

        const task = req.body;

        const result = await tasksCollection.updateOne(
          { _id: new ObjectId(id) },
          {
            $set: {
              title: task.title,
              category: task.category,
              description: task.description,
              budget: task.budget,
              deadline: task.deadline,
            },
          }
        );

        res.send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send({
          message: "Failed to update task",
        });
      }
    });

    // Delete Task
    app.delete("/api/tasks/:id", async (req, res) => {
      try {
        const id = req.params.id;

        if (!ObjectId.isValid(id)) {
          return res.status(400).send({
            message: "Invalid Task ID",
          });
        }

        const result = await tasksCollection.deleteOne({
          _id: new ObjectId(id),
        });

        res.send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send({
          message: "Failed to delete task",
        });
      }
    });

    // Dashboard Stats
    app.get("/api/dashboard-stats/:email", async (req, res) => {
      try {
        const email = req.params.email;

        const totalTasks = await tasksCollection.countDocuments({
          client_email: email,
        });

        const openTasks = await tasksCollection.countDocuments({
          client_email: email,
          status: "Open",
        });

        const inProgress = await tasksCollection.countDocuments({
          client_email: email,
          status: "In Progress",
        });

        const completed = await tasksCollection.countDocuments({
          client_email: email,
          status: "Completed",
        });

        res.send({
          totalTasks,
          openTasks,
          inProgress,
          completed,
          totalSpent: 0,
        });
      } catch (error) {
        console.error(error);
        res.status(500).send({
          message: "Failed to load dashboard stats",
        });
      }
    });
  } catch (error) {
    console.error("MongoDB Connection Error:", error);
  }
}

run();

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});