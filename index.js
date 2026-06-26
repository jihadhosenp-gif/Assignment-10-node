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
    console.log("MongoDB Connected Successfully");

    const db = client.db("skill-swap");
    const tasksCollection     = db.collection("tasks");
    const proposalsCollection = db.collection("proposals");

    // ─────────────────────────────────────────────────────────────────────────
    // ROOT
    // ─────────────────────────────────────────────────────────────────────────

    app.get("/", (req, res) => {
      res.send("🚀 SkillSwap Server Running");
    });

    // ─────────────────────────────────────────────────────────────────────────
    // TASKS
    // ─────────────────────────────────────────────────────────────────────────

    // Create task
    app.post("/api/tasks", async (req, res) => {
      try {
        const task = {
          ...req.body,
          status:          "Open",
          proposals_count: 0,
          createdAt:       new Date(),
        };
        const result = await tasksCollection.insertOne(task);
        res.status(201).send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Failed to create task" });
      }
    });

    // Get all tasks (with search + category filter)
    app.get("/api/tasks", async (req, res) => {
      try {
        const { search, category } = req.query;
        const filter = {};

        if (search && search.trim()) {
          filter.title = { $regex: search.trim(), $options: "i" };
        }
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
        res.status(500).send({ message: "Failed to fetch tasks" });
      }
    });

    // Get single task by ID
    app.get("/api/tasks/:id", async (req, res) => {
      try {
        const id = req.params.id;

        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ message: "Invalid Task ID" });
        }

        const result = await tasksCollection.findOne({ _id: new ObjectId(id) });

        if (!result) {
          return res.status(404).send({ message: "Task not found" });
        }

        res.send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Failed to fetch task" });
      }
    });

    // Get tasks by client email
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
        res.status(500).send({ message: "Failed to fetch tasks" });
      }
    });

    // Update task
    app.put("/api/tasks/:id", async (req, res) => {
      try {
        const id = req.params.id;

        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ message: "Invalid Task ID" });
        }

        const task = req.body;
        const result = await tasksCollection.updateOne(
          { _id: new ObjectId(id) },
          {
            $set: {
              title:       task.title,
              category:    task.category,
              description: task.description,
              budget:      task.budget,
              deadline:    task.deadline,
            },
          }
        );
        res.send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Failed to update task" });
      }
    });

    // Delete task
    app.delete("/api/tasks/:id", async (req, res) => {
      try {
        const id = req.params.id;

        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ message: "Invalid Task ID" });
        }

        const result = await tasksCollection.deleteOne({ _id: new ObjectId(id) });
        res.send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Failed to delete task" });
      }
    });

    // Dashboard stats
    app.get("/api/dashboard-stats/:email", async (req, res) => {
      try {
        const email = req.params.email;

        const [totalTasks, openTasks, inProgress, completed] = await Promise.all([
          tasksCollection.countDocuments({ client_email: email }),
          tasksCollection.countDocuments({ client_email: email, status: "Open" }),
          tasksCollection.countDocuments({ client_email: email, status: "In Progress" }),
          tasksCollection.countDocuments({ client_email: email, status: "Completed" }),
        ]);

        res.send({ totalTasks, openTasks, inProgress, completed, totalSpent: 0 });
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Failed to load dashboard stats" });
      }
    });

    // ─────────────────────────────────────────────────────────────────────────
    // PROPOSALS
    // ─────────────────────────────────────────────────────────────────────────

    // IMPORTANT: /check/:taskId must be defined BEFORE /task/:taskId
    // otherwise Express matches "check" as a taskId value

    // Check: has this freelancer already applied?
    app.get("/api/proposals/check/:taskId", async (req, res) => {
      try {
        const { taskId } = req.params;
        const { email }  = req.query;

        if (!email) {
          return res.status(400).send({ message: "Freelancer email is required" });
        }

        const existing = await proposalsCollection.findOne({
          taskId,
          freelancer_email: email,
        });

        res.send({ alreadyApplied: !!existing });
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Failed to check proposal status" });
      }
    });

    // Submit a proposal
    app.post("/api/proposals", async (req, res) => {
      try {
        const {
          taskId,
          proposed_budget,
          estimated_days,
          cover_note,
          freelancer_email,
          freelancer_name,
        } = req.body;

        // ── Field validation ──
        if (!taskId || !proposed_budget || !estimated_days || !cover_note) {
          return res.status(422).send({ message: "All fields are required" });
        }
        if (!freelancer_email) {
          return res.status(401).send({ message: "Unauthorized — email missing" });
        }
        if (Number(proposed_budget) <= 0) {
          return res.status(422).send({ message: "Budget must be greater than 0" });
        }
        if (Number(estimated_days) <= 0) {
          return res.status(422).send({ message: "Estimated days must be greater than 0" });
        }
        if (cover_note.trim().length < 30) {
          return res.status(422).send({ message: "Cover note must be at least 30 characters" });
        }

        // ── Task exists? ──
        if (!ObjectId.isValid(taskId)) {
          return res.status(400).send({ message: "Invalid Task ID" });
        }
        const task = await tasksCollection.findOne({ _id: new ObjectId(taskId) });
        if (!task) {
          return res.status(404).send({ message: "Task not found" });
        }

        // ── Duplicate check ──
        const existing = await proposalsCollection.findOne({
          taskId,
          freelancer_email,
        });
        if (existing) {
          return res.status(409).send({ message: "You have already applied for this task" });
        }

        // ── Save proposal ──
        const proposal = {
          taskId,
          taskTitle:        task.title,
          proposed_budget:  Number(proposed_budget),
          estimated_days:   Number(estimated_days),
          cover_note:       cover_note.trim(),
          freelancer_email,
          freelancer_name:  freelancer_name || "",
          status:           "pending",
          createdAt:        new Date(),
        };

        const result = await proposalsCollection.insertOne(proposal);

        // ── Increment proposals_count on the task ──
        await tasksCollection.updateOne(
          { _id: new ObjectId(taskId) },
          { $inc: { proposals_count: 1 } }
        );

        res.status(201).send({
          message: "Proposal submitted successfully",
          id:      result.insertedId,
        });
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Failed to submit proposal" });
      }
    });

    // Get all proposals for a task (client view)
    app.get("/api/proposals/task/:taskId", async (req, res) => {
      try {
        const { taskId } = req.params;
        const proposals  = await proposalsCollection
          .find({ taskId })
          .sort({ createdAt: -1 })
          .toArray();
        res.send(proposals);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Failed to fetch proposals" });
      }
    });

    // Get all proposals by a freelancer
    app.get("/api/proposals/freelancer/:email", async (req, res) => {
      try {
        const { email } = req.params;
        const proposals = await proposalsCollection
          .find({ freelancer_email: email })
          .sort({ createdAt: -1 })
          .toArray();
        res.send(proposals);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Failed to fetch proposals" });
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