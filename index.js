const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

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
    const userCollection = DB.collection("user");

    const VerifyToken = async (req, res, next) => {
      try {
        const authHeader = req.headers?.authorization;
        console.log(authHeader);
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
          return res.status(401).json({
            success: false,
            message: "Unauthorized access",
          });
        }

        const token = authHeader.split(" ")[1];
        console.log("our token", token);
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
        console.log(user);
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

        if (data.requester_id !== req.user._id.toString()) {
          return res.status(403).json({
            success: false,
            message: "Forbidden access",
          });
        }

        const donationRequest = {
          ...data,
          createdAt: new Date(),
        };

        const result = await DonationRequest.insertOne(donationRequest);

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

    app.get("/api/my-request", VerifyToken, async (req, res) => {
      try {
        if (req.query.id !== req.user._id.toString()) {
          return res.status(403).json({
            success: false,
            message: "Forbidden access",
          });
        }
        const query = {};
        if (req.query.id) {
          query.requester_id = req.query.id;
        }

        if (req.query.status) {
          query.status = req.query.status;
        }

        if (req.query.search) {
          query.$or = [
            {
              recipient_name: {
                $regex: req.query.search,
                $options: "i",
              },
            },
            {
              hospital_name: {
                $regex: req.query.search,
                $options: "i",
              },
            },
          ];
        }

        const page = Number(req.query.page) || 1;
        const limit = Number(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const result = await DonationRequest.find(query)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .toArray();

        const total = await DonationRequest.countDocuments(query);
        console.log(result);
        return res.status(200).json({
          success: true,
          data: result,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
            hasNext: page < Math.ceil(total / limit),
            hasPrev: page > 1,
          },
        });
      } catch (error) {
        console.error("Error fetching donation requests:", error);

        return res.status(500).json({
          success: false,
          message: "Internal server error",
        });
      }
    });

    app.patch("/api/my-request/:id", VerifyToken, async (req, res) => {
      try {
        if (req.query.id !== req.user._id.toString()) {
          return res.status(403).json({
            success: false,
            message: "Forbidden access",
          });
        }

        const id = new ObjectId(req.params.id);

        const data = {
          ...req.body,
          updatedAt: new Date(),
        };

        const result = await DonationRequest.updateOne(
          { _id: id },
          {
            $set: data,
          },
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({
            success: false,
            message: "Donation request not found",
          });
        }

        return res.status(200).json({
          success: true,
          message: "Donation request updated successfully",
        });
      } catch (error) {
        console.error("Error updating donation request:", error);

        return res.status(500).json({
          success: false,
          message: "Internal server error",
        });
      }
    });

    app.patch("/api/statusUpdate/:id", VerifyToken, async (req, res) => {
      try {
        if (
          req.user.role === "donor" &&
          req.query.id !== req.user._id.toString()
        ) {
          return res.status(403).json({
            success: false,
            message: "Forbidden access",
          });
        }

        const id = new ObjectId(req.params.id);

        const data = {
          ...req.body,
          updatedAt: new Date(),
        };

        const result = await DonationRequest.updateOne(
          { _id: id },
          {
            $set: data,
          },
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({
            success: false,
            message: "Donation request not found",
          });
        }

        return res.status(200).json({
          success: true,
          message: "Donation request updated successfully",
        });
      } catch (error) {
        console.error("Error updating donation request:", error);

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
    //await client.close();
  }
}
run().catch(console.dir);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
