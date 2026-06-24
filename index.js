require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const uri = process.env.MONGODB_URI;

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

    const db = client.db("skillswap");
    const tasksCollection = db.collection("tasks");

    app.get("/", (req, res) => {
      res.send("SkillSwap Server Running");
    });

    app.post("/api/tasks", async (req, res) => {
      const task = {
        ...req.body,
        status: "Open",
        createdAt: new Date(),
      };

      const result = await tasksCollection.insertOne(task);
      res.send(result);
    });

    app.get("/api/tasks", async (req, res) => {
      const result = await tasksCollection.find().toArray();
      res.send(result);
    });

    app.get("/api/dashboard-stats", async (req, res) => {
      const totalTasks =
        await tasksCollection.countDocuments();

      const openTasks =
        await tasksCollection.countDocuments({
          status: "Open",
        });

      const inProgress =
        await tasksCollection.countDocuments({
          status: "In Progress",
        });

      res.send({
        totalTasks,
        openTasks,
        inProgress,
        totalSpent: 0,
      });
    });

    app.delete("/api/tasks/:id", async (req, res) => {
      const result =
        await tasksCollection.deleteOne({
          _id: new ObjectId(req.params.id),
        });

      res.send(result);
    });

    console.log("MongoDB Connected Successfully");
  } catch (error) {
    console.error(error);
  }
}

run();

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});