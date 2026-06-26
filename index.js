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
    const projectsCollection  = db.collection("projects");

   
    app.get("/", (req, res) => {
      res.send("SkillSwap Server Running");
    });

   
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

    
    app.get("/api/proposals/check/:taskId", async (req, res) => {
      try {
        const { taskId } = req.params;
        const { email }  = req.query;

        if (!email) {
          return res.status(400).send({ message: "Freelancer email is required" });
        }

        
        const query = {
          freelancer_email: email,
          $or: [
            { taskId: taskId },
            ObjectId.isValid(taskId) ? { taskId: new ObjectId(taskId) } : null
          ].filter(Boolean)
        };

        const existing = await proposalsCollection.findOne(query);
        res.send({ alreadyApplied: !!existing });
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Failed to check proposal status" });
      }
    });

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

        if (!ObjectId.isValid(taskId)) {
          return res.status(400).send({ message: "Invalid Task ID" });
        }
        const task = await tasksCollection.findOne({ _id: new ObjectId(taskId) });
        if (!task) {
          return res.status(404).send({ message: "Task not found" });
        }

        
        const existing = await proposalsCollection.findOne({
          freelancer_email,
          $or: [
            { taskId: taskId },
            { taskId: new ObjectId(taskId) }
          ]
        });
        
        if (existing) {
          return res.status(409).send({ message: "You have already applied for this task" });
        }

        const proposal = {
          taskId, 
          estimated_days:   Number(estimated_days),
          cover_note:       cover_note.trim(),
          freelancer_email,
          freelancer_name:  freelancer_name || "",
          status:           "pending",
          createdAt:        new Date(),
        };

        const result = await proposalsCollection.insertOne(proposal);

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

    app.get("/api/proposals/task/:taskId", async (req, res) => {
      try {
        const { taskId } = req.params;
        const query = {
          $or: [
            { taskId: taskId },
            ObjectId.isValid(taskId) ? { taskId: new ObjectId(taskId) } : null
          ].filter(Boolean)
        };
        const proposals  = await proposalsCollection
          .find(query)
          .sort({ createdAt: -1 })
          .toArray();
        res.send(proposals);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Failed to fetch proposals" });
      }
    });

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


    app.get("/api/proposals/client/:email", async (req, res) => {
      try {
        const { email } = req.params;
        
      
        const clientTasks = await tasksCollection
          .find({ client_email: email })
          .toArray();
        
        if (!clientTasks.length) {
          return res.send([]);
        }

       
        const stringIds = [];
        const objectIds = [];

        clientTasks.forEach(task => {
          if (task._id) {
            stringIds.push(task._id.toString());
            if (ObjectId.isValid(task._id)) {
              objectIds.push(new ObjectId(task._id));
            }
          }
        });

       
        const proposals = await proposalsCollection
          .find({
            $or: [
              { taskId: { $in: stringIds } },
              { taskId: { $in: objectIds } },
              { "taskId.$oid": { $in: stringIds } }
            ]
          })
          .sort({ createdAt: -1 })
          .toArray();

        res.send(proposals);
      } catch (error) {
        console.error("Error fetching client proposals:", error);
        res.status(500).send({ message: "Failed to fetch client proposals" });
      }
    });

    
    app.patch("/api/proposals/:id/status", async (req, res) => {
      try {
        const { id }     = req.params;
        const { status } = req.body;

        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ message: "Invalid Proposal ID" });
        }

        const allowed = ["accepted", "rejected"];
        if (!allowed.includes(status)) {
          return res.status(422).send({ message: "Status must be 'accepted' or 'rejected'" });
        }

        const proposal = await proposalsCollection.findOne({ _id: new ObjectId(id) });
        if (!proposal) {
          return res.status(404).send({ message: "Proposal not found" });
        }

        
        if (status === "accepted") {
          const alreadyAccepted = await proposalsCollection.findOne({
            status: "accepted",
            $or: [
              { taskId: proposal.taskId },
              ObjectId.isValid(proposal.taskId) ? { taskId: new ObjectId(proposal.taskId) } : null
            ].filter(Boolean)
          });

          if (alreadyAccepted) {
            return res.status(409).send({ message: "Another proposal has already been accepted for this task." });
          }
        }

        await proposalsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status, updatedAt: new Date() } }
        );

        
        if (status === "accepted") {
          const taskQuery = ObjectId.isValid(proposal.taskId) ? { _id: new ObjectId(proposal.taskId) } : { _id: proposal.taskId };
          const task = await tasksCollection.findOne(taskQuery);

          const projectExists = await projectsCollection.findOne({
            proposalId: id,
          });

          if (!projectExists) {
            await projectsCollection.insertOne({
              proposalId:       id,
              taskId:           proposal.taskId,
              taskTitle:        proposal.taskTitle,
              freelancer_email: proposal.freelancer_email,
              freelancer_name:  proposal.freelancer_name,
              client_email:     task?.client_email  || "",
              client_name:      task?.client_name   || "",
              budget:           proposal.proposed_budget,
              deadline:         task?.deadline       || null,
              category:         task?.category       || "",
              status:           "In Progress",
              deliverable_url:  null,
              notes:            null,
              createdAt:        new Date(),
            });

            
            if (ObjectId.isValid(proposal.taskId)) {
              await tasksCollection.updateOne(
                { _id: new ObjectId(proposal.taskId) },
                { $set: { status: "In Progress" } }
              );
            }
          }
        }

        res.send({ message: `Proposal ${status} successfully` });
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Failed to update proposal status" });
      }
    });

  
    app.get("/api/projects/freelancer/:email", async (req, res) => {
      try {
        const { email } = req.params;
        const projects  = await projectsCollection
          .find({ freelancer_email: email })
          .sort({ createdAt: -1 })
          .toArray();
        res.send(projects);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Failed to fetch projects" });
      }
    });

    app.get("/api/projects/client/:email", async (req, res) => {
      try {
        const { email } = req.params;
        const projects  = await projectsCollection
          .find({ client_email: email })
          .sort({ createdAt: -1 })
          .toArray();
        res.send(projects);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Failed to fetch projects" });
      }
    });

    app.get("/api/projects/:id", async (req, res) => {
      try {
        const { id } = req.params;

        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ message: "Invalid Project ID" });
        }

        const project = await projectsCollection.findOne({ _id: new ObjectId(id) });
        if (!project) {
          return res.status(404).send({ message: "Project not found" });
        }

        res.send(project);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Failed to fetch project" });
      }
    });

    app.patch("/api/projects/submit-deliverable", async (req, res) => {
      try {
        const { projectId, deliverable_url, notes } = req.body;

        if (!projectId || !deliverable_url) {
          return res.status(422).send({ message: "Project ID and deliverable URL are required" });
        }

        if (!ObjectId.isValid(projectId)) {
          return res.status(400).send({ message: "Invalid Project ID" });
        }

        const project = await projectsCollection.findOne({ _id: new ObjectId(projectId) });
        if (!project) {
          return res.status(404).send({ message: "Project not found" });
        }

        await projectsCollection.updateOne(
          { _id: new ObjectId(projectId) },
          {
            $set: {
              deliverable_url,
              notes:       notes || null,
              status:      "Completed",
              submittedAt: new Date(),
            },
          }
        );

        if (project.taskId) {
          const taskQuery = ObjectId.isValid(project.taskId) ? { _id: new ObjectId(project.taskId) } : { _id: project.taskId };
          await tasksCollection.updateOne(
            taskQuery,
            { $set: { status: "Completed" } }
          );
        }

        res.send({ message: "Deliverable submitted successfully" });
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Failed to submit deliverable" });
      }
    });

    app.patch("/api/projects/:id/complete", async (req, res) => {
      try {
        const { id } = req.params;

        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ message: "Invalid Project ID" });
        }

        await projectsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status: "Completed", completedAt: new Date() } }
        );

        res.send({ message: "Project marked as completed" });
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Failed to complete project" });
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