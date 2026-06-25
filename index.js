const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");

const { MongoClient, ServerApiVersion } = require("mongodb");

dotenv.config();

const app = express();
const PORT = process.env.PORT;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.get("/", (req, res) => {
  res.send("Hello World!");
});

const uri = process.env.MONGODB_URI;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const DB = await client.db("BloodNet");
    const DonationRequest = DB.collection("DonationRequest");
    const Session = DB.collection("session");
    const user = DB.collection("user");

    const VerifyToken = async (req, res, next) => {
      try {
        const authHeader = req.headers?.authorization;

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
          return res.status(401).json({
            success: false,
            message: "Unauthorized access",
          });
        }

        const token = authHeader.split(" ")[1];

        if (!token) {
          return res.status(401).json({
            success: false,
            message: "Unauthorized access",
          });
        }

        const session = await Session.findOne({ token });

        if (!session) {
          return res.status(403).json({
            success: false,
            message: "Forbidden access",
          });
        }

        const user = await userCollection.findOne({
          _id: new ObjectId(session.userId),
        });

        if (!user) {
          return res.status(404).json({
            success: false,
            message: "User not found",
          });
        }

        req.user = user;

        next();
      } catch (error) {
        console.error("Error in verifyToken:", error);

        return res.status(500).json({
          success: false,
          message: "Internal server error",
        });
      }
    };
    const verifyAdmin = (req, res, next) => {
      if (req.user?.role !== "admin") {
        return res.status(403).json({
          success: false,
          message: "Admin access required",
        });
      }

      next();
    };
    const verifyVolunteer = (req, res, next) => {
      if (req.user?.role !== "volunteer") {
        return res.status(403).json({
          success: false,
          message: "Volunteer access required",
        });
      }

      next();
    };
    const verifyDonor = (req, res, next) => {
      if (req.user?.role !== "donor") {
        return res.status(403).json({
          success: false,
          message: "Donor access required",
        });
      }

      next();
    };

    app.post("/donation-request", VerifyToken, async (req, res) => {
      try {
        const data = req.body;

        // User can only create requests for themselves
        if (data.userId !== req.user._id.toString()) {
          return res.status(403).json({
            success: false,
            message: "Forbidden access",
          });
        }

        const result = await DonationRequest.insertOne(data);

        return res.status(201).json({
          success: true,
          message: "Donation request created successfully",
          insertedId: result.insertedId,
        });
      } catch (error) {
        console.error("Error creating donation request:", error);

        return res.status(500).json({
          success: false,
          message: "Internal server error",
        });
      }
    });
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } finally {
    // Ensures that the client will close when you finish/error
    await client.close();
  }
}
run().catch(console.dir);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
