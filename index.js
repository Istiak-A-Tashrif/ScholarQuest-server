const { MongoClient, ObjectId } = require("mongodb");
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SK);
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");

const app = express();
const port = process.env.PORT || 5000;

// CORS options
const corsOptions = {
  origin: ["http://localhost:5173", "https://scholarquest.netlify.app"],
  credentials: true,
  optionsSuccessStatus: 200,
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());

const verifyToken = (req, res, next) => {
  const token = req.cookies?.token;

  if (!token) {
    return res.status(401).send({ message: "unauthorized access" });
  }

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      console.error(err);
      return res.status(401).send({ message: "unauthorized access" });
    }

    req.user = decoded;
    next();
  });
};

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
    const usersCollection = database.collection("users");

     // JWT Route
     app.post("/jwt", (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1d",
      });

      res
        .cookie("token", token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
        })
        .status(200)
        .send({ success: true, token });
    });

    // Logout Route
    app.get("/logout", (req, res) => {
      res
        .clearCookie("token", {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
        })
        .status(200)
        .send({ success: true });
    });


    // Routes
    app.get("/", async (req, res) => {
      const result = await scholarshipsCollection
        .find()
        .sort({ applicationFees: 1, postDate: -1 })
        .limit(6)
        .toArray();
      res.send(result);
    });
    app.get("/allScholarship", async (req, res) => {
      const page = parseInt(req.query.page) - 1 || 0;
      const size = parseInt(req.query.size) || 10;
      const search = req.query.search || "";
    
      let query = {
        universityName: { $regex: search, $options: "i" },
      };
    
      try {
        console.log(size, page, query);
        const cursor = scholarshipsCollection.find(query)
          .skip(page * size)
          .limit(size);
        const result = await cursor.toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: "An error occurred while fetching scholarships" });
      }
    });

    app.get('/manageScholarships', verifyToken, async (req, res) => {
      const tokenEmail = req.user?.email;
      const userEmail = req.query?.email;
      if (tokenEmail !== userEmail) {
        return res.status(403).send({ message: "forbidden access" });
      }
      try {
    
        const scholarships = await scholarshipsCollection.find({}).toArray();
    
        res.send(scholarships);
      } catch (error) {
        console.error('Error fetching scholarships:', error);
        res.status(500).send({ error: 'Failed to fetch scholarships' });
      }
    });
    
    app.get("/countScholarship", async (req, res) => {
      const search = req.query.search || "";
    
      let query = {
        universityName: { $regex: search, $options: "i" },
      };
    
      try {
        const count = await scholarshipsCollection.countDocuments(query);
        res.send({ count });
      } catch (error) {
        res.status(500).send({ error: "An error occurred while counting scholarships" });
      }
    });
    

    app.get("/reviews", async (req, res) => {
      const query = { email: req.query.email };
      const result = await reviewsCollection.find(query).limit(6).toArray();
      res.send(result);
    });

    app.get("/details/:id", verifyToken, async (req, res) => {
      const tokenEmail = req.user?.email;
      const userEmail = req.query?.email;
      if (tokenEmail !== userEmail) {
        return res.status(403).send({ message: "forbidden access" });
      }
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

    app.get("/paymentHistory", verifyToken, async (req, res) => {
      const tokenEmail = req.user?.email;
      const userEmail = req.query?.email;
      if (tokenEmail !== userEmail) {
        return res.status(403).send({ message: "forbidden access" });
      }
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

    app.post("/savePayment", verifyToken, async (req, res) => {
      const tokenEmail = req.user?.email;
      const userEmail = req.query?.email;
      if (tokenEmail !== userEmail) {
        return res.status(403).send({ message: "forbidden access" });
      }
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

    app.get("/checkPayment", verifyToken, async (req, res) => {
      const tokenEmail = req.user?.email;
      const userEmail = req.query?.email;
      if (tokenEmail !== userEmail) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const query = {
        email: req.query.email,
        scholarshipId: req.query.id,
      };

      const result = await paymentCollection.findOne(query);
      res.send(result);
    });

    app.post("/scholarApply", verifyToken, async (req, res) => {
      const tokenEmail = req.user?.email;
      const userEmail = req.query?.email;
      if (tokenEmail !== userEmail) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const application = req.body;
      const result = await applicationCollection.insertOne(application);
      res.send(result);
    });
    app.get("/checkApply", verifyToken, async (req, res) => {
      const tokenEmail = req.user?.email;
      const userEmail = req.query?.email;
      if (tokenEmail !== userEmail) {
        return res.status(403).send({ message: "forbidden access" });
      }
      try {
        const query = {
          userEmail: req.query.email,
          scholarshipId: req.query.scholarshipId,
        };

        const result = await applicationCollection.findOne(query);

        if (result) {
          res.send(result); // Send back the application data if found
        } else {
          res.status(404).send({
            message:
              "No application found for the given user and scholarship ID",
          });
        }
      } catch (error) {
        console.error("Error fetching application:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    app.get("/myApplication", verifyToken, async (req, res) => {
      const tokenEmail = req.user?.email;
      const userEmail = req.query?.email;
      if (tokenEmail !== userEmail) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const query = { userEmail: req.query.email };
      const result = await applicationCollection.find(query).toArray();
      res.send(result);
    });

    app.post("/saveReview", verifyToken, async (req, res) => {
      const tokenEmail = req.user?.email;
      const userEmail = req.query?.email;
      if (tokenEmail !== userEmail) {
        return res.status(403).send({ message: "forbidden access" });
      }
      try {
        const review = req.body;
        if (!review || typeof review !== "object") {
          return res.status(400).send({ error: "Invalid review data" });
        }

        const result = await reviewsCollection.insertOne(review);
        console.log("Review saved successfully:", result.insertedId);
        res.status(201).send({
          message: "Review saved successfully",
          reviewId: result.insertedId,
        });
      } catch (error) {
        console.error("Error saving review:", error);
        res
          .status(500)
          .send({ error: "An error occurred while saving the review" });
      }
    });

    app.get("/reviews/:id", verifyToken, async (req, res) => {
      const tokenEmail = req.user?.email;
      const userEmail = req.query?.email;
      if (tokenEmail !== userEmail) {
        return res.status(403).send({ message: "forbidden access" });
      }
      try {
        const query = { universityId: req.params.id };
        const result = await reviewsCollection.find(query).toArray();
        res.send(result);
      } catch (error) {
        console.error("Error retrieving reviews:", error);
        res.status(500).send("Internal Server Error");
      }
    });

    app.get("/reviews/:id/average-rating", async (req, res) => {
      
      try {
        const scholarshipId = req.params.id;
        const query = { universityId: req.params.id };
    
        // Retrieve the scholarship document
        const reviews = await reviewsCollection.find(query).toArray();
    
        if (!reviews) {
          return res.status(404).send({ message: "Scholarship not found" });
        }
    
        // Calculate average rating
        
        let totalRating = 0;
        reviews.forEach(review => {
          totalRating += parseFloat(review.ratingPoint);
        });
    
        const averageRating = totalRating / reviews.length;
    
        res.send({ averageRating });
      } catch (error) {
        console.error("Error retrieving reviews:", error);
        res.status(500).send("Internal Server Error");
      }
    });

    app.get("/myReviews", verifyToken, async (req, res) => {
      const tokenEmail = req.user?.email;
      const userEmail = req.query?.email;
      if (tokenEmail !== userEmail) {
        return res.status(403).send({ message: "forbidden access" });
      }
      try {
        const query = {
          reviewerEmail: req.query.email,
        };
        const result = await reviewsCollection.find(query).toArray();
        res.send(result);
      } catch (error) {
        console.error("Error retrieving reviews:", error);
        res.status(500).send("Internal Server Error");
      }
    });
    app.get("/editApplication", verifyToken, async (req, res) => {
      const tokenEmail = req.user?.email;
      const userEmail = req.query?.email;
      if (tokenEmail !== userEmail) {
        return res.status(403).send({ message: "forbidden access" });
      }
      try {
        const query = {
          _id: new ObjectId(req.query.id),
        };
        const result = await applicationCollection.findOne(query);
        res.send(result);
      } catch (error) {
        console.error("Error retrieving reviews:", error);
        res.status(500).send("Internal Server Error");
      }
    });

    // Endpoint to update scholarship application
    app.put('/updateScholarApply/:id', verifyToken, async (req, res) => {
      const tokenEmail = req.user?.email;
      const userEmail = req.query?.email;
      if (tokenEmail !== userEmail) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const { id } = req.params;
      const query = { _id: new ObjectId(id) };
      const {
        phoneNumber,
        address,
        gender,
        degree,
        sscResult,
        hscResult,
        studyGap,
      } = req.body;
    
      try {
        // Check if application exists and its status is 'Pending'
        const application = await applicationCollection.findOne(query);
    
        if (!application) {
          return res.status(404).send({ message: 'Application not found' });
        }
    
        if (application.status !== 'Pending') {
          return res.status(400).send({ message: 'Application status is not Pending, cannot update' });
        }
    
        // Update application details
        const updatedApplication = await applicationCollection.updateOne(query, {
          $set: {
            phoneNumber,
            address,
            gender,
            degree,
            sscResult,
            hscResult,
            studyGap,
          },
        });
    
        if (updatedApplication.modifiedCount === 0) {
          return res.status(404).send({ message: 'Application not found or no changes applied' });
        }
    
        res.status(200).send({
          message: 'Application updated successfully',
          application: updatedApplication,
        });
      } catch (error) {
        console.error('Error updating application:', error);
        res.status(500).send({ error: 'Failed to update application' });
      }
    });

    app.delete("/deleteApplication/:id", verifyToken, async (req, res) => {
      const tokenEmail = req.user?.email;
      const userEmail = req.query?.email;
      if (tokenEmail !== userEmail) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };

      try {
        const result = await applicationCollection.deleteOne(query);
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: "An error occurred while deleting" });
      }
    });

    app.put("/updateReview/:id", verifyToken, async (req, res) => {
      const tokenEmail = req.user?.email;
      const userEmail = req.query?.email;
      if (tokenEmail !== userEmail) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const { id } = req.params;
      const query = { _id: new ObjectId(id) };
      const {
        ratingPoint,
        comments,
        reviewDate,
        scholarshipName,
        universityName,
        universityId,
        reviewerName,
        reviewerImage,
        reviewerEmail,
      } = req.body;
      
      console.log(universityName, scholarshipName, universityId);

      try {
        const updatedReview = await reviewsCollection.updateOne(query, {
          $set: {
            ratingPoint,
            comments,
            reviewDate,
            scholarshipName,
            universityName,
            universityId,
            reviewerName,
            reviewerImage,
            reviewerEmail,
          },
        });

        if (updatedReview.matchedCount === 0) {
          return res.status(404).json({ message: "Review not found" });
        }

        res.status(200).json({
          message: "Review updated successfully",
          review: updatedReview,
        });
      } catch (error) {
        console.error("Error updating review:", error);
        res
          .status(500)
          .json({
            message: "Failed to update review. Please try again later.",
          });
      }
    });

    app.delete("/deleteReview/:id", verifyToken, async (req, res) => {
      const tokenEmail = req.user?.email;
      const userEmail = req.query?.email;
      if (tokenEmail !== userEmail) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const { id } = req.params;
      const query = { _id: new ObjectId(id) };

      try {
        const deletedReview = await reviewsCollection.deleteOne(query);

        if (deletedReview.deletedCount === 0) {
          return res.status(404).json({ message: "Review not found" });
        }

        res.status(200).json({ message: "Review deleted successfully" });
      } catch (error) {
        console.error("Error deleting review:", error);
        res
          .status(500)
          .json({
            message: "Failed to delete review. Please try again later.",
          });
      }
    });

    app.post("/registerUser", async (req, res) => {
      const { email, name, photo } = req.body;

      try {
        // Check if user with the same email already exists
        const existingUser = await usersCollection.findOne({ email });

        if (existingUser) {
          return res.status(400).send("User with this email already exists");
        }

        const user = {
          email,
          name,
          photo,
          userRole: "user",
          createdAt: new Date(),
        };

        const result = await usersCollection.insertOne(user);

        if (!result.insertedId) {
          return res.status(500).send("Failed to register user");
        }

        res.status(201).send("User registered successfully");
      } catch (error) {
        console.error("Error registering user:", error);
        res
          .status(500)
          .send("Failed to register user. Please try again later.");
      }
    });

    app.post("/checkUserRole", verifyToken, async (req, res) => {
      const tokenEmail = req.user?.email;
      const userEmail = req.query?.email;
      if (tokenEmail !== userEmail) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const { email } = req.body;
      console.log(email);

      try {
        const user = await usersCollection.findOne({ email });
        console.log(user);
        if (!user) {
          return res.status(404).json({ message: "User not found" });
        }

        res.status(200).json({ role: user.userRole });
      } catch (error) {
        console.error("Error checking user role:", error);
        res
          .status(500)
          .json({
            message: "Failed to check user role. Please try again later.",
          });
      }
    });

    app.get("/users", verifyToken, async (req, res) => {
      const tokenEmail = req.user?.email;
      const userEmail = req.query?.email;
      if (tokenEmail !== userEmail) {
        return res.status(403).send({ message: "forbidden access" });
      }
      try {
        // Initialize filter based on query parameters
        const filter = {};

        // Check if filter by role is specified in query parameters
        if (req.query.role) {
          filter.userRole = req.query.role; // Assuming 'role' is the query parameter for filtering by user role
        }

        // Fetch users from MongoDB collection based on filter
        const result = await usersCollection.find(filter).toArray();

        // Send response with filtered users
        res.status(200).send(result);
      } catch (error) {
        console.error("Error fetching users:", error);
        res.status(500).send("Error fetching users");
      }
    });

    app.put("/updateScholarship/:id", verifyToken, async (req, res) => {
      const tokenEmail = req.user?.email;
      const userEmail = req.query?.email;
      if (tokenEmail !== userEmail) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const { id } = req.params;
      const scholarshipData = req.body;
      const query = { _id: new ObjectId(id) };
      console.log(scholarshipData);

      try {
        // Remove the _id field from the update data if present
        if (scholarshipData._id) {
          delete scholarshipData._id;
        }

        // Update scholarship in MongoDB
        const result = await scholarshipsCollection.updateOne(query, {
          $set: scholarshipData,
        });
        res.send(result);
      } catch (error) {
        console.error("Error updating scholarship:", error);
        res.status(500).send({ error: "Failed to update scholarship" });
      }
    });

    app.delete("/deleteScholarship/:id", verifyToken, async (req, res) => {
      const tokenEmail = req.user?.email;
      const userEmail = req.query?.email;
      if (tokenEmail !== userEmail) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const { id } = req.params;
      const query = { _id: new ObjectId(id) };

      try {
        const result = await scholarshipsCollection.deleteOne(query);

        if (result.deletedCount === 0) {
          return res.status(404).json({ message: "Scholarship not found" });
        }

        res.status(200).json({ message: "Scholarship deleted successfully" });
      } catch (error) {
        console.error("Error deleting scholarship:", error);
        res.status(500).json({ error: "Failed to delete scholarship" });
      }
    });

    app.get("/allReviews", verifyToken, async (req, res) => {
      const tokenEmail = req.user?.email;
      const userEmail = req.query?.email;
      if (tokenEmail !== userEmail) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const result = await reviewsCollection.find().toArray();
      res.send(result);
    });

    app.get("/allApplications", verifyToken, async (req, res) => {
      const tokenEmail = req.user?.email;
      const userEmail = req.query?.email;
      if (tokenEmail !== userEmail) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const { status } = req.query;
    
      try {
        let query = {};
    
        // If status is provided, filter based on status
        if (status) {
          query = { status: status };
        }
    
        const result = await applicationCollection.find(query).toArray();
        res.send(result);
      } catch (error) {
        console.error("Error fetching applications:", error);
        res.status(500).json({ error: "Failed to fetch applications" });
      }
    });
    

    app.put("/cancelApplication/:id", verifyToken, async (req, res) => {
      const tokenEmail = req.user?.email;
      const userEmail = req.query?.email;
      if (tokenEmail !== userEmail) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const { id } = req.params;
      try {
        const result = await applicationCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status: "Rejected" } }
        );
        res.send({
          message: `Application with id ${id} canceled successfully`,
        });
      } catch (error) {
        console.error("Error canceling application:", error);
        res.status(500).send({ error: "Failed to cancel application." });
      }
    });

    app.put('/approveApplication/:id', verifyToken, async (req, res) => {
      const tokenEmail = req.user?.email;
      const userEmail = req.query?.email;
      if (tokenEmail !== userEmail) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const { id } = req.params;
      try {
        const result = await applicationCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status: "Approved" } }
        );
    
        if (result.modifiedCount === 0) {
          return res.status(404).send({ error: `Application with id ${id} not found.` });
        }
    
        res.send({ message: `Application with id ${id} approved successfully` });
      } catch (error) {
        console.error('Error approving application:', error);
        res.status(500).send({ error: 'Failed to approve application.' });
      }
    });

    app.put("/submitFeedback/:id", verifyToken, async (req, res) => {
      const tokenEmail = req.user?.email;
      const userEmail = req.query?.email;
      if (tokenEmail !== userEmail) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const { id } = req.params;
      const { feedback, status } = req.body;
      try {
        const result = await applicationCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { feedback, status: status } },
          { upsert: true }
        );
        res.send({
          message: `Feedback submitted for application with id ${id}`,
        });
      } catch (error) {
        console.error("Error submitting feedback:", error);
        res.status(500).send({ error: "Failed to submit feedback." });
      }
    });

    app.put("/users/:userId/role", verifyToken, async (req, res) => {
      const tokenEmail = req.user?.email;
      const userEmail = req.query?.email;
      if (tokenEmail !== userEmail) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const { userId } = req.params;
      const { role } = req.body;

      try {
        const result = await usersCollection.updateOne(
          { _id: new ObjectId(userId) }, // Find user by _id (assuming using MongoDB ObjectId)
          { $set: { userRole: role } } // Update userRole field
        );

        if (result.modifiedCount === 1) {
          res.status(200).json({ message: "User role updated successfully" });
        } else {
          res
            .status(404)
            .json({ message: "User not found or role update failed" });
        }
      } catch (error) {
        console.error("Error updating user role:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    });

    app.post("/addScholarship", verifyToken, async (req, res) => {
      const tokenEmail = req.user?.email;
      const userEmail = req.query?.email;
      if (tokenEmail !== userEmail) {
        return res.status(403).send({ message: "forbidden access" });
      }
      try {
        const scholarshipData = req.body;

        const result = await scholarshipsCollection.insertOne(scholarshipData);

        res.status(201).send(result);
      } catch (error) {
        console.error("Error saving scholarship:", error);
        res.status(500).send({ error: "Failed to save scholarship" });
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
