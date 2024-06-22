const { MongoClient, ObjectId } = require("mongodb");
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SK);
const express = require("express");
const cors = require("cors");

const app = express();
const port = process.env.PORT || 5000;

// CORS options
const corsOptions = {
  origin: ["http://localhost:5173"],
  credentials: true,
  optionsSuccessStatus: 200,
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json());

// MongoDB connection URI
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.iff9rhc.mongodb.net/ScholarQuest?retryWrites=true&w=majority`;

// MongoDB client setup
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

async function run() {
  try {
    await client.connect(); // Connect to MongoDB
    console.log("Connected to MongoDB!");

    const database = client.db(); // Use the default database from the connection string
    const scholarshipsCollection = database.collection("scholarships");
    const reviewsCollection = database.collection("reviews");

    // Routes
    app.get("/", async (req, res) => {
      const result = await scholarshipsCollection
        .find()
        .sort({ applicationFees: 1, postDate: -1 })
        .limit(6)
        .toArray();
      res.send(result);
    });

    app.get("/reviews", async (req, res) => {
      const result = await reviewsCollection.find().toArray();
      res.send(result);
    });

    app.get("/details/:id", async (req, res) => {
      try {
        const query = { _id: new ObjectId(req.params.id) };
        const result = await scholarshipsCollection.findOne(query);
        if (!result) {
          return res.status(404).send("Scholarship not found");
        }
        res.send(result);
      } catch (error) {
        console.error("Error retrieving scholarship details:", error);
        res.status(500).send("Internal Server Error");
      }
    });

    app.post("/create-payment-intent", async (req, res) => {
      try {
        const { price } = req.body;
        const amount = parseInt(price * 100);
    
        const paymentIntent = await stripe.paymentIntents.create({
          amount: amount,
          currency: "usd",
          payment_method_types: ["card"],
        });
    
        res.send({
          clientSecret: paymentIntent.client_secret,
        });
      } catch (error) {
        console.error("Error creating payment intent:", error);
        res.status(500).send("Failed to create payment intent");
      }
    });
    

    // Start server
    app.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });
  } catch (error) {
    console.error("Error running the server:", error);
  }
}

run().catch(console.error);
