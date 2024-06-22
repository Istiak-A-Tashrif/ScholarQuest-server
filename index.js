const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const express = require("express");
require("dotenv").config();
const cors = require("cors");
const jwt = require("jsonwebtoken");
const app = express();
const port = process.env.PORT || 5000;

const corsOptions = {
  origin: ["http://localhost:5173"],
  credentials: true,
  optionsSuccessStatus: 200,
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.iff9rhc.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
    const database = client.db("ScholarQuest");
    const scholarshipsCollection = database.collection("scholarships");
    const reviewsCollection = database.collection("reviews");

    app.get("/", async (req, res) => {
        const result = await scholarshipsCollection.find()
            .sort({  applicationFees: 1, postDate: -1 }) // Sort by postDate (recently posted) and applicationFees (low to high)
            .limit(6) // Limit to 6 results
            .toArray();
        res.send(result);
    });
    app.get("/reviews", async (req, res) => {
        const result = await reviewsCollection.find().toArray();
        res.send(result);
    });
    app.get("/details/:id", async (req, res) => {
        const query = { id: req.params.id};
        const result = await scholarshipsCollection.findOne(query);
        res.send(result);
    });

  } catch (error) {
    console.error("Error running the server:", error);
  }
}

run().catch(console.dir);

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
