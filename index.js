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
const client = new MongoClient(uri);

async function run() {
  try {
    await client.connect(); // Connect to MongoDB
    console.log("Connected to MongoDB!");

    const database = client.db(); // Use the default database from the connection string
    const scholarshipsCollection = database.collection("scholarships");
    const paymentCollection = database.collection("payment");
    const reviewsCollection = database.collection("reviews");
    const applicationCollection = database.collection("application");

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
      const query = { email: req.query.email };
      const result = await reviewsCollection.find(query).toArray();
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

    app.get("/paymentHistory", async (req, res) => {
      try {
        const email = req.query.email;
        if (!email) {
          return res
            .status(400)
            .send({ error: "Email query parameter is required" });
        }

        const query = { email: email };
        const result = await paymentCollection.find(query).toArray();

        res.send(result);
      } catch (error) {
        console.error("Error retrieving payment history:", error);
        res.status(500).send({ error: "Internal Server Error" });
      }
    });

    app.post("/savePayment", async (req, res) => {
      try {
        const payment = req.body;
        if (!payment || typeof payment !== "object") {
          return res.status(400).send({ error: "Invalid payment data" });
        }
        const result = await paymentCollection.insertOne(payment);
        res.send(result);
      } catch (error) {
        console.error("Error saving payment:", error);
        res
          .status(500)
          .send({ error: "An error occurred while saving the payment" });
      }
    });

    app.post("/create-payment-intent", async (req, res) => {
      try {
        const { price } = req.body;
        if (!price || isNaN(price)) {
          return res.status(400).send({ error: "Invalid price" });
        }
        const amount = parseInt(price * 100); // Convert to cents
    
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

    app.get("/checkPayment", async (req, res) => {
      const query = {
        email: req.query.email,
        scholarshipId: req.query.id,
      };

      const result = await paymentCollection.findOne(query);
      res.send(result);
    });

    app.post("/scholarApply", async (req, res) => {
      const application = req.body;
      const result = await applicationCollection.insertOne(application);
      res.send(result);
    });
    app.get("/checkApply", async (req, res) => {
      try {
        const query = {
          userEmail: req.query.email,
          scholarshipId: req.query.scholarshipId,
        };
    
        const result = await applicationCollection.findOne(query);
    
        if (result) {
          res.send(result); // Send back the application data if found
        } else {
          res.status(404).send({ message: 'No application found for the given user and scholarship ID' });
        }
      } catch (error) {
        console.error('Error fetching application:', error);
        res.status(500).send({ message: 'Internal Server Error' });
      }
    });
    
    app.get("/myApplication", async (req, res) => {
      const query = { userEmail: req.query.email }
      const result = await applicationCollection.find(query).toArray();
      res.send(result)
    })

    app.post("/saveReview", async (req, res) => {
      try {
        const review = req.body;
        if (!review || typeof review !== "object") {
          return res.status(400).send({ error: "Invalid review data" });
        }

        const result = await reviewsCollection.insertOne(review);
        console.log("Review saved successfully:", result.insertedId);
        res.status(201).send({ message: "Review saved successfully", reviewId: result.insertedId });
      } catch (error) {
        console.error("Error saving review:", error);
        res.status(500).send({ error: "An error occurred while saving the review" });
      }
    });
    
    // Start server
    app.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });
  } catch (error) {
    console.error("Error running the server:", error);
  } finally {
    // Ensure the client will close when you finish/error
    // await client.close(); // Uncomment if you want to close the connection after the server stops
  }
}

run().catch(console.error);
